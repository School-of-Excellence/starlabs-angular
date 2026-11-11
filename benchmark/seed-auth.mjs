// EMULATOR-ONLY: seeds the local Firebase emulator with a login + role + route-config
// so the real authGuard grants /journey-coach-health legitimately. No guard edit.
//
// Every endpoint here is 127.0.0.1 (Auth 9099, Firestore 8080) and the key is the
// literal 'emulator-fake-key'. Nothing in this file authenticates against a real
// Firebase project, and the password is a throwaway for the emulator only.
// Run the emulators first: firebase emulators:start
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';

const PROJECT = 'starlabs-test';
const EMAIL = 'coach@starlabs-test.test';
const PASSWORD = 'password123';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-fake-key';

// 1) create the auth user via the Auth emulator REST endpoint
const res = await fetch(AUTH, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
});
const body = await res.json();
if (!res.ok && body?.error?.message !== 'EMAIL_EXISTS') throw new Error('signUp failed: ' + JSON.stringify(body));
let uid = body.localId;
// On re-run the user already exists → sign in to recover the REAL uid instead of
// a placeholder, so profile_data.user_ref keeps pointing at the logged-in account.
if (!uid) {
  const SIGNIN = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-fake-key';
  const r2 = await fetch(SIGNIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  const b2 = await r2.json();
  if (!r2.ok) throw new Error('signIn failed: ' + JSON.stringify(b2));
  uid = b2.localId;
}
console.log('[seed-auth] auth user', EMAIL, 'uid=', uid);

// 2) Firestore docs the guard chain reads
const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-fake-key' }, 'seed-auth');
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const PROFILEID = 'coach_P1';
await setDoc(doc(db, 'user_data', uid), { email: EMAIL, name: 'Test Coach', uid });
await setDoc(doc(db, 'eisroles', 'adminrole'), { admin: true, journeycoach: true });
await setDoc(doc(db, 'profile_data', 'coach_profile_1'), {
  user_ref: doc(db, 'user_data', uid),
  role_ref: doc(db, 'eisroles', 'adminrole'),
  profileid: PROFILEID,
  name: 'Test Coach',
  email: EMAIL,
});
// dashboard route-config doc the guard's routeConfig() scans
await setDoc(doc(db, 'dashboard', 'jch'), {
  route: '/journey-coach-health',
  label: 'Journey Coach Health',
  roles: ['admin', 'journeycoach'],
  profileid: [PROFILEID],
});
console.log('[seed-auth] seeded user_data / eisroles / profile_data / dashboard(route-config).');
console.log('[seed-auth] LOGIN:', EMAIL, '/', PASSWORD);
