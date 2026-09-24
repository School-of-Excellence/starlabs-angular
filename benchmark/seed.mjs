// Seeds the emulator with the 20k/20 dataset (scaled by SCALE).
// Board-relevant collections at full scale; drawer-only collections at dense
// volume for the first `denseExemplars` participants.
//
//   firebase emulators:start --only firestore --project starlabs-test   (separate terminal)
//   SCALE=0.05 node benchmark/seed.mjs     # ~1k smoke run first
//   node benchmark/seed.mjs                # full 20k run
//
// Restart the emulator between runs for a clean slate (it is in-memory).

import { cfg, COL, HEALTH_STATES, TICKET_CATEGORIES, JOURNEY_STATUSES } from './config.mjs';
import {
  db, formsDb, Batcher, doc, collection, pid, coachPid, isDense,
  name, pick, int, chance, daysAgo, futureDays, Timestamp, now, fmtMs,
} from './lib.mjs';

// ---- text pools (no emojis) ----
const NOTE_TEXT = [
  'Strong momentum this week, completed the evolution module.',
  'Missed last two sessions, needs a re-engagement call.',
  'Renewal conversation started, leaning positive.',
  'Stuck on the crossover metric, scheduled a 1:1.',
  'Big breakthrough on the legacy outcome, very motivated.',
  'Financial hold flagged, finance team looping in.',
  'Quiet for 3 weeks, attempting contact.',
  'Asked for additional resources on time compression.',
];
const TICKET_SUBJ = ['Login issue', 'Payment not reflecting', 'Cannot access recording', 'Reschedule request', 'Profile update', 'Certificate request'];
const FORM_NAMES = ['Onboarding Intake', 'Weekly Reflection', 'Evolution Checkpoint', 'AEL Crossover', 'Feedback Survey', 'Goal Setting'];

const t0 = now();
const P = cfg.participants, C = cfg.coaches;
console.log(`[seed] SCALE=${cfg.scale}  participants=${P}  coaches=${C}  denseExemplars=${cfg.denseExemplars}`);
console.log(`[seed] emulator ${cfg.emulator.host}:${cfg.emulator.port}  project=${cfg.projectId}`);

const b = new Batcher(db);
const fb = formsDb ? new Batcher(formsDb) : null;
const coachIds = Array.from({ length: C }, (_, i) => coachPid(i));

// ---- reference collections ----
for (let i = 0; i < cfg.journeysCount; i++) await b.set(doc(db, COL.journey, `j_${i}`), { id: `j_${i}`, name: `Journey ${i + 1}` });
for (let i = 0; i < cfg.productsCount; i++) await b.set(doc(db, COL.products, `prod_${i}`), { id: `prod_${i}`, product: `Product ${i + 1}` });
for (let i = 0; i < cfg.eventsCount; i++) {
  await b.set(doc(db, COL.events, `ev_${i}`), { id: `ev_${i}`, name: `Workshop ${i + 1}`, start_date: chance(0.5) ? daysAgo(int(1, 200)) : futureDays(int(1, 120)) });
}

// ---- coaches: users_roles + a participant-metadata doc (so note authors resolve) ----
for (let i = 0; i < C; i++) {
  const cid = coachPid(i), cn = name();
  await b.set(doc(db, COL.usersRoles, cid), { profileid: cid, name: cn, journeycoach: true });
  await b.set(doc(db, COL.metadata, cid), { profileid: cid, name: cn, mode: 'Coach' });
}

