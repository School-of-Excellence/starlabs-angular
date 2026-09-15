// @ts-nocheck — dashboard script ported from interim-report-dashboard (8).html.
// DOM lookups and listeners are scoped to the component shadow root instead of `document`.
// Real data (plan specs/plans/2026-09-11-interim-dashboard-crossover.md): the summary strip and
// the Crossover Meter read the pool `api.load()` returns (interimreport log + interim crossover).
// Evolution Progress, Love Letter, Asks and By participant still use the file's seeded mock data.

// the life areas stored in interim crossover.metric / participant AEL.crossovermetric
export const CROSSOVER_AREAS = ['Business', 'Career', 'Family', 'Health', 'Personal Genius'];

// interim evolutionprogress.adjustments[].sliderValue — the Flutter app stores these strings as-is
export const EVO_RESULT_OF: Record<string, string> = {
  'No Change': 'none', 'Somewhat Change': 'some', 'Changed': 'lot',
  'Changed and Improving': 'lotimp', 'Completely Changed': 'full',
};

export interface InterimDashboardApi {
  load(from: Date | null, to: Date | null): Promise<any[]>;
  /** the single Material date range picker lives in the component, which owns the dates */
  getRange(): { from: Date | null; to: Date | null };
  /** back to the default range; the component re-renders through refresh() */
  resetRange(): void;
}

