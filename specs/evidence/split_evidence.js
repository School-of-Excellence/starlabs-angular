// Generates per-subsystem evidence slices into specs/<DOC>-evidence/evidence.json from the master probe outputs.
// No Firestore reads — pure transform of schema_samples.json / config_deep.json / traces.json / traces2.json.
// Run from repo root: node specs/evidence/split_evidence.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');         // repo root
const E = path.join(ROOT, 'specs', 'evidence');
const S = JSON.parse(fs.readFileSync(path.join(E, 'schema_samples.json')));
const C = JSON.parse(fs.readFileSync(path.join(E, 'config_deep.json')));
const T = JSON.parse(fs.readFileSync(path.join(E, 'traces.json')));
const T2 = JSON.parse(fs.readFileSync(path.join(E, 'traces2.json')));

const PROVENANCE = 'READ-ONLY production probes (fir-sample-aae4a), 2026-06-02. Regenerate: specs/evidence/probe_*.js then split_evidence.js. ATC denylist enforced.';
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
const schemaFor = (cols) => Object.fromEntries(cols.filter(c => S.sample[c]).map(c => [c, S.sample[c]]));
const configFor = (cols) => Object.fromEntries(cols.filter(c => C.config[c]).map(c => [c, C.config[c]]));

const SUBSYS = {
  'QUEUE-AND-BIG': {
    schema: ['queue generation','queue variation','queue_token','queue stage log','queue activity log','queue studio pairing','cohorts queue planner','big cohorts','big cohorts log','big assignment','big participants assignments','biginvitation','bigactivity','biglevel','accelerated evolution level'],
    config: ['queue generation','queue variation','bigactivity','biglevel','accelerated evolution level'],
    traces: { queueTrace: T.queueTrace, recencyNuance: T.recencyNuance, tokenQueueRef: T2.tokenQueueRef },
    tierC: pick(S.tierC, ['big aggregate level','big aggregate levelv2','big aggregate level archives','big aggregate level archivesv2','big aggregate event level','big marathon']),
  },
  'LIVE-STUDIOS': {
    schema: ['arenaspace','arena participant','live assignment','openviduroom','queue studio pairing'],
    config: ['arenaspace'],
    traces: { studioTrace: T.studioTrace },
  },
  'SCHEDULING-DELIVERY': {
    schema: ['appointments','availability','offtime','deliverables','participantdeliverysequence','appointmenttype','productToDeliverySequence','modes','delivery events','delivery forms','AppointmentType-To-Roles','Roles-To-EIS'],
    config: ['productToDeliverySequence','modes','appointmenttype','delivery events','delivery forms','AppointmentType-To-Roles','Roles-To-EIS'],
    traces: { schedulingTrace: T2.schedulingTrace, productToDeliverySequenceSample: T2.productToDeliverySequenceSample },
    note: 'Delivered-sequence worked examples (10 anonymised participant timelines) are in specs/evidence/journey_evidence_final.json.',
  },
  'CONTENT-ENGAGEMENT': {
    schema: ['content analytics','participant touchpoint','recommended mix playlist','episodes','series','solar voice playlist','solar voice audios','evolutionmappingvideo','liveevolutionmapping','tier','tier access config'],
    config: ['tier access config','tier'],
    traces: { contentTrace: T.contentTrace },
  },
  'JOURNEY-LIFECYCLE': {
    schema: ['participantjourneyproduct','participantsproduct','participant metadata','salesleads','journey','products','package','journey-to-product'],
    config: ['journey','products','package','journey-to-product'],
    traces: { journeyTrace: T.journeyTrace, recencyNuance: pick(T.recencyNuance, Object.keys(T.recencyNuance).filter(k => k.startsWith('participantjourneyproduct'))) },
    note: '10 anonymised end-to-end participant timelines (purchased≠delivered) in specs/evidence/journey_evidence_final.json.',
  },
  'AUTH-ROLES': {
    schema: ['profile_data','user_data','new_user_data','eisroles','FCM_token','dashboard','classify'],
    config: ['dashboard'],
    traces: { authTrace: T.authTrace, roleRefTargetTally: T2.roleRefTargetTally, usersRolesDoc: T2.usersRolesDoc, eisrolesDocs: T2.eisrolesDocs, usersRolesCount: T2.usersRolesCount },
  },
  'DATA-MODEL': { schema: Object.keys(S.sample), tierC: S.tierC, note: 'Full 100-doc schema sample for every Tier-A / CONFIG / RUNTIME-STATE collection.' },
  'CONFIGURATION': { config: Object.keys(C.config), note: 'Variant enumeration (distinct key-sets) for every CONFIG collection; secrets redacted.' },
};

for (const [doc, spec] of Object.entries(SUBSYS)) {
  const dir = path.join(ROOT, 'specs', `${doc}-evidence`);
  fs.mkdirSync(dir, { recursive: true });
  const slice = { doc, provenance: PROVENANCE, now: S.now };
  if (spec.note) slice.note = spec.note;
  if (spec.schema) slice.schema = schemaFor(spec.schema);
  if (spec.config) slice.config = configFor(spec.config);
  if (spec.traces) slice.traces = spec.traces;
  if (spec.tierC) slice.tierC = spec.tierC;
  fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(slice, null, 2));
  console.log(`wrote specs/${doc}-evidence/evidence.json  (schema=${spec.schema ? spec.schema.length : 0} config=${spec.config ? spec.config.length : 0})`);
}
console.log('DONE');
