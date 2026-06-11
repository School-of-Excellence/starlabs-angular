#!/usr/bin/env node
/**
 * mobile-guards.cjs — shared Flutter-home render guards for the cohort e2e run.
 *
 * The busy participant Home fires many background queries; on a minimal seed a few throw UNCAUGHT and
 * erase the home before the test can act (discovered + fixed in e2e/queue/mobile/setup-mobile-fixture.cjs):
 *   • applivestreaming/livestreaming  — liveStream() casts doc.participants to a List (no onError).
 *   • static meta data/HPC Config     — threeminhpcconfig() does hpcConfig!['awards'] unguarded.
 *   • adsplaylist (available:true, null adsthumbnail) — CachedNetworkImage crashes the home rebuild.
 * These are SHARED docs (not run-scoped), so we neutralize them defensively before each driving session.
 * Hard-gated to the test project; idempotent.
 *
 * Usage:  node journey-cohort/mobile-guards.cjs
 */
'use strict';
const { seed } = require('../lib/seed-common');

(async () => {
  const admin = seed.initAdmin();           // hard-aborts off the test project allowlist
  const db = admin.firestore();
  const TAG = { _testdata: true, _guard: true };
  await db.collection('applivestreaming').doc('livestreaming').set({ participants: [], ...TAG }, { merge: true });
  await db.collection('static meta data').doc('HPC Config').set({ awards: {}, ...TAG }, { merge: true });
  const ads = await db.collection('adsplaylist').where('available', '==', true).get();
  const b = db.batch();
  ads.docs.forEach((d) => b.update(d.ref, { available: false }));
  if (ads.size) await b.commit();
  console.log(`✓ mobile-guards: applivestreaming + HPC Config seeded; neutralized ${ads.size} ads on ${admin.app().options.projectId}`);
  process.exit(0);
})().catch((e) => { console.error('mobile-guards error:', e.message); process.exit(1); });