export function mountInterimReportDashboard(root: ShadowRoot, api: InterimDashboardApi): { refresh(): void } {
  /* ============================================================
     DATA
     ------------------------------------------------------------
     Participants are generated per send with a seeded RNG, so the
     roll-ups and every drill-down are the same data. Member counts
     for the July 2026 send come from the "uP! July 2026 list" tab.
     ============================================================ */

  const AREAS = CROSSOVER_AREAS;

  // Accelerated Evolution Levels — 1 is the highest rung, 11 the lowest
  const AEL_LEVELS = [
    ['Legendary','Greater Legendary'], ['Taste of Legendary','Legendary'],
    ['Evolving Excellence','Taste of Legendary'], ['Sustained Excellence','Evolving Excellence'],
    ['Excellence','Sustained Excellence'], ['Sustained Accelerated Success','Excellence'],
    ['Accelerated Success','Sustained Accelerated Success'], ['Stable','Accelerated Success'],
    ['Just out of Crisis','Stability'], ['Crisis','Just out of Crisis'],
    ['Accelerated Downfall','Crisis']
  ];
  const levelName = n => AEL_LEVELS[n - 1][0] + ' → ' + AEL_LEVELS[n - 1][1];

  const LETTER_TEXTS = [
    'I stopped bracing before every hard conversation. My daughter noticed before I did. She asked why I seemed less tired. I did not have an answer for her but I knew exactly what she meant.',
    'Something shifted at the event and for about ten days it held. Then work got heavy and I lost it. I do not know how to get back to that state on my own and I did not want to say that on a group call.',
    'Two things I had carried for eleven years are simply not there any more. Not managed. Not suppressed. Gone. I keep checking for them the way you check a tooth that used to hurt.',
    'I want to bring my whole leadership team into this. Seven people. Who do I talk to about how that would work?',
    'I have not been able to do the procedures at all this cycle. Every time I sit down to start, something in me refuses. I feel like I am falling behind everyone else and I have not told anyone.',
    'The decision drill is the one that changed my week. I used to sit on things for four days. Now I decide the same day and I have not regretted one of them yet.',
    'I did not expect the health area to move. I did not even work on it. It moved anyway, which tells me something I have not fully understood yet.',
    'Is there a version of this for my father? He is 71 and I think he would take it seriously now in a way he would not have ten years ago.',
    'My wife said last week that I have stopped arguing to win. I had not noticed. That is probably the whole point.',
    'I am grateful, and also a bit unsettled. The person who came back is not quite the person who went.'
  ];

  const INST_ASKS = [
    'Can the anchor be installed for public speaking as well, or does that need a separate procedure?',
    'The state install works but fades by the afternoon. Can it be reinforced?',
    'I would like the recovery loop installed for setbacks at home, not only at work.',
    'Can I get the presence install strengthened before my board meeting in November?',
    'Is there an installation for holding silence without discomfort?'
  ];

  const AH_ASKS = [
    'How do I keep this from sliding back when work gets heavy?',
    'My team does not work this way. Do I change the team or change my approach?',
    'Is it normal that one area moved a lot and the rest did not move at all?',
    'I am past the threshold but have no diagnostics yet — what should I do first?',
    'How do I know when I am ready for the next level rather than repeating this one?',
    'What do I do with the people who liked the old version of me better?'
  ];

  const FIRST = ['Ananya','Dev','Meera','Rahul','Kavya','Vikram','Sneha','Arjun','Divya','Nikhil',
    'Priya','Aditya','Lakshmi','Karan','Ritu','Sanjay','Neha','Vivek','Shalini','Manoj','Tara',
    'Harish','Ishita','Rohan'];
  const LAST = ['Raghavan','Menon','Suresh','Iyer','Nair','Desai','Pillai','Rao','Krishnan','Varma',
    'Shankar','Bose','Iyengar','Mehta','Chandran','Gopal','Bhatt','Anand','Reddy','Kurian','Joshi',
    'Balan','Sen','Kamath'];

  const FLAGS = ['Happy','Needs Attention','Opportunity','Critical'];
  const FLAG_TONE = { Happy:'green', 'Needs Attention':'amber', Opportunity:'blue', Critical:'red' };
  // the exact option labels the participant sees in the app (Flutter EvolutionProgress.options)
  const RESULTS = {
    none:  ['No Change','grey'],
    some:  ['Somewhat Change','amber'],
    lot:   ['Changed','blue'],
    lotimp:['Changed and Improving','teal'],
    full:  ['Completely Changed','green']
  };
  const RES_KEYS = ['none','some','lot','lotimp','full'];

  /* the sub-question the app asks when they mark an adjustment "No change yet" */
  const NC_OPTS = ['Less Intensity','Less Frequency','No noticeable improvement in performance'];
  const LIFE_TO = 80;

  /* the optional note on the level-change sheet */
  const LVL_NOTES = [
    'This moved much faster than I expected. The old level does not describe me any more.',
    'I crossed over in this area at the event and it has held since.',
    'My team noticed before I did. Moving it up.',
    'The procedures did what they were meant to do here.',
    'I set the goal before the event and it is already behind me.',
    'This is the first area where I stopped having to try.'
  ];

  /* letters tagged Needs Attention or Critical are routed to Journey Coaching */
  const ESC_STATUS = ['Open','In progress','Resolved'];
  const ESC_TONE = { Open:'amber', 'In progress':'blue', Resolved:'green' };
  const COACHES = ['Meera Nair','Arjun Rao','Divya Menon','Karan Bhatt','Ritu Sen','Sanjay Gopal'];
  const POSITIVE = ['Happy','Opportunity'];        // where a resolved letter can be moved
  const ESC_SUMMARY = [
    'Two calls. The block was a schedule problem, not a capability one.',
    'Talked through the setback. They had already recovered and had not noticed.',
    'Walked the procedure end to end with them on the call.',
    'They needed permission to go slower for one cycle. Given.',
    'The ask underneath was about their team, not about them.'
  ];
  const ESC_NOTES = [
    'Called on 22 Aug. Back on the daily procedure and paired with a peer.',
    'Booked into the next Legacy Consultation slot.',
    'Two check-in calls done. Participant is steady again.',
    'Handed to Antano for the group call. Participant informed.',
    'Escalated to Harini. Waiting on a slot.',
    'Reframed the block on call. Will review in two weeks.'
  ];
  /* what the coaches log against an escalation — Call, Schedule or Note */
  const CALL_OUTCOMES = ['Connected', 'No answer', 'Call back later'];
  const LOG_CALLS = [
    'Spoke for twenty minutes. The procedure holds in the morning and fades by evening.',
    'First call. Listened more than I talked. Agreed to speak again this week.',
    'Steadier than the letter suggested. The block is about time, not ability.',
    'Walked the daily procedure end to end with them on the call.',
    'Good call. They have already made one change on their own.'
  ];
  const LOG_NOANSWER = [
    'No answer. Sent a WhatsApp to find a better time.',
    'Tried twice, no answer. Will try again tomorrow morning.'
  ];
  const LOG_SCHED = [
    'Follow-up call to review the week.',
    'Booked a 30-minute check-in.',
    'Session to walk through the procedure again.'
  ];
  const LOG_NOTES = [
    'Read the letter twice. The concern is about their team, not about them.',
    'Flagged to Harini for the next group call.',
    'Prefers WhatsApp over calls. Keep messages short.',
    'Paired with a peer from the same cohort.'
  ];
  const LOG_TIMES = ['10:00 AM', '11:30 AM', '4:00 PM', '6:30 PM'];

  /* on its own seed, so the rest of the data stays put */
  function logsOf(uid, e){
    const r = rng(seedOf(uid + '|log'));
    const n = e.status === 'Open' ? (r() < .55 ? 0 : 1)
            : e.status === 'In progress' ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3);
    const who = e.owner || pick(r, COACHES);
    const pickedUp = e.on ? parseInt(e.on, 10) : 0;          // an August day
    const out = [];
    for(let k = 0; k < n; k++){
      const on = e.status === 'Open' ? new Date(2026, 8, 1 + Math.floor(r() * 7))
               : e.status === 'Resolved' ? new Date(2026, 7, pickedUp - 2 * (n - 1 - k))
               : new Date(2026, 7, pickedUp + 2 * k);
      let log;
      if(e.status === 'Open')
        log = r() < .5 ? { type:'Call', outcome:'No answer', text:pick(r, LOG_NOANSWER) }
                       : { type:'Note', text:pick(r, LOG_NOTES) };
      else if(k === 0) log = { type:'Call', outcome:'Connected', text:pick(r, LOG_CALLS) };
      else {
        const q = r();
        if(q < .4){
          const d = new Date(on); d.setDate(d.getDate() + 3 + Math.floor(r() * 4));
          log = { type:'Schedule', when:`${fmtDate(d)}, ${pick(r, LOG_TIMES)}`, text:pick(r, LOG_SCHED) };
        } else if(q < .75) log = { type:'Call', outcome:'Connected', text:pick(r, LOG_CALLS) };
        else log = { type:'Note', text:pick(r, LOG_NOTES) };
      }
      out.push({ ...log, by:who, on });
    }
    return out;
  }

  const REPLY_TEXTS = [
    'Yes, that can be extended. We have added it to your next consultation agenda.',
    'Reinforcement is a short procedure. Your JC will walk you through it this week.',
    'Antano will take this one on the group call. Nothing to do until then.',
    'This is normal at your stage. Keep going and we will review it at the next event.'
  ];

  const SENDS = [
    { id:'s1', date:'14 Aug 2026', day:'THU', name:'Interim Report',
      event:'uP! Live Event — July 2026', journey:'uP!', members:532, submitted:388, opened:486, status:'Open' },
    { id:'s2', date:'09 Sep 2026', day:'WED', name:'Interim Report',
      event:'B!G Accelerator — August 2026', journey:'B!G', members:86, submitted:22, opened:61, status:'Open' },
    { id:'s3', date:'12 Mar 2026', day:'THU', name:'Interim Report',
      event:'uP! Live Event — February 2026', journey:'uP!', members:498, submitted:351, opened:441, status:'Closed' },
    { id:'s4', date:'18 Oct 2025', day:'SAT', name:'Interim Report',
      event:'uP! Live Event — September 2025', journey:'uP!', members:471, submitted:402, opened:438, status:'Closed' }
  ];

  /* ============================================================
     PARTICIPANT GENERATION (seeded, so views agree)
     ============================================================ */
  function rng(seed){ let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const seedOf = s => [...s].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7);

  const CACHE = {};
  function peopleOf(send){
    if(CACHE[send.id]) return CACHE[send.id];
    const r = rng(seedOf(send.id));
    const out = [];
    for(let i = 0; i < send.members; i++){
      const submitted = i < send.submitted;
      const opened = i < send.opened;
      const nm = FIRST[(i * 7 + 3) % FIRST.length] + ' ' + LAST[(i * 11 + 5) % LAST.length];
      // 9% have no AEL for this event → Crossover skipped for them
      const noAel = r() < 0.09;
      const cross = {};
      AREAS.forEach(a => {
        if(!submitted || noAel){ cross[a] = null; return; }
        // slight skew toward 5–8
        const roll = Math.round(1 + r() * 4.6 + r() * 4.6);
        cross[a] = r() < .06 ? null : Math.min(10, Math.max(1, roll));
      });
      const declared = {};
      AREAS.forEach(a => declared[a] = 4 + Math.floor(r() * 5));

      // level 1 is the top rung and 11 the bottom, so a smaller number is an upgrade.
      // At 8 and above the app offers the jump to a higher goal.
      const levelChanges = [];
      AREAS.forEach(a => {
        const v = cross[a];
        if(!submitted || v === null || v < 8 || r() >= .45) return;
        const to = Math.max(1, declared[a] - 1 - Math.floor(r() * 2));
        if(to !== declared[a]) levelChanges.push({ area:a, from:declared[a], to,
          note: r() < .35 ? pick(r, LVL_NOTES) : '' });
      });

      // personalised ATC — the adjustment text is confidential and never leaves the app,
      // so the dashboard carries the OUTCOME only
      const n = 3 + Math.floor(r() * 4);
      const adjs = [];
      for(let k = 0; k < n; k++){
        let res = null, nc = null, hours = 0, per = null;
        if(submitted && r() > .07){
          const q = r();
          res = q < .18 ? 'none' : q < .40 ? 'some' : q < .62 ? 'lot' : q < .80 ? 'lotimp' : 'full';
          if(res === 'none') nc = Math.floor(r() * NC_OPTS.length);
          else { per = r() < .35 ? 'day' : 'week';
                 hours = per === 'day' ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 8); }
        }
        adjs.push({ res, nc, hours, per, prev: r() < .15 });
      }

      const age = 32 + Math.floor(r() * 22);
      const wroteLetter = submitted && r() < .61;
      const flagRoll = r();
      const flag = wroteLetter ? (flagRoll < .58 ? 'Happy' : flagRoll < .72 ? 'Needs Attention'
            : flagRoll < .82 ? 'Opportunity' : flagRoll < .85 ? 'Critical' : null) : null;

      // Needs Attention and Critical are routed to the Journey Coaching dashboard,
      // which sends the progress back here
      let esc = null, flagNow = flag;
      if(flag === 'Needs Attention' || flag === 'Critical'){
        const q = r();
        const status = q < .38 ? 'Resolved' : q < .74 ? 'In progress' : 'Open';
        esc = { from:flag, status,
          owner: status === 'Open' ? null : pick(r, COACHES),
          on:    status === 'Open' ? null : (18 + Math.floor(r() * 11)) + ' Aug 2026',
          note:  status === 'Open' ? '' : pick(r, ESC_NOTES),
          summary: status === 'Open' ? '' : pick(r, ESC_SUMMARY),
          movedTo: null };
        esc.logs = logsOf(`${send.id}-${i}`, esc);
        // some resolved letters have already been moved to a positive category
        if(status === 'Resolved' && r() < .45){
          esc.movedTo = pick(r, POSITIVE);
          flagNow = esc.movedTo;
        }
      }

      const instAsk = submitted && r() < .28 ? pick(r, INST_ASKS) : null;
      const ahAsk   = submitted && r() < .34 ? pick(r, AH_ASKS) : null;
      const reply = () => ({ text: pick(r, REPLY_TEXTS), by: pick(r, COACHES),
                             on: (20 + Math.floor(r() * 9)) + ' Aug 2026' });

      out.push({
        i, uid:`${send.id}-${i}`, sendId:send.id, sendDate:send.date, sendEvent:send.event,
        nm, age, submitted, opened, noAel, cross, declared, adjs, levelChanges,
        journey: send.journey === 'uP!' ? (r() < .12 ? 'LYL' : r() < .06 ? 'B!G' : 'uP!') : send.journey,
        upCount: upCountOf(`${send.id}-${i}`),
        category: categoryOf(`${send.id}-${i}`, dateOf(send)),
        letter: wroteLetter ? pick(r, LETTER_TEXTS) : null, flag:flagNow, esc,
        instAsk, ahAsk,
        instReply: instAsk && r() < .42 ? reply() : null,
        ahReply:   ahAsk   && r() < .38 ? reply() : null
      });
    }
    CACHE[send.id] = out;
    out.forEach(p => PERSON[p.uid] = p);
    return out;
  }
  const PERSON = {};

  /* the uP! Live the member belongs to — never later than the send itself.
     On its own seed, like uP! count, so the rest of the data stays put. */
  const CATEGORIES = [
    { name:'uP! Live July 2026', on:new Date(2026, 6, 1) },
    { name:'uP! Live Jan 2026',  on:new Date(2026, 0, 1) },
    { name:'uP! Live July 2025', on:new Date(2025, 6, 1) },
    { name:'uP! Live Jan 2025',  on:new Date(2025, 0, 1) },
    { name:'uP! Live July 2024', on:new Date(2024, 6, 1) }
  ];
  function categoryOf(uid, sentOn){
    const ok = CATEGORIES.filter(c => c.on <= sentOn);
    const w = [.45, .25, .15, .10, .05].slice(0, ok.length), tot = sum(w);
    let q = rng(seedOf(uid + '|cat'))() * tot;
    for(let k = 0; k < ok.length; k++){ q -= w[k]; if(q < 0) return ok[k].name; }
    return ok[ok.length - 1].name;
  }

  /* how many uP! events the member has attended — on its own seed so the rest of the data stays put */
  function upCountOf(uid){
    const q = rng(seedOf(uid + '|up'))();
    return q < .42 ? 1 : q < .66 ? 2 : q < .80 ? 3 : q < .90 ? 4 : q < .96 ? 5 : 6;
  }

  /* ============================================================
     WHAT THE FILTERS SELECT
     Start / end date, journey, event and participant all narrow it.
     Everything on the page reads through sendsInRange / peopleFor.
     ============================================================ */
  const TODAY = new Date();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateOf = s => { const [d, m, y] = s.date.split(' ');
    return new Date(+y, MONTHS.indexOf(m), +d); };

  /* start and end date — defaults to the last 12 months */
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = v => { if(!v) return null; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const DEF_TO = isoOf(TODAY);
  const DEF_FROM = (() => { const d = new Date(TODAY); d.setDate(d.getDate() - 365); return isoOf(d); })();

  function rangeDates(){
    let { from, to } = api.getRange();
    if(from && to && from > to) [from, to] = [to, from];
    return { from, to };
  }
  function rangeLabel(){
    const { from, to } = rangeDates();
    if(from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
    if(from) return `From ${fmtDate(from)}`;
    if(to) return `Up to ${fmtDate(to)}`;
    return 'All time';
  }

  function sendsInRange(){
    const ev = $('fEvent').value, { from, to } = rangeDates();
    return SENDS.filter(s => (!ev || s.event === ev)
      && (!from || dateOf(s) >= from) && (!to || dateOf(s) <= to));
  }

  const nameQ = () => ($('fWho') ? $('fWho').value.trim().toLowerCase() : '');

  /* journey */
  const JOURNEYS = ['uP!', 'LYL', 'B!G'];
  const journeyQ = () => ($('fJourney') ? $('fJourney').value : '');

  /* the pooled, filtered set behind the overview — 'range' is the whole selection */
  function peopleFor(id){
    const q = nameQ(), j = journeyQ();
    const base = id === 'range'
      ? sendsInRange().flatMap(peopleOf)
      : peopleOf(SENDS.find(x => x.id === id));
    return base.filter(p => (!q || p.nm.toLowerCase().includes(q))
      && (!j || p.journey === j));
  }

  /* a send-shaped object for the whole range, so every panel can stay as it is */
  function sendById(id){
    if(id !== 'range') return SENDS.find(x => x.id === id);
    const list = sendsInRange(), P = peopleFor('range');
    return { id:'range', date:rangeLabel(), name:'Interim Report',
      event: list.length === 1 ? list[0].event : `${list.length} sends`,
      members:P.length, submitted:P.filter(p => p.submitted).length,
      opened:P.filter(p => p.opened).length,
      status: list.some(x => x.status === 'Open') ? 'Open' : 'Closed' };
  }

  /* ============================================================
     REAL DATA — summary strip + Crossover Meter
     The component loads interimreport log (createdon in the date range) and the
     latest interim crossover per log. Only the name filter applies: journey and
     event have no source in interimreport log yet, so they do not narrow it.
     ============================================================ */
  let REAL = null, realKey = null, realErr = '';
  function ensureReal(){
    const { from, to } = rangeDates();
    const key = `${from ? from.getTime() : ''}|${to ? to.getTime() : ''}`;
    if(key === realKey) return;
    realKey = key; REAL = null; realErr = '';
    api.load(from, to)
      .then(list => { if(key === realKey){ REAL = list; renderAll(); } })
      .catch(err => { if(key === realKey){ realErr = String((err && err.message) || err); REAL = []; renderAll(); } });
  }
  const realPool = () => { const q = nameQ();
    return (REAL || []).filter(p => !q || p.nm.toLowerCase().includes(q)); };
  /* every section (Crossover, By participant, their lists) leaves out Not started members —
     only ongoing or submitted reports. The summary strip still counts everyone. */
  const sectionPool = () => realPool().filter(p => p.opened || p.submitted);
  const realSend = () => ({ id:'range', date:rangeLabel(), event:'Interim reports' });
  /* what each member has done, straight from interimreport log.reports */
  const STEP_KEYS = ['crossover', 'evolutionprogress', 'loveletter', 'askah'];
  const realStatusCells = p => [statusPill(p),
    ...STEP_KEYS.map(k => (p.reports || []).includes(k) ? '<span class="mt-ok">✓ Done</span>' : DASH)];

  /* love letter / ask AH tags — read-only here; the Love Letter / Ask A&H tabs change them */
  const TAG_KEY = { Happy:'happy', 'Needs Attention':'attention', Opportunity:'opportunity', Critical:'critical' };
  const tagList = t => FLAGS.filter(f => t[TAG_KEY[f]]);
  const tagPills = t => (tagList(t).length
      ? tagList(t).map(f => `<span class="pill ${FLAG_TONE[f]}">${f}</span>`).join(' ')
      : '<span class="pill grey">Untagged</span>')
    + (t.resolved ? ' <span class="pill teal">Resolved</span>' : '');
  const resolvedLine = t => t.resolved
    ? `<div class="rn" style="margin-top:8px">Resolved${t.resolvedBy ? ` by <b>${escHtml(t.resolvedBy)}</b>` : ''}${
        t.resolvedOn ? ' · ' + fmtDate(t.resolvedOn) : ''}</div>` : '';

  /* ============================================================
     HELPERS
     ============================================================ */
  const $ = id => root.getElementById(id);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
  function shade(n, max){
    if(!n) return 'background:#F6F8F8;color:#B9C2C6';
    const t = Math.min(1, n / max);
    return `background:rgba(47,95,219,${(0.08 + t * 0.80).toFixed(3)});color:${t > .45 ? '#fff' : '#25405F'}`;
  }
  /* Evolution Progress is read by participant, not by adjustment. A member is filed
     under the outcome they gave most often (a tie goes to the lower outcome) and then
     by how much of their own ATC carries it, so each member sits in exactly one cell. */
  const answeredOf = p => p.adjs.filter(a => a.res).length;
  const countOf = (p, k) => p.adjs.filter(a => a.res === k).length;
  const shareOf = (p, k) => Math.round(countOf(p, k) / answeredOf(p) * 100);
  const strongestOf = p => {
    let best = 'none', n = -1;
    RES_KEYS.forEach(k => { const c = countOf(p, k); if(c > n){ n = c; best = k; } });
    return best;
  };
  const EBANDS = [
    { k:'q1', label:'A quarter',  sub:'1–25%',   lo:1,  hi:25  },
    { k:'q2', label:'Up to half', sub:'26–50%',  lo:26, hi:50  },
    { k:'q3', label:'Most of it', sub:'51–75%',  lo:51, hi:75  },
    { k:'q4', label:'Nearly all', sub:'76–100%', lo:76, hi:100 }
  ];
  const bandOf = share => EBANDS.find(b => share >= b.lo && share <= b.hi);
  const RES_HEX = { none:'#98A5AB', some:'#D97706', lot:'#2F5FDB', lotimp:'#0E8C8C', full:'#1B8A5A' };

  // same formula the app uses: savedYears = HoursSavedPerDay * (80 - age) / 24
  const hoursPerDayOf = p => p.adjs.reduce((t, a) =>
    (!a.res || a.res === 'none') ? t : t + (a.per === 'day' ? a.hours : a.hours / 7), 0);
  // real members carry the years the app stored (interim evolutionprogress.summary.savedyears)
  const yearsOf = p => p.real ? (p.evoYears || 0) : hoursPerDayOf(p) * (LIFE_TO - p.age) / 24;

  /* Crossover across all five areas — an area counts as changed at 8 or more (operator rule).
     The buckets count members who submitted the Crossover step (have an interim crossover doc). */
  const xFilled = p => !!p.hasCross;
  const xChanged = p => AREAS.filter(a => p.cross[a] >= 8).length;
  const xCount = n => p => xFilled(p) && xChanged(p) === n;
  const xNone = xCount(0);
  const xAll  = xCount(AREAS.length);
  /* the six buckets on the Crossover Meter header — every filled report sits in exactly one */
  const XBUCKETS = Array.from({ length: AREAS.length + 1 }, (_, n) => ({
    key: 'x' + n, f: xCount(n),
    label: n === 0 ? 'All areas not changed'
         : n === AREAS.length ? 'All areas changed'
         : `${n} area${n === 1 ? '' : 's'} changed`,
    cls: n === 0 ? 'none' : n === AREAS.length ? 'all' : 'some'
  }));
  const xLevels = p => AREAS.map(a => `${a} ${p.cross[a]}`).join(' · ');

  /* the crossover scale, clubbed into four columns */
  const XBANDS = [
    { k:'b0', label:'0', sub:'Not progressed', f:v => v === null || v === 0 },
    { k:'b1', label:'1–3',  f:v => v !== null && v >= 1 && v <= 3 },
    { k:'b2', label:'4–7',  f:v => v !== null && v >= 4 && v <= 7 },
    { k:'b3', label:'8–10', f:v => v !== null && v >= 8 }
  ];

  const lvlColor = v => v === null ? 'background:#F1F3F4;color:#B9C2C6'
    : `background:rgba(47,95,219,${(0.10 + v / 10 * 0.75).toFixed(2)});color:${v >= 6 ? '#fff' : '#25405F'}`;

  /* ============================================================
     SEND ROWS
     ============================================================ */
  function renderAll(){
    ensureReal();
    $('overview').innerHTML = REAL === null
      ? `<div class="empty">Loading interim reports…</div>`
      : realErr
      ? `<div class="empty">Could not load interim reports: ${escHtml(realErr)}</div>`
      : !REAL.length
      ? `<div class="empty">No interim reports in this date range. Widen the range to see the overview.</div>`
      : !realPool().length
      ? `<div class="empty">No members match these filters. Clear a filter to see the overview.</div>`
      : bodyHTML(sendById('range'));
  }

  /* ============================================================
     EXPANDED BODY
     ============================================================ */

  function bodyHTML(s){
    const P = peopleFor(s.id);          // mock pool — Evolution / Love Letter / Asks
    const X = realPool();               // real pool — this strip
    const range = s.id === 'range';
    const pct = n => Math.round(n / (X.length || 1) * 100);
    const nSub = X.filter(p => p.submitted).length;
    const nOn  = X.filter(p => p.opened && !p.submitted).length;
    const nNot = X.filter(p => !p.opened && !p.submitted).length;   // the three cards add up to Members sent
    return `
      <div class="strip${range ? ' four' : ''}">
        <button class="st" data-strip="${s.id}|all"><div class="l">Members sent</div>
          <div class="n">${X.length}</div><div class="s">interim reports in this range</div></button>
        <button class="st g" data-strip="${s.id}|submitted"><div class="l">Submitted</div>
          <div class="n">${nSub}</div>
          <div class="s">${pct(nSub)}% completion</div></button>
        <button class="st b" data-strip="${s.id}|ongoing"><div class="l">Ongoing</div>
          <div class="n">${nOn}</div>
          <div class="s">${pct(nOn)}% · started, not submitted yet</div></button>
        <button class="st a" data-strip="${s.id}|notstarted"><div class="l">Not started</div>
          <div class="n">${nNot}</div>
          <div class="s">${pct(nNot)}% · no step saved yet</div></button>
        ${range ? '' : `<div class="st flat"><div class="l">Sent on</div>
          <div class="n" style="font-size:17px">${s.date}</div>
          <div class="s">${s.status === 'Open' ? 'still accepting responses' : 'closed'}</div></div>`}
      </div>
      <div class="vswitch">
        <button class="${VIEW === 'step' ? 'on' : ''}" data-view="${s.id}|step">By step</button>
        <button class="${VIEW === 'people' ? 'on' : ''}" data-view="${s.id}|people">By participant</button>
      </div>
      <div class="view${VIEW === 'step' ? ' on' : ''}" id="v-step-${s.id}">${stepView(s, P)}</div>
      <div class="view${VIEW === 'people' ? ' on' : ''}" id="v-people-${s.id}">${VIEW === 'people' ? peopleView(s) : ''}</div>`;
  }

  /* ---------- BY STEP ---------- */
  function stepView(s, P){
    // 1 crossover matrix — real pool (interim crossover); P stays the mock pool for 2–4
    const X = sectionPool();
    const matrix = AREAS.map(a => ({ a, v: XBANDS.map(b => X.filter(p => b.f(p.cross[a])).length) }));

    // 2 evolution — the adjustment itself is confidential, so only the outcome is rolled up
    const evoN = {}; RES_KEYS.concat('na').forEach(k => evoN[k] = 0);
    const evoM = {}; RES_KEYS.concat('na').forEach(k => evoM[k] = 0);
    X.forEach(p => {
      const seen = {};
      p.adjs.forEach(x => { const k = x.res || 'na'; evoN[k]++; seen[k] = 1; });
      Object.keys(seen).forEach(k => evoM[k]++);
    });

    // time reclaimed — real pool (interim evolutionprogress)
    const timeP = X.filter(p => hoursPerDayOf(p) > 0);
    const totalYears = sum(timeP.map(yearsOf));
    const totalHrs = sum(timeP.map(hoursPerDayOf));

    // 3 love letter — real (love letter docs; a letter can count under several tags)
    const wrote = X.filter(p => p.love);
    const flagCount = f => wrote.filter(p => p.love.tags[TAG_KEY[f]]).length;
    const unflagged = wrote.filter(p => !tagList(p.love.tags).length).length;

    // 4 asks — real (ask AH docs), counts only
    const inst = X.filter(p => p.asks && p.asks.inst).length;
    const ah   = X.filter(p => p.asks && p.asks.ah).length;

    return `
    <div class="sec" data-c="1">
      <div class="sec-head"><span class="no">1</span><h3>Crossover Meter</h3>
        <button class="xtog" data-xpanel="${s.id}" aria-expanded="${XPANEL.has(s.id)}"
          title="An area counts as changed at 8 or more">Areas changed
          <span class="ch">▶</span></button>
        <span class="note">click a number to see who is in it</span></div>
      <div class="sec-in">
        ${xBucketPanel(s, X)}
        <div class="mx-wrap"><table class="mx">
          <thead><tr><th class="a">Life area</th>
            ${XBANDS.map(b => `<th>${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</th>`).join('')}</tr></thead>
          <tbody>${matrix.map(m => {
            const max = Math.max(...m.v.slice(1));
            return `<tr><td class="a">${m.a}</td>
              ${m.v.map((n, i) => `<td><button class="cell${i ? '' : ' free'}"${i ? ` style="${shade(n, max)}"` : ''}
                data-cross="${s.id}|${m.a}|${XBANDS[i].k}">${n}</button></td>`).join('')}</tr>`;
          }).join('')}</tbody>
        </table></div>
        ${levelChangePanel(s, X)}
      </div>
    </div>

    <div class="sec" data-c="2">
      <div class="sec-head"><span class="no">2</span><h3>Evolution Progress</h3>
        <span class="note">a member shows in every answer they gave · click a number to see who is in it</span></div>
      <div class="sec-in">
        ${evoGrid(s, X)}
        <div class="ystrip">
          <button class="yst" data-strip="${s.id}|years">
            <div class="l">Total years saved</div>
            <div class="n">${totalYears.toFixed(1)}</div>
            <div class="s">reported by ${timeP.length} members</div></button>
          <div class="yst flat"><div class="l">Average per member</div>
            <div class="n">${timeP.length ? (totalYears / timeP.length).toFixed(1) : '—'}</div>
            <div class="s">years, across their own adjustments</div></div>
          <div class="yst flat"><div class="l">Hours reclaimed</div>
            <div class="n">${totalHrs.toFixed(1)}</div>
            <div class="s">per day, across the cohort</div></div>
        </div>
      </div>
    </div>

    <div class="sec" data-c="3">
      <div class="sec-head"><span class="no">3</span><h3>Love Letter</h3>
        <span class="note">click a number to read them · tags are changed in the Love Letter tab</span></div>
      <div class="sec-in">
        <div class="big-split">
          <div class="big-num"><button data-letters="${s.id}|all">${wrote.length}</button>
            <div class="l">wrote a love letter</div></div>
          <div>
            <div class="flag-row">
              <div class="flag"><div class="l"><span class="d" style="background:#C9CED1"></span>Untagged</div>
                <button data-letters="${s.id}|untagged" style="color:var(--ink-soft)">${unflagged}</button></div>
              ${FLAGS.map(f => `<div class="flag"><div class="l">
                <span class="d" style="background:var(--${FLAG_TONE[f]})"></span>${f}</div>
                <button data-letters="${s.id}|${f}" style="color:var(--${FLAG_TONE[f]})">${flagCount(f)}</button></div>`).join('')}
            </div>
          </div>
        </div>
        ${escPanel(s, X)}
      </div>
    </div>

    <div class="sec" data-c="4">
      <div class="sec-head"><span class="no">4</span><h3>Installation Ask &amp; Ask A&amp;H</h3>
        <span class="note">two separate asks · click a number to read them</span></div>
      <div class="sec-in">
        <div class="ask2">
          <div class="askbox inst"><span class="k">INSTALLATION ASK</span>
            <button class="n" data-asks="${s.id}|inst">${inst}</button>
            <div class="rstat" title="Placeholder — replies are not written from the dashboard yet">
              <b>—</b> replied · <b>—</b> waiting</div></div>
          <div class="askbox ah"><span class="k">ASK A&amp;H</span>
            <button class="n" data-asks="${s.id}|ah">${ah}</button>
            <div class="rstat" title="Placeholder — replies are not written from the dashboard yet">
              <b>—</b> replied · <b>—</b> waiting</div></div>
        </div>
      </div>
    </div>`;
  }

  /* one cell per (member, answer they gave): the answer's row × the band of its share of their adjustments */
  function evoGrid(s, P){
    const rep = P.filter(p => answeredOf(p));   // ongoing members who answered count too
    if(!rep.length) return '<div class="none-note">Nobody has answered an adjustment yet.</div>';
    const cells = {};
    RES_KEYS.forEach(k => EBANDS.forEach(b => cells[k + b.k] = 0));
    // a member shows in every answer they gave, in the band of that answer's share of their adjustments
    rep.forEach(p => RES_KEYS.forEach(k => { if(countOf(p, k)) cells[k + bandOf(shareOf(p, k)).k]++; }));
    const max = Math.max(...Object.values(cells), 1);
    const rowTot = k => sum(EBANDS.map(b => cells[k + b.k]));
    // band totals are left blank: a member can sit in several rows, so a column sum would double count
    const shade = (k, n) => n
      ? `background:${RES_HEX[k]}${Math.round((0.12 + n / max * 0.85) * 255).toString(16).padStart(2, '0')};`
        + `color:${n / max > .5 ? '#fff' : 'var(--ink)'}`
      : 'color:#C9CED1';

    return `
    <div class="egrid-wrap"><table class="egrid">
      <thead><tr><th class="a">Answer given</th>
        ${EBANDS.map(b => `<th>${b.sub}<span>${b.label}</span></th>`).join('')}
        <th class="t">Members</th></tr></thead>
      <tbody>${RES_KEYS.map(k => `
        <tr><td class="a"><span class="d" style="background:${RES_HEX[k]}"></span>${RESULTS[k][0]}</td>
          ${EBANDS.map(b => `<td><button class="ecell" style="${shade(k, cells[k + b.k])}"
            data-ecell="${s.id}|${k}|${b.k}">${cells[k + b.k]}</button></td>`).join('')}
          <td class="t">${rowTot(k)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td class="a">All members</td>
        ${EBANDS.map(() => '<td></td>').join('')}
        <td class="t">${rep.length}</td></tr></tfoot>
    </table></div>
  `;
  }

  // Sent to Journey Coaching = Needs Attention count + Critical count (operator rule: a letter with
  // both tags counts twice). Open / Resolved split that same per-tag sum; In progress is a placeholder.
  function escPanel(s, P){
    const L = P.filter(p => p.love);
    const att = L.filter(p => p.love.tags.attention), crit = L.filter(p => p.love.tags.critical);
    const both = [...att, ...crit];   // always shown, 0 included, so the panel never looks missing
    const done = both.filter(p => p.love.tags.resolved);
    const resolvers = {};
    done.forEach(p => { const who = p.love.tags.resolvedBy || '—'; resolvers[who] = (resolvers[who] || 0) + 1; });
    const rlist = Object.entries(resolvers).sort((a, b) => b[1] - a[1]);

    return `
      <div class="escp">
        <div class="escp-head">
          <div class="escp-tot"><b>${both.length}</b><span>SENT TO JOURNEY COACHING</span></div>
          <span style="margin-left:auto;font-size:11px;color:var(--ink-mute)">Needs Attention ${att.length} + Critical ${crit.length}</span>
        </div>
        <div class="escp-row">
          <button class="escb amber" data-letters="${s.id}|esc:Open">
            <div class="l">Open</div><div class="n">${both.length - done.length}</div>
            <div class="s">not resolved yet</div></button>
          <div class="escb blue" title="Placeholder — not tracked yet">
            <div class="l">In progress</div><div class="n">—</div>
            <div class="s">not tracked yet</div></div>
          <button class="escb green" data-letters="${s.id}|esc:Resolved">
            <div class="l">Resolved</div><div class="n">${done.length}</div>
            <div class="s">marked resolved</div></button>
        </div>
        ${rlist.length ? `<div class="escp-sub">RESOLVED BY</div>
          <div class="escp-who">${rlist.map(([who, n]) =>
            `<button data-letters="${s.id}|by:${encodeURIComponent(who)}">${escHtml(who)}<b>${n}</b></button>`).join('')}</div>` : ''}
      </div>`;
  }

  /* the six "areas changed" buckets — each row opens in place to show who is in it */
  let VIEW = 'step';              // 'step' | 'people' — survives re-renders (search, date change)
  const XOPEN = new Set();        // which bucket rows are open
  const XPANEL = new Set();       // which Crossover Meters have the Areas changed list open
  function xBucketPanel(s, P){
    const filled = P.filter(xFilled), tot = filled.length || 1;
    return `
      <div class="xbp${XPANEL.has(s.id) ? ' open' : ''}" id="xbp-${s.id}">
        ${XBUCKETS.map(x => {
          const M = filled.filter(x.f), key = `${s.id}|${x.key}`, open = XOPEN.has(key);
          return `
          <div class="xb ${x.cls}${open ? ' open' : ''}">
            <button class="xb-h" data-xb="${key}" aria-expanded="${open}">
              <span class="tx">${x.label}</span>
              <span class="bar"><i style="width:${(M.length / tot * 100).toFixed(1)}%"></i></span>
              <span class="c">${M.length}</span><span class="ch">▶</span></button>
            <div class="xb-b">${M.length
              ? tableHTML(AREA_COLS, M.slice(0, 8).map(p => ({ p, cells:areaCells(p) })))
                + (M.length > 8 ? `<button class="xb-all" data-strip="${key}">See all ${M.length}</button>` : '')
              : '<div class="none-note">No members here.</div>'}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // who raised the level they are working toward, and where they landed
  const LVL_OPEN = new Set();   // which panels have the level list expanded
  function levelChangePanel(s, P){
    const rows = P.flatMap(p => p.levelChanges.map(c => ({ p, c })));
    if(!rows.length) return '';
    const members = new Set(rows.map(x => x.p.i)).size;
    const byArea = AREAS.map(a => [a, rows.filter(x => x.c.area === a).length])
                        .filter(([, n]) => n);
    // level names only — accelerated evolution level has no order field, so most-moved-to first
    const byLevel = [...new Set(rows.map(x => x.c.to))]
      .map(to => ({ to, n: rows.filter(x => x.c.to === to).length }))
      .sort((a, b) => b.n - a.n || String(a.to).localeCompare(String(b.to)));

    const open = LVL_OPEN.has(s.id);
    return `
      <div class="lvlp${open ? ' open' : ''}">
        <div class="lvlp-head">
          <button class="lvlp-tot" data-lvlarea="${s.id}|">
            <span class="ar">↑</span><b>${members}</b>
            <span>UPGRADED THEIR LEVEL</span></button>
          <div class="lvlp-areas">${byArea.map(([a, n]) =>
            `<button data-lvlarea="${s.id}|${a}">${a}<b>${n}</b></button>`).join('')}</div>
          <button class="lvlp-x" data-lvltoggle="${s.id}" aria-expanded="${open}"
            aria-label="Show the levels they moved to" title="Show the levels they moved to">
            <span>▶</span></button>
        </div>
        <div class="lvlp-more">
          <div class="lvlp-sub">MOVED TO · click a row for the members</div>
          <div class="lvlp-list">${byLevel.map(({ to, n }) => `
            <button data-lvlto="${s.id}|${encodeURIComponent(to)}">
              <span class="tx">${escHtml(to)}</span>
              <span class="c">${n}</span>
              <span class="ch">›</span>
            </button>`).join('')}</div>
        </div>
      </div>`;
  }

  /* ---------- BY PARTICIPANT ---------- */
  /* real pool (interimreport log + interim crossover): one row per interim report */
  function peopleView(s, q = ''){
    const P = sectionPool();
    const f = q.trim().toLowerCase();
    const rows = P.filter(p => !f || p.nm.toLowerCase().includes(f));
    const show = rows.slice(0, 40);
    return `
    <div class="ptools">
      <input id="psearch-${s.id}" placeholder="Search participant…" value="${escHtml(q)}">
      <div class="f" style="height:38px">Showing <b style="margin-left:5px">${show.length} of ${rows.length}</b></div>
    </div>
    <div class="pt">
      <div class="pt-head">
        <div>Participant</div><div>Journey</div><div>Crossover levels</div><div>Evolution progress</div>
        <div>Love letter</div><div>Asks</div><div style="text-align:right">Status</div><div></div>
      </div>
      ${show.map(p => prow(s, p)).join('')}
    </div>
    ${rows.length > 40 ? `<div class="more">Showing the first 40 of ${rows.length} — search to narrow, or export for the full list.</div>` : ''}`;
  }

  /* Crossover levels are real (interim crossover). Evolution / Love letter / Asks only say
     whether the step is done (interimreport log.reports) until those sections read real data. */
  const stepCell = (p, k) => (p.reports || []).includes(k)
    ? '<span class="mt-ok">✓ Done</span>'
    : '<span style="color:var(--ink-mute);font-size:11.5px">—</span>';
  /* Evolution: why a member has no interim evolutionprogress record */
  const evoWhy = p => (p.reports || []).includes('evolutionprogress')
    ? 'No record · skipped (no ATC) or submitted before the 11 Sep 2026 app build'
    : p.submitted ? 'Submitted · no evolution record' : 'Evolution not done yet';
  /* outcome bar + answered / total, from interim evolutionprogress */
  function evoCell(p){
    if(!p.adjs.length) return (p.reports || []).includes('evolutionprogress')
      ? '<span class="mt-u" style="font-size:11.5px">No record</span>'
      : '<span style="color:var(--ink-mute);font-size:11.5px">—</span>';
    const ans = p.adjs.filter(a => a.res), t = ans.length || 1;
    return `<span class="evo-mini"><span class="bar">${RES_KEYS.map(k =>
      `<i class="${k}" style="width:${countOf(p, k) / t * 100}%"></i>`).join('')}</span>
      <span>${ans.length}/${p.adjs.length}</span></span>`;
  }
  function prow(s, p){
    return `
    <div class="prow" id="pr-${p.uid}">
      <button class="prow-head" data-person="${p.uid}">
        <span class="who"><span class="av">${initials(p.nm)}</span>
          <span><b>${escHtml(p.nm)}</b><small>${p.sub || ''}</small></span></span>
        <span><span class="pill grey">${p.journey}</span></span>
        <span class="lv">${AREAS.map(a =>
          `<i style="${lvlColor(p.cross[a])}" title="${a}">${p.cross[a] ?? '–'}</i>`).join('')}</span>
        <span>${evoCell(p)}</span>
        <span>${p.love ? tagPills(p.love.tags)
          : (p.reports || []).includes('loveletter') ? '<span class="mt-u" style="font-size:11.5px">No letter</span>'
          : stepCell(p, 'loveletter')}</span>
        <span>${p.asks ? (p.asks.inst ? '<span class="pill teal">Inst</span> ' : '') + (p.asks.ah ? '<span class="pill purple">A&amp;H</span>' : '')
            // the ask AH doc's own tags (the Love letter column shows the letter's tags)
            + (tagList(p.asks.tags).length || p.asks.tags.resolved ? ' ' + tagPills(p.asks.tags) : '')
          : (p.reports || []).includes('askah') ? '<span class="mt-u" style="font-size:11.5px">No questions</span>'
          : stepCell(p, 'askah')}</span>
        <span style="text-align:right">${statusPill(p)}</span>
        <span class="chev">▶</span>
      </button>
      <div class="pdetail">${pdetail(s, p)}</div>
    </div>`;
  }

  function pdetail(s, p){
    return `
    <div class="dsec"><h4><span class="n">1</span>Crossover Meter</h4>
      ${!p.hasCross ? `<div class="none-note">${whyBlank(p)}.</div>`
        : `<div class="xrow">${AREAS.map(a => {
            const v = p.cross[a];
            return `<div class="xarea ${v === null ? 'empty' : ''}">
              <div class="a">${a}</div>
              <div class="v">${v === null ? 'Not filled' : v + ' / 10'}</div>
              <div class="lvl">${p.goal[a] ? escHtml(p.goal[a]) : '—'}</div>
              ${p.jumped && p.jumped[a] ? `<div class="jf">↑ Jumped from ${escHtml(p.jumped[a])}</div>` : ''}</div>`;
          }).join('')}</div>`}
    </div>

    <div class="dsec"><h4><span class="n">2</span>Evolution Progress${p.adjs.length
        ? ` <span style="font-weight:600;color:var(--ink-mute);text-transform:none;letter-spacing:0">· ${p.adjs.length} adjustments</span>` : ''}</h4>
      ${!p.adjs.length ? `<div class="none-note">${evoWhy(p)}.</div>` : `
        <div class="pyear"><b>${yearsOf(p).toFixed(1)}</b> years saved
          <span>${hoursPerDayOf(p).toFixed(1)} hrs/day${p.age ? ' · age ' + p.age : ''}</span></div>
        <div class="evoc" style="margin-bottom:8px">${RES_KEYS.map(k => { const n = countOf(p, k);
          return `<span class="ec ${RESULTS[k][1]}${n ? '' : ' z'}"><b>${n}</b>${RESULTS[k][0]}</span>`; }).join('')}</div>
        ${(() => { const why = {}; p.adjs.forEach(a => { if(a.res === 'none' && a.nc) why[a.nc] = (why[a.nc] || 0) + 1; });
          const e = Object.entries(why);
          return e.length ? `<div class="pnc"><span class="k">WHY NO CHANGE</span>${e.map(([o, n]) =>
            `<span class="c"><b>${n}</b>${escHtml(o)}</span>`).join('')}</div>` : ''; })()}
        <div class="conf">The adjustment text is confidential to the participant and is not shown here.</div>`}
    </div>

    <div class="dsec"><h4><span class="n">3</span>Love Letter</h4>
      ${p.love ? `<div class="pletter"><p>${escHtml(p.love.text)}</p>
          <div style="margin-top:8px">${tagPills(p.love.tags)}</div>${resolvedLine(p.love.tags)}</div>`
        : `<div class="none-note">${(p.reports || []).includes('loveletter') ? 'Skipped — no love letter written' : 'Not done yet'}.</div>`}
    </div>

    <div class="dsec"><h4><span class="n">4</span>Installation Ask &amp; Ask A&amp;H</h4>
      ${p.asks ? `${p.asks.inst ? `<div class="pask inst"><div class="k">INSTALLATION ASK</div><p>${escHtml(p.asks.inst)}</p></div>` : ''}
          ${p.asks.ah ? `<div class="pask ah"><div class="k">ASK A&amp;H</div><p>${escHtml(p.asks.ah)}</p></div>` : ''}
          <div>${tagPills(p.asks.tags)}</div>${resolvedLine(p.asks.tags)}`
        : `<div class="none-note">${(p.reports || []).includes('askah') ? 'No questions asked' : 'Not done yet'}.</div>`}
    </div>`;
  }

  /* the notes the coaches have logged, oldest first, and the button to log another */
  const ESC_OPEN = new Set();      // which escalations have their notes open
  const LOG_TONE = { Call:'blue', Schedule:'purple', Note:'grey' };
  function coachNotes(p){
    const logs = [...p.esc.logs].sort((a, b) => a.on - b.on);
    return `
      <div class="cn">
        ${logs.length ? `<ol class="cnl">${logs.map((l, k) => `
          <li><span class="dot ${l.type}">${k + 1}</span>
            <div class="cnh"><span class="pill ${LOG_TONE[l.type]}">${l.type}${l.outcome ? ' · ' + l.outcome : ''}</span>
              <span class="by">${l.by}</span><span class="on">${fmtDate(l.on)}</span></div>
            ${l.when ? `<div class="when">Next session · ${l.when}</div>` : ''}
            ${l.text ? `<p>${escHtml(l.text)}</p>` : ''}</li>`).join('')}</ol>`
          : `<div class="cn-empty">No notes logged yet.</div>`}
        <button class="cnadd" data-newlog="${p.uid}">+ Add log</button>
      </div>`;
  }
  const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  /* the coaching escalation, shown wherever the letter is shown */
  function escBox(p){
    if(!p.esc) return '';
    const e = p.esc, tone = ESC_TONE[e.status];
    const done = e.status === 'Resolved';
    return `
    <div class="escbox ${tone}${ESC_OPEN.has(p.uid) ? ' cnopen' : ''}">
      <div class="eh"><span class="k">JOURNEY COACHING</span>
        <span class="pill ${tone}">${e.status}</span>
        <span class="pill grey">came in as ${e.from}</span>
        ${e.movedTo ? `<span class="pill ${FLAG_TONE[e.movedTo]}">now ${e.movedTo}</span>` : ''}
        ${e.owner ? `<span class="w">${done ? 'resolved by' : 'with'}
          <b>${e.owner}</b> · ${e.on}</span>` : ''}
        <button class="cnbtn" data-cn="${p.uid}" aria-expanded="${ESC_OPEN.has(p.uid)}">
          Journey coach notes <b>${e.logs.length}</b><span class="ch">▶</span></button></div>
      ${coachNotes(p)}

      ${done ? `
        <div class="escf"><span class="fl">WHAT THE COACH DISCUSSED</span>
          <textarea data-escfield="${p.uid}|summary"
            placeholder="What was talked through with the participant…">${e.summary || ''}</textarea></div>
        <div class="escf"><span class="fl">HOW IT WAS RESOLVED</span>
          <textarea data-escfield="${p.uid}|note"
            placeholder="What closed it…">${e.note || ''}</textarea></div>` : (e.note
        ? `<div class="en">${e.note}</div>` : '')}

      <div class="tagger"><span class="lbl">STATUS</span>
        ${ESC_STATUS.map(st => `<button class="tg ${e.status === st ? 'on' : ''}" data-f="${st}"
          data-esc="${p.uid}|${st}">${st}</button>`).join('')}</div>

      ${done ? `<div class="escmove">
        <div class="tagger"><span class="lbl">MOVE TO A POSITIVE CATEGORY</span>
          ${POSITIVE.map(c => `<button class="tg ${e.movedTo === c ? 'on' : ''}" data-f="${c}"
            data-move="${p.uid}|${c}">${c}</button>`).join('')}
          ${e.movedTo ? `<button class="tg" data-move="${p.uid}|">Undo</button>` : ''}</div>
        <p>${e.movedTo
          ? `Moved from <b>${e.from}</b> to <b>${e.movedTo}</b>. The discussion, the resolution and the
             original category stay on the letter, and it is still counted once under Resolved.`
          : `Optional. The letter keeps its coaching history and stays counted once under Resolved.`}</p>
      </div>` : ''}
    </div>`;
  }

  /* the team types the reply here — the participant sees it in the app */
  function replyBox(p, kind){
    const r = kind === 'inst' ? p.instReply : p.ahReply;
    if(r) return `
      <div class="rep sent">
        <div class="rh">REPLIED · ${r.by} · ${r.on}</div>
        <p>${r.text}</p>
        <div class="rn">Showing in the participant's app under their question</div>
      </div>`;
    return `
      <div class="rep">
        <textarea placeholder="Type the reply the participant will see in their app…"></textarea>
        <div class="ra"><span class="rn">The participant is notified when you send.</span>
          <button class="rbtn ${kind}" data-reply="${p.uid}|${kind}">Send reply</button></div>
      </div>`;
  }

  /* ============================================================
     MODAL
     ============================================================ */
  let mo = { mode:'', send:null, rows:[], meta:{} };

  function openModal(title, sub, mode, rows, meta = {}){
    mo = { mode, send:meta.send, rows, meta };
    $('moTitle').innerHTML = title; $('moSub').textContent = sub;
    paintModal(''); $('moSearch').value = ''; $('ov').classList.add('show');
  }

  /* every count opens a table — Name and Journey first, then what that number is about.
     cols: [{ h, g }] where g groups columns under a shared heading.
     rows: [{ p, cells:[html] }]. A filter adds chips with a count on each. */
  function openTable(s, title, cols, rows, o = {}){
    const unit = o.unit || 'member';
    openModal(title, `${rows.length} ${unit}${rows.length === 1 ? '' : 's'} · ${s.date} · ${s.event}`,
      'table', rows, { send:s, cols, filter:o.filter || null, fval:o.fval || '' });
  }

  function tableHTML(cols, rows){
    let head;
    if(cols.some(c => c.g)){
      let r1 = '<th rowspan="2">Name</th><th rowspan="2">Journey</th>', r2 = '';
      for(let i = 0; i < cols.length;){
        const c = cols[i];
        if(!c.g){ r1 += `<th rowspan="2">${c.h}</th>`; i++; continue; }
        let j = i;
        while(j < cols.length && cols[j].g === c.g){
          r2 += `<th class="sub${j === i ? ' first' : ''}">${cols[j].h}</th>`; j++; }
        r1 += `<th class="grp" colspan="${j - i}">${c.g}</th>`; i = j;
      }
      head = `<tr>${r1}</tr><tr>${r2}</tr>`;
    } else head = `<tr><th>Name</th><th>Journey</th>${cols.map(c => `<th>${c.h}</th>`).join('')}</tr>`;
    const firstOfGroup = cols.map((c, i) => c.g && (i === 0 || cols[i - 1].g !== c.g));
    return `<div class="mt-wrap"><table class="mt"><thead>${head}</thead><tbody>${rows.map(r => `
      <tr><td><div class="mt-nm"><span class="av">${initials(r.p.nm)}</span>
          <span><b>${r.p.nm}</b><small>${r.p.sub ?? '#' + (1000 + r.p.i)}</small></span></div></td>
        <td><span class="pill grey">${r.p.journey}</span></td>
        ${r.cells.map((c, i) => `<td${firstOfGroup[i] ? ' class="first"' : ''}>${c}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }

  /* what each member has filled in — used by every status list */
  const DASH = '<span class="mt-no">—</span>';
  const statusPill = p => p.submitted ? '<span class="pill green">Submitted</span>'
    : p.opened ? '<span class="pill blue">Ongoing</span>' : '<span class="pill amber">Not started</span>';
  function doneCells(p){
    if(!p.submitted) return [DASH, DASH, DASH, DASH];
    const xf = AREAS.filter(a => p.cross[a] !== null).length;
    return [
      p.noAel ? '<span class="mt-u">Skipped · no AEL</span>'
        : `<span class="mt-v">${xf}/${AREAS.length}</span> <span class="mt-u">areas</span>`,
      `<span class="mt-v">${answeredOf(p)}/${p.adjs.length}</span> <span class="mt-u">answered</span>`,
      p.letter ? '<span class="mt-ok">✓ Written</span>' : DASH,
      (p.instAsk ? '<span class="pill teal">Inst</span> ' : '') + (p.ahAsk ? '<span class="pill purple">A&amp;H</span>' : '')
        || DASH
    ];
  }
  const STATUS_COLS = [{ h:'Status' },
    { h:'Crossover', g:'Report done' }, { h:'Evolution', g:'Report done' },
    { h:'Love letter', g:'Report done' }, { h:'Asks', g:'Report done' }];
  const statusCells = p => [statusPill(p), ...doneCells(p)];

  const AREA_COLS = AREAS.map(a => ({ h:a }));
  const areaCells = p => AREAS.map(a =>
    `<span class="mt-lv" style="${lvlColor(p.cross[a])}">${p.cross[a] ?? '–'}</span>`);

  const whyBlank = p => p.real
    ? (p.hasCross ? 'Left blank'
      : (p.reports || []).includes('crossover') ? 'Skipped · no AEL'
      : p.submitted ? 'Submitted · no crossover record'   // status completed but reports[] empty
      : p.opened ? 'Crossover not done yet'
      : 'Not started')
    : !p.submitted ? (p.opened ? 'Ongoing, not submitted' : 'Not started')
    : p.noAel ? 'No AEL for this event' : 'Left blank';

  /* real: true → the list is drawn from the real pool (interimreport log + interim crossover) */
  const STRIPS = {
    all:          { t:'Members sent',                        f:p => true, real:true },
    opened:       { t:'Opened the report',                   f:p => p.opened },
    ongoing:      { t:'Ongoing · started, not submitted yet', f:p => p.opened && !p.submitted, real:true },
    submitted:    { t:'Submitted the report',                f:p => p.submitted, real:true },
    notstarted:   { t:'Not started · no step saved yet',     f:p => !p.opened && !p.submitted, real:true },
    notsubmitted: { t:'Have not submitted',                  f:p => !p.submitted },
    noletter:     { t:'Submitted without a letter',          f:p => p.submitted && !p.letter },
    noask:        { t:'Submitted without asking',            f:p => p.submitted && !p.instAsk && !p.ahAsk },
    ...Object.fromEntries(XBUCKETS.map(x =>
      [x.key, { t:x.label, f:x.f, cols:AREA_COLS, c:areaCells, real:true, section:true }])),
    years:        { t:'Years saved', f:p => hoursPerDayOf(p) > 0, real:true, section:true,
                    cols:[{ h:'Years saved' }, { h:'Hours per day' }],
                    c:p => [`<span class="mt-v">${yearsOf(p).toFixed(1)}</span> <span class="mt-u">years</span>`,
                            `<span class="mt-v">${hoursPerDayOf(p).toFixed(1)}</span> <span class="mt-u">hrs/day</span>`],
                    srt:(a, b) => yearsOf(b.p) - yearsOf(a.p) }
  };

  /* a KPI card or an inline count — the plain member list */
  function openStrip(sendId, key){
    const d = STRIPS[key];
    if(!d) return;
    const s = d.real ? realSend() : sendById(sendId);
    const c = d.c || (d.real ? realStatusCells : statusCells);
    let rows = (d.section ? sectionPool() : d.real ? realPool() : peopleFor(sendId)).filter(d.f).map(p => ({ p, cells:c(p) }));
    if(d.srt) rows = rows.sort(d.srt);
    openTable(s, d.t, d.cols || STATUS_COLS, rows);
  }

  /* a crossover cell — the members in that band for that area (0 = not progressed) */
  function openCross(sendId, area, bk){
    const s = realSend(), b = XBANDS.find(x => x.k === bk), blank = bk === 'b0';
    const rows = sectionPool().filter(p => b.f(p.cross[area]))
      .sort((x, y) => (y.cross[area] || 0) - (x.cross[area] || 0))
      .map(p => ({ p, cells:[
        blank && p.cross[area] !== 0 ? `<span class="mt-u">${whyBlank(p)}</span>`
              : `<span class="mt-lv" style="${lvlColor(p.cross[area])}">${p.cross[area]}</span>`,
        p.goal[area] ? escHtml(p.goal[area]) : DASH,
        p.jumped && p.jumped[area] ? `<span class="mt-u">${escHtml(p.jumped[area])}</span>` : DASH] }));
    openTable(s, `${area} · ${blank ? 'Not progressed' : 'Crossover ' + b.label}`,
      [{ h: blank ? 'Status' : 'Crossover' }, { h:`${area} goal` }, { h:'Jumped from' }], rows);
  }

  /* level changes — one row per change, filterable by life area */
  const LVL_COLS = [{ h:'Area' }, { h:'Jumped from' }, { h:'Jumped to' }];
  const AREA_FILTER = { label:'FILTER BY AREA', options:AREAS, of:r => r.c.area };
  const lvlRow = ({ p, c }) => ({ p, c, cells:[
    `<span class="pill blue">${c.area}</span>`,
    `<span class="mt-u">${escHtml(c.from)}</span>`,
    `<span class="mt-up">↑</span><span class="mt-after">${escHtml(c.to)}</span>`] });

  /* a "moved to" row — every change that landed on that level */
  function openLevels(sendId, to){
    const s = realSend();
    const rows = sectionPool().flatMap(p => p.levelChanges.filter(c => c.to === to).map(c => ({ p, c })));
    openTable(s, `Moved to ${escHtml(to)}`, LVL_COLS, rows.map(lvlRow),
      { unit:'change', filter:AREA_FILTER });
  }

  function openEvoCell(sendId, k, bk){
    const s = realSend(), b = EBANDS.find(x => x.k === bk);
    const rows = sectionPool()
      .filter(p => countOf(p, k) && bandOf(shareOf(p, k)).k === bk)
      .sort((x, y) => shareOf(y, k) - shareOf(x, k))
      .map(p => ({ p, cells:[
        `<span class="mt-v">${shareOf(p, k)}%</span> <span class="mt-u">of their ATC</span>`,
        `<span class="mt-v">${answeredOf(p)}/${p.adjs.length}</span> <span class="mt-u">answered</span>`] }));
    openTable(s, `${RESULTS[k][0]} · ${b.sub} of their ATC`,
      [{ h:RESULTS[k][0] }, { h:'Adjustments' }], rows);
  }

  function openLevelArea(sendId, area){
    const s = realSend(), P = sectionPool();
    const rows = [];
    P.forEach(p => p.levelChanges.forEach(c => rows.push({ p, c })));
    openTable(s, 'Upgraded their level', LVL_COLS, rows.map(lvlRow),
      { unit:'change', filter:AREA_FILTER, fval:area || '' });
  }

  /* real love letters — flag: all | untagged | a tag label | esc:Open | esc:Resolved | by:<name> */
  function openLetters(sendId, flag, keep = {}){
    const s = realSend(), P = sectionPool().filter(p => p.love);
    const jc = p => p.love.tags.attention || p.love.tags.critical;
    const esc = flag.startsWith('esc:') && flag.slice(4);
    const by  = flag.startsWith('by:') && decodeURIComponent(flag.slice(3));
    const rows = P.filter(p => esc ? (jc(p) && (esc === 'Resolved' ? p.love.tags.resolved : !p.love.tags.resolved))
      : by ? (jc(p) && p.love.tags.resolved && (p.love.tags.resolvedBy || '—') === by)
      : flag === 'all' || (flag === 'untagged' ? !tagList(p.love.tags).length : p.love.tags[TAG_KEY[flag]]));
    const title = esc ? 'Journey Coaching · ' + esc
      : by ? 'Resolved by ' + escHtml(by)
      : flag === 'all' ? 'Love Letters'
      : 'Love Letters · ' + (flag === 'untagged' ? 'Untagged' : flag);
    openModal(title, `${rows.length} letter${rows.length === 1 ? '' : 's'} · ${s.date} · ${s.event}`,
      'letters', rows, { send:s, flag });
    if(keep.q){ $('moSearch').value = keep.q; paintModal(keep.q); }
  }

  /* real asks (ask AH docs) — replied / waiting are placeholders, so every question is listed */
  function openAsks(sendId, kind){
    const s = realSend();
    const rows = sectionPool().filter(p => p.asks && (kind === 'inst' ? p.asks.inst : p.asks.ah));
    const name = kind === 'inst' ? 'Installation Ask' : 'Ask Antano &amp; Harini';
    openModal(name, `${rows.length} question${rows.length === 1 ? '' : 's'} · ${s.date} · ${s.event}`,
      'asks', rows, { send:s, kind });
  }

  function paintModal(q){
    const f = q.trim().toLowerCase();
    const cap = 60;

    if(mo.mode === 'table'){
      const { cols, filter } = mo.meta, fv = filter ? mo.meta.fval : '';
      const bar = filter ? `<div class="tfbar tagger"><span class="lbl">${filter.label}</span>
        <button class="tg${!fv ? ' on' : ''}" data-f="All" data-mtf="">All<b>${mo.rows.length}</b></button>
        ${filter.options.map(o => `<button class="tg${fv === o ? ' on' : ''}" data-mtf="${o}">${o}<b>${
          mo.rows.filter(r => filter.of(r) === o).length}</b></button>`).join('')}</div>` : '';
      const rows = mo.rows.filter(r => (!fv || filter.of(r) === fv)
        && (!f || r.p.nm.toLowerCase().includes(f) || r.p.journey.toLowerCase().includes(f)));
      $('moBody').innerHTML = bar + (rows.length
        ? tableHTML(cols, rows.slice(0, cap))
          + (rows.length > cap ? `<div class="more">Showing the first ${cap} of ${rows.length}.</div>` : '')
        : `<div class="more">No members here.</div>`);
      return;
    }

    if(mo.mode === 'letters'){
      // real letters, tags shown read-only
      const rows = mo.rows.filter(p => !f || p.nm.toLowerCase().includes(f) || p.love.text.toLowerCase().includes(f));
      $('moBody').innerHTML = rows.length ? rows.slice(0, cap).map(p => `
        <div class="letter">
          <div class="lh"><span class="av">${initials(p.nm)}</span>
            <span><b>${escHtml(p.nm)}</b><small>${p.sub || ''}</small></span>
            <span style="margin-left:auto">${tagPills(p.love.tags)}</span></div>
          <p>${escHtml(p.love.text)}</p>
          ${resolvedLine(p.love.tags)}
        </div>`).join('')
        + (rows.length > cap ? `<div class="more">Showing the first ${cap} of ${rows.length}.</div>` : '')
        : `<div class="more">No letters match.</div>`;
      return;
    }

    // real asks — the question text and the ask AH doc's tags; no reply box (placeholder)
    const kind = mo.meta.kind;
    const textOf = p => (kind === 'inst' ? p.asks.inst : p.asks.ah) || '';
    const rows = mo.rows.filter(p => !f || p.nm.toLowerCase().includes(f) || textOf(p).toLowerCase().includes(f));
    $('moBody').innerHTML = rows.length ? rows.slice(0, cap).map(p => `
      <div class="letter">
        <div class="lh"><span class="av" style="background:var(--${kind === 'inst' ? 'teal' : 'purple'}-soft);color:var(--${kind === 'inst' ? 'teal' : 'purple'})">${initials(p.nm)}</span>
          <span><b>${escHtml(p.nm)}</b><small>${p.sub || ''}</small></span>
          <span style="margin-left:auto">${tagPills(p.asks.tags)}</span></div>
        <p>${escHtml(textOf(p))}</p>
        ${resolvedLine(p.asks.tags)}</div>`).join('')
      + (rows.length > cap ? `<div class="more">Showing the first ${cap} of ${rows.length}.</div>` : '')
      : `<div class="more">Nothing here.</div>`;
  }

  /* ============================================================
     INTERACTION
     ============================================================ */
  root.addEventListener('click', e => {
    /* new log dialog */
    const lgt = e.target.closest('[data-lgtab]');
    if(lgt){ keepLogText(); LG.tab = lgt.dataset.lgtab; paintLog(); return; }
    const lo = e.target.closest('[data-lgout]');
    if(lo){ LG.outcome = lo.dataset.lgout;
      root.querySelectorAll('[data-lgout]').forEach(b => b.classList.toggle('on', b === lo)); return; }
    if(e.target.id === 'lgSave') return saveLog();
    if(e.target.id === 'lgCancel' || e.target.id === 'lgX' || e.target.id === 'lg') return closeLog();
    const nl = e.target.closest('[data-newlog]');
    if(nl) return openLog(nl.dataset.newlog);

    /* journey coach notes — open and close in place */
    const cn = e.target.closest('[data-cn]');
    if(cn){
      const uid = cn.dataset.cn, box = cn.closest('.escbox');
      ESC_OPEN.has(uid) ? ESC_OPEN.delete(uid) : ESC_OPEN.add(uid);
      box.classList.toggle('cnopen', ESC_OPEN.has(uid));
      cn.setAttribute('aria-expanded', ESC_OPEN.has(uid));
      return;
    }

    /* the Areas changed list beside the Crossover Meter title */
    const xp = e.target.closest('[data-xpanel]');
    if(xp){
      const id = xp.dataset.xpanel;
      XPANEL.has(id) ? XPANEL.delete(id) : XPANEL.add(id);
      const box = $('xbp-' + id);
      if(box) box.classList.toggle('open', XPANEL.has(id));
      xp.setAttribute('aria-expanded', XPANEL.has(id));
      return;
    }

    /* an "areas changed" row — opens in place */
    const xb = e.target.closest('[data-xb]');
    if(xb){
      const key = xb.dataset.xb;
      XOPEN.has(key) ? XOPEN.delete(key) : XOPEN.add(key);
      xb.closest('.xb').classList.toggle('open', XOPEN.has(key));
      xb.setAttribute('aria-expanded', XOPEN.has(key));
      return;
    }

    /* filter a member table (level changes by area) */
    const mtf = e.target.closest('[data-mtf]');
    if(mtf){ mo.meta.fval = mtf.dataset.mtf; paintModal($('moSearch').value); return; }

    /* filter a Journey Coaching list by tag */
    const tgf = e.target.closest('[data-tagf]');
    if(tgf){ mo.meta.tagF = tgf.dataset.tagf; paintModal($('moSearch').value); return; }

    const v = e.target.closest('[data-view]');
    if(v){
      const [id, which] = v.dataset.view.split('|');
      VIEW = which;   // kept across re-renders (search, date change)
      v.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === v));
      $('v-step-' + id).classList.toggle('on', which === 'step');
      $('v-people-' + id).classList.toggle('on', which === 'people');
      if(which === 'people' && !$('v-people-' + id).innerHTML)
        $('v-people-' + id).innerHTML = peopleView(sendById(id));
      return;
    }

    const lt = e.target.closest('[data-lvltoggle]');
    if(lt){
      const id = lt.dataset.lvltoggle, box = lt.closest('.lvlp');
      const open = !LVL_OPEN.has(id);
      open ? LVL_OPEN.add(id) : LVL_OPEN.delete(id);
      box.classList.toggle('open', open);
      lt.setAttribute('aria-expanded', open);
      return;
    }

    const pr = e.target.closest('[data-person]');
    if(pr){ $('pr-' + pr.dataset.person).classList.toggle('open'); return; }

    const c = e.target.closest('[data-cross]');
    if(c){ const [id, area, bk] = c.dataset.cross.split('|'); openCross(id, area, bk); return; }

    const lv = e.target.closest('[data-lvlto]');
    if(lv){ const [id, to] = lv.dataset.lvlto.split('|'); openLevels(id, decodeURIComponent(to)); return; }

    const l = e.target.closest('[data-letters]');
    if(l){ const [id, flag] = l.dataset.letters.split('|'); openLetters(id, flag); return; }

    const a = e.target.closest('[data-asks]');
    if(a){ const [id, kind, filter] = a.dataset.asks.split('|'); openAsks(id, kind, filter || 'all'); return; }

    const ec = e.target.closest('[data-ecell]');
    if(ec){ const [id, k, bk] = ec.dataset.ecell.split('|'); openEvoCell(id, k, bk); return; }

    const st = e.target.closest('[data-strip]');
    if(st){ const [id, key] = st.dataset.strip.split('|'); openStrip(id, key); return; }

    const la = e.target.closest('[data-lvlarea]');
    if(la){ const [id, area] = la.dataset.lvlarea.split('|'); openLevelArea(id, area); return; }

    /* tagging — updates the person, the counts and any open view */
    const tg = e.target.closest('[data-tag]');
    if(tg){
      const [uid, flag] = tg.dataset.tag.split('|');
      const p = PERSON[uid];
      p.flag = p.flag === flag ? null : flag;
      // Needs Attention and Critical are routed to Journey Coaching the moment they are tagged.
      // A resolved escalation is history — it survives a re-categorisation, so the resolved
      // count does not move when the letter is put into a positive category.
      if(p.flag === 'Needs Attention' || p.flag === 'Critical'){
        if(!p.esc) p.esc = { from:p.flag, status:'Open', owner:null, on:null,
                             note:'', summary:'', movedTo:null, logs:[] };
      } else if(p.esc && p.esc.status !== 'Resolved') p.esc = null;
      repaintViews();
      return;
    }

    /* the Journey Coaching status coming back */
    const es = e.target.closest('[data-esc]');
    if(es){
      const [uid, st] = es.dataset.esc.split('|');
      const p = PERSON[uid];
      if(!p.esc) return;
      p.esc.status = st;
      p.esc.owner = st === 'Open' ? null : 'You (JC team)';
      p.esc.on = st === 'Open' ? null : 'Today';
      if(st === 'Open') p.esc.note = '';
      repaintViews();
      return;
    }

    /* a resolved letter moved into a positive category — same record, same count */
    const mv = e.target.closest('[data-move]');
    if(mv){
      const [uid, cat] = mv.dataset.move.split('|');
      const p = PERSON[uid];
      if(!p.esc || p.esc.status !== 'Resolved') return;
      const undo = !cat || p.esc.movedTo === cat;
      p.esc.movedTo = undo ? null : cat;
      p.flag = undo ? p.esc.from : cat;
      repaintViews();
      return;
    }

    /* replying to an ask — the participant sees this in the app */
    const rp = e.target.closest('[data-reply]');
    if(rp){
      const [uid, kind] = rp.dataset.reply.split('|');
      const p = PERSON[uid];
      const box = rp.closest('.rep').querySelector('textarea');
      const txt = (box && box.value || '').trim();
      if(!txt){ if(box) box.focus(); return; }
      p[kind === 'inst' ? 'instReply' : 'ahReply'] =
        { text:txt, by:'You (JC team)', on:'Today' };
      repaintViews();
      return;
    }

    if(e.target.id === 'moX' || e.target.id === 'ov') $('ov').classList.remove('show');
  });

  /* one place to repaint whatever is on screen after the team changes something */
  function repaintViews(){
    ['range', ...SENDS.map(x => x.id)].forEach(id => {
      const stepEl = $('v-step-' + id);
      if(!stepEl) return;
      stepEl.innerHTML = stepView(sendById(id), peopleFor(id));
      const peopleEl = $('v-people-' + id);
      if(peopleEl && peopleEl.innerHTML){
        const open = [...peopleEl.querySelectorAll('.prow.open')].map(el => el.id);
        const box = $('psearch-' + id);
        peopleEl.innerHTML = peopleView(sendById(id), box ? box.value : '');
        open.forEach(x => $(x) && $(x).classList.add('open'));
      }
    });
    if($('ov').classList.contains('show')){
      const id = mo.send.id;
      if(mo.mode === 'letters') openLetters(id, mo.meta.flag, { tagF: mo.meta.tagF,
        q: $('moSearch').value, top: root.querySelector('.mo-body').scrollTop });
      else if(mo.mode === 'asks') openAsks(id, mo.meta.kind, mo.meta.filter);
      else paintModal($('moSearch').value);
    }
  }

  root.addEventListener('input', e => {
    const ef = e.target.closest('[data-escfield]');
    if(ef){ const [uid, key] = ef.dataset.escfield.split('|');
      if(PERSON[uid].esc) PERSON[uid].esc[key] = ef.value; return; }
    if(e.target.id === 'fWho'){
      const pos = e.target.selectionStart;
      renderAll();
      const box = $('fWho'); box.focus(); box.setSelectionRange(pos, pos);
      return;
    }
    if(e.target.id === 'moSearch') return paintModal(e.target.value);
    if(e.target.id && e.target.id.startsWith('psearch-')){
      const id = e.target.id.replace('psearch-', '');
      const pos = e.target.selectionStart, val = e.target.value;
      $('v-people-' + id).innerHTML = peopleView(sendById(id), val);
      const box = $('psearch-' + id); box.focus(); box.setSelectionRange(pos, pos);
    }
  });

  root.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    if($('lg').classList.contains('show')) return closeLog();
    $('ov').classList.remove('show');
  });

  /* ---------- new log: Call, Schedule or Note ---------- */
  const LG = { uid:null, tab:'Call', outcome:'Connected', text:'' };
  const fmtTime = v => { const [h, m] = v.split(':').map(Number);
    return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  function openLog(uid){
    Object.assign(LG, { uid, tab:'Call', outcome:'Connected', text:'' });
    $('lgName').textContent = PERSON[uid].nm;
    paintLog();
    $('lg').classList.add('show');
    $('lgText').focus();
  }
  function closeLog(){ $('lg').classList.remove('show'); LG.uid = null; }
  function keepLogText(){ const t = $('lgText'); if(t) LG.text = t.value; }
  function paintLog(){
    root.querySelectorAll('[data-lgtab]').forEach(b => {
      b.classList.toggle('on', b.dataset.lgtab === LG.tab);
      b.setAttribute('aria-selected', b.dataset.lgtab === LG.tab);
    });
    const tomorrow = new Date(TODAY); tomorrow.setDate(tomorrow.getDate() + 1);
    const note = (label, ph) => `<div class="lg-k">${label}</div><textarea id="lgText" placeholder="${ph}"></textarea>`;
    $('lgPane').innerHTML = LG.tab === 'Call'
      ? `<div class="lg-k">CALL OUTCOME</div>
         <div class="lg-chips">${CALL_OUTCOMES.map(o =>
           `<button class="lg-chip${LG.outcome === o ? ' on' : ''}" data-lgout="${o}">${o}</button>`).join('')}</div>
         ${note('NOTE (OPTIONAL)', 'What was discussed on the call')}`
      : LG.tab === 'Schedule'
      ? `<div class="lg-k">NEXT SESSION</div>
         <div class="lg-when"><input type="date" id="lgDate" aria-label="Date" value="${isoOf(tomorrow)}">
           <input type="time" id="lgTime" aria-label="Time" value="11:00"></div>
         ${note('NOTE (OPTIONAL)', 'What the session is for')}`
      : note('NOTE', 'What the next coach should know');
    $('lgText').value = LG.text;
  }
  function saveLog(){
    const p = PERSON[LG.uid];
    if(!p || !p.esc) return closeLog();
    const box = $('lgText'), text = box.value.trim();
    if(LG.tab === 'Note' && !text){ box.classList.add('err'); box.focus(); return; }
    const log = { type:LG.tab, by:'You (JC team)', on:new Date(TODAY), text };
    if(LG.tab === 'Call') log.outcome = LG.outcome;
    if(LG.tab === 'Schedule'){
      const d = fromIso($('lgDate').value);
      if(!d){ $('lgDate').classList.add('err'); $('lgDate').focus(); return; }
      log.when = fmtDate(d) + ($('lgTime').value ? ', ' + fmtTime($('lgTime').value) : '');
    }
    p.esc.logs.push(log);
    ESC_OPEN.add(p.uid);
    closeLog();
    repaintViews();
  }

  /* the date range is the component's Material range picker — it calls refresh() on change */
  $('fJourney').addEventListener('change', renderAll);
  $('fEvent').addEventListener('change', renderAll);
  $('fClear').addEventListener('click', () => {
    $('fJourney').value = '';
    $('fEvent').value = ''; $('fWho').value = '';
    api.resetRange();
    renderAll();
  });

  /* the two dialogs are native <dialog>s opened modally, so they centre on the screen above
     the app toolbar (the tab body's transform breaks position:fixed). The script keeps
     toggling `show`; this keeps each dialog's open state in step with it. */
  ['ov', 'lg'].forEach(id => {
    const d = $(id);
    new MutationObserver(() => {
      const want = d.classList.contains('show');
      if(want && !d.open){ d.showModal(); if(id === 'lg' && $('lgText')) $('lgText').focus(); }
      if(!want && d.open) d.close();
    }).observe(d, { attributes:true, attributeFilter:['class'] });
    // Esc is handled by the keydown listener above (it also resets the log form)
    d.addEventListener('cancel', e => e.preventDefault());
  });

  /* ---------- boot ---------- */
  $('fJourney').innerHTML = '<option value="">All journeys</option>' +
    JOURNEYS.map(j => `<option value="${j}">${j}</option>`).join('');
  $('fEvent').innerHTML = '<option value="">All events</option>' +
    [...new Set(SENDS.map(s => s.event))].map(e => `<option>${e}</option>`).join('');
  renderAll();

  // the component calls this when the participant names arrive after the first paint
  return { refresh: renderAll };
}
