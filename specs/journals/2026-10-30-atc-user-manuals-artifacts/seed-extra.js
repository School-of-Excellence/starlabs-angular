'use strict';
if (!/^localhost:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') || !/^localhost:\d+$/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '')) { console.error('REFUSING: emulator only'); process.exit(3); }
const hubRequire = require('module').createRequire('/Users/m1/Documents/starlabs-e2e-tests/package.json');
const admin = hubRequire('firebase-admin');
admin.initializeApp({ projectId: 'starlabs-cicd', storageBucket: 'starlabs-cicd.appspot.com' });
const db = admin.firestore();
const bucket = admin.storage().bucket();
const tag = { testrunid: 'manual', _testdata: true };
(async () => {
  for (const [k, file, cat] of [['wish', 'wish.jpg', ['Wellbeing', 'Accelerator']], ['ei', 'ei.jpg', ['Emotional Intelligence']]]) {
    const token = `manual-${k}-token`;
    const dest = `ATC Model Images/manual_model_${k}.jpg`;
    await bucket.upload(`${__dirname}/${file}`, { destination: dest, metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } } });
    const url = `http://localhost:9199/v0/b/starlabs-cicd.appspot.com/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
    await db.doc(`atc model/manual_model_${k}`).set({ image: url, evolutiontype: k === 'wish' ? 'full' : 'specialised', category: cat, docid: `manual_model_${k}` }, { merge: true });
    console.log(k, url);
  }
  const ap = await db.doc('classify/atcproperty').get();
  if (!ap.exists) await db.doc('classify/atcproperty').set({ names: ['author', 'observer', 'mentoring', 'assigned_to'], ...tag });
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
