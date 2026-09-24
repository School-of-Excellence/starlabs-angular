// Benchmark harness configuration.
// All volumes scale with SCALE (env). SCALE=1 => the full 20k/20 stress target.
// SCALE=0.05 => a ~1k smoke run (~30s seed) to validate the harness before the full run.
//
// Nothing here touches a real backend: the client SDK is pointed at the local
// Firestore emulator (see lib.mjs -> connectFirestoreEmulator). Restart the
// emulator for a clean slate (it is in-memory).

const SCALE = Number(process.env.SCALE ?? 1);

export const cfg = {
  scale: SCALE,

  // Emulator target. Must match `firebase emulators:start --project <projectId>`
  // and the app's dev projectId so the live dashboard and this harness agree.
  emulator: { host: process.env.FS_EMULATOR_HOST ?? '127.0.0.1', port: Number(process.env.FS_EMULATOR_PORT ?? 8080) },
  projectId: process.env.FS_PROJECT ?? 'starlabs-test',
  formsDatabaseId: 'firestore-forms', // named secondary DB the forms loader reads

  // ---- population (board-relevant: seeded at FULL scale) ----
  participants: Math.max(1, Math.round(20000 * SCALE)),
  coaches: Math.max(1, Math.round(20 * SCALE) || 20),
  pjpPerParticipant: 1.6,          // participantjourneyproduct docs / participant
  unassignedFraction: 0.10,        // share of pjp with no coachedby
  flaggedFraction: 0.08,           // share of participants flagged
  denseNotesFraction: 0.5,         // share whose metadata.notes.ahnotes is dense
  notesPerDense: 8,                // ahnotes array length for dense participants
  touchpointPerParticipant: 1.2,
  ticketsTotalPerParticipant: 1.75, // ~35k clientissue at 20k (board open-ticket counts)
  openTicketFraction: 0.35,

  // ---- drawer-only data: seeded at dense volume for a known exemplar subset ----
  // These collections are read one-participant-at-a-time on drawer open, never on
  // board load, so full-scale seeding is unnecessary. The first `denseExemplars`
  // participant ids (p_0 .. p_{n-1}) get full dense sub-data; bench/live-render
  // open these to measure worst-case drawer time.
  denseExemplars: Math.max(50, Math.round(2000 * SCALE)),
  dense: {
    events: 10,
    appointments: 6,
    forms: 12,
    interim: 4,
    ael: 6,
    breakthroughs: 3,
  },

  // reference collections
  eventsCount: 200,
  productsCount: 30,
  journeysCount: 50,

  // ---- bench knobs ----
  pageSize: 50,                    // board cursor page size (new path)
  inChunk: 30,                     // Firestore 'in' disjunction cap
  bandwidthsMbps: [8, 25, 80],     // network model applied to measured payload bytes
  drawerSamples: 20,               // how many dense drawers to time (averaged)
};

export const COL = {
  metadata: 'participant metadata',
  pjp: 'participantjourneyproduct',
  healthstate: 'healthtracker_healthstate',
  touchpoint: 'healthtracker_touchpoint',
  flag: 'healthtracker_flag',
  clientissue: 'clientissue',
  events: 'events',
  eventReq: 'event participation request',
  appointments: 'appointments',
  interim: 'interimreport log',
  achievements: 'Achievements/posts/postcollection',
  ael: 'participant AEL',
  usersRoles: 'users_roles',
  journey: 'journey',
  products: 'products',
  userData: 'user_data',
  formsByClient: 'formsByClient', // in the named forms DB
};

export const HEALTH_STATES = ['HAPPY', 'NEUTRAL', 'UNHAPPY', 'AT_RISK', 'CRITICAL', 'NOT_ASSESSED'];
export const TICKET_CATEGORIES = ['Technical', 'Billing', 'Content', 'Scheduling', 'Account', 'Other'];
export const JOURNEY_STATUSES = ['Initiated', 'Active', 'Completed', 'initiated'];