// ---- participants ----
let pjpTotal = 0, ticketTotal = 0, tpTotal = 0, drawerTotal = 0;
for (let i = 0; i < P; i++) {
  const id = pid(i);
  const coachAssigned = chance(cfg.unassignedFraction) ? null : pick(coachIds);

  // participant metadata (doc id = profileid), with dense coach notes for a fraction
  const ahnotes = [];
  if (chance(cfg.denseNotesFraction)) {
    for (let n = 0; n < cfg.notesPerDense; n++) {
      ahnotes.push({ givenby: pick(coachIds), ahnotes: pick(NOTE_TEXT), date: daysAgo(int(1, 300)) });
    }
  }
  await b.set(doc(db, COL.metadata, id), {
    profileid: id, name: name(), mode: 'Participant',
    activejourney: `j_${int(0, cfg.journeysCount - 1)}`,
    activeproduct: [`prod_${int(0, cfg.productsCount - 1)}`],
    notes: { ahnotes },
  });

  // participantjourneyproduct (~1.6 each)
  const nPjp = chance(cfg.pjpPerParticipant - 1) ? 2 : 1;
  for (let k = 0; k < nPjp; k++) {
    await b.set(doc(collection(db, COL.pjp)), {
      profileid: id, coachedby: coachAssigned,
      journeystatus: pick(JOURNEY_STATUSES), onboarded: chance(0.7),
      product: `prod_${int(0, cfg.productsCount - 1)}`, journey: `j_${int(0, cfg.journeysCount - 1)}`,
    });
    pjpTotal++;
  }

  // health state (1 each)
  await b.set(doc(collection(db, COL.healthstate)), {
    profileid: id, state: pick(HEALTH_STATES), healthstate: pick(HEALTH_STATES), created: daysAgo(int(0, 90)),
  });

  // touchpoints (~1.2 each)
  const nTp = chance(cfg.touchpointPerParticipant - 1) ? 2 : 1;
  for (let k = 0; k < nTp; k++) {
    await b.set(doc(collection(db, COL.touchpoint)), {
      profileid: id, logdate: daysAgo(int(0, 120)), touchpointdate: daysAgo(int(0, 120)),
      notes: pick(NOTE_TEXT), type: pick(['call', 'message', 'meeting']),
    });
    tpTotal++;
  }

  // flag (subset)
  if (chance(cfg.flaggedFraction)) {
    await b.set(doc(collection(db, COL.flag)), { profileid: id, flagged: true, note: 'follow up', by: pick(coachIds), at: daysAgo(int(0, 30)) });
  }

  // tickets (~1.75 each, board open-ticket counts depend on this at full scale)
  const nTickets = chance(cfg.ticketsTotalPerParticipant - 1) ? 2 : 1;
  for (let k = 0; k < nTickets; k++) {
    const open = chance(cfg.openTicketFraction);
    await b.set(doc(collection(db, COL.clientissue)), {
      clientid: id, status: { status: open ? 'Open' : 'Closed' },
      category: pick(TICKET_CATEGORIES), subject: pick(TICKET_SUBJ), date: daysAgo(int(0, 200)),
    });
    ticketTotal++;
  }

  // ---- dense drawer-only sub-data for exemplars ----
  if (isDense(i)) {
    for (let k = 0; k < cfg.dense.events; k++) {
      await b.set(doc(collection(db, COL.eventReq)), {
        profileid: id, eventref: doc(db, COL.events, `ev_${int(0, cfg.eventsCount - 1)}`),
        createdon: daysAgo(int(1, 220)), attended: chance(0.6), status: pick(['attended', 'registered', 'no_show']),
        queuestartdate: daysAgo(int(1, 220)),
      });
      drawerTotal++;
    }
    for (let k = 0; k < cfg.dense.appointments; k++) {
      await b.set(doc(collection(db, COL.appointments)), {
        bookedby: doc(db, COL.userData, id), starttime: chance(0.5) ? daysAgo(int(1, 120)) : futureDays(int(1, 60)),
        status: pick(['completed', 'ongoing', 'cancelled']), name: 'Coaching session',
      });
      drawerTotal++;
    }
    for (let k = 0; k < cfg.dense.interim; k++) {
      await b.set(doc(collection(db, COL.interim)), {
        profileid: id, types: pick(['crossover', 'evolutionprogress', 'loveletter', 'askah']),
        status: pick(['filled', 'pending']), lastupdate: daysAgo(int(1, 150)), reporteddate: daysAgo(int(1, 150)),
      });
      drawerTotal++;
    }
    for (let k = 0; k < cfg.dense.ael; k++) {
      await b.set(doc(collection(db, COL.ael)), { profileid: id, status: pick(['Active', 'Completed', 'In Progress']), created: daysAgo(int(1, 200)) });
      drawerTotal++;
    }
    for (let k = 0; k < cfg.dense.breakthroughs; k++) {
      await b.set(doc(collection(db, COL.achievements)), { profileid: id, postmessage: pick(NOTE_TEXT), created: daysAgo(int(1, 250)) });
      drawerTotal++;
    }
    if (fb) {
      for (let k = 0; k < cfg.dense.forms; k++) {
        await fb.set(doc(collection(formsDb, COL.formsByClient)), { profileid: id, formname: pick(FORM_NAMES), date: daysAgo(int(1, 220)) });
        drawerTotal++;
      }
    }
  }

  if ((i + 1) % 2000 === 0) console.log(`[seed] participants ${i + 1}/${P}  (pjp ${pjpTotal}, tickets ${ticketTotal}, drawer ${drawerTotal})`);
}

await b.flush();
if (fb) await fb.flush();

const total = b.total + (fb ? fb.total : 0);
console.log(`[seed] done in ${fmtMs(now() - t0)}`);
console.log(`[seed] docs written: ${total}  (pjp ${pjpTotal}, healthstate ${P}, touchpoint ${tpTotal}, tickets ${ticketTotal}, drawer-dense ${drawerTotal})`);
console.log(`[seed] dense exemplar ids: p_0 .. p_${cfg.denseExemplars - 1}`);
process.exit(0);
