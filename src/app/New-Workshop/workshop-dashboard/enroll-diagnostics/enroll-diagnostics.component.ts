import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  collection, doc, documentId, getDocs, getFirestore, query, where,
  DocumentReference,
} from '@angular/fire/firestore';

/** One line of the report: a gate, a lookup, or a conclusion. */
interface Step {
  key: string;
  label: string;
  /** pass = this gate let the user through · fail = this gate refused ·
   *  skip = not configured / not reached · info = a fact, not a gate. */
  status: 'pass' | 'fail' | 'skip' | 'info';
  /** Plain-English sentence, the same explanation the Flutter console prints. */
  text: string;
  /** The Firestore read behind it, shown so the result is auditable. */
  q?: string;
  /** Key/value facts that decided it. */
  facts?: { k: string; v: string }[];
}

/**
 * ENROLL refusal diagnostics for one profile against THIS workshop.
 *
 * A faithful port of the EiFlix Flutter web gates (read-only source of truth:
 * `workshop/lib/workshop_v2/utils/workshop_enroll_eligibility.dart`,
 * `workshop_enroll_policy.dart` and `_onEnroll` in
 * `screens/workshop/workshop_detail_screen.dart`), so an admin can answer
 * "why can't this user enroll?" without reading the user's browser console.
 *
 * Every Firestore read is a `where` query scoped to the workshop the dashboard
 * is already showing — no collection scans.
 *
 * These are the app's UX gates. They are not server-enforced, and the legacy
 * `/workshopold` screen bypasses the access list entirely, so a "cannot enroll"
 * verdict here describes the V2 web screen only.
 */
@Component({
  selector: 'app-enroll-diagnostics',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatRadioModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './enroll-diagnostics.component.html',
  styleUrls: ['./enroll-diagnostics.component.css'],
})
export class EnrollDiagnosticsComponent {
  private db = getFirestore();

  workshopId = '';
  workshopTitle = '';

  // ── form ──
  /** Accepts either a profileid or an email address. */
  profileId = '';
  userKind: 'exist' | 'new' = 'exist';
  running = false;
  error = '';
  /** Set when an email was pasted: how it was turned into a profileid. */
  resolvedNote = '';
  /** Two or more different profiles share the pasted email — the operator picks. */
  candidates: { pid: string; via: string; name: string; email: string; fieldMismatch?: string }[] = [];

  /** A pasted value is treated as an email as soon as it contains "@". */
  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  looksLikeEmail(v: string): boolean { return v.includes('@'); }
  get inputIsEmail(): boolean { return this.looksLikeEmail(this.profileId.trim()); }

  // ── report ──
  ran = false;
  verdict: 'allow' | 'block' | 'card' | 'unknown' = 'unknown';
  headline = '';
  dialogSeen = '';
  steps: Step[] = [];
  userName = '';
  /** Set when the app would classify the profile differently from the radio. */
  kindMismatch = '';

  constructor(
    public dialogRef: MatDialogRef<EnrollDiagnosticsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { workshopId: string; workshopTitle?: string },
  ) {
    this.workshopId = data?.workshopId || '';
    this.workshopTitle = data?.workshopTitle || '';
  }

  // ───────────────────────────── helpers ─────────────────────────────
  private str(v: any): string { return typeof v === 'string' ? v : ''; }
  private list(v: any): string[] {
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  }
  private map(v: any): any { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  /** Firestore Timestamp | Date | ms | ISO string -> Date. */
  private date(v: any): Date | null {
    if (!v) return null;
    if (typeof v?.toDate === 'function') { const d = v.toDate(); return isNaN(+d) ? null : d; }
    if (v instanceof Date) return isNaN(+v) ? null : v;
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  private fmt(d: Date | null): string {
    return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'not set';
  }
  private val(v: any): string {
    if (v === null || v === undefined || v === '') return 'none';
    return String(v);
  }
  private names(ids: string[], m: { [k: string]: string }, max = 8): string {
    if (!ids.length) return 'none';
    const out = ids.map(id => m[id] || `unknown (${id.slice(0, 6)}…)`);
    return out.length > max ? `${out.slice(0, max).join(', ')}, +${out.length - max} more` : out.join(', ');
  }

  /** A `where(documentId(), '==', id)` read — the doc-id lookups the app does,
   *  expressed as a query so every read in this tool is a where clause. */
  private async byId(col: string, id: string): Promise<any | null> {
    const snap = await getDocs(query(collection(this.db, col), where(documentId(), '==', id)));
    return snap.empty ? null : { ...snap.docs[0].data(), __id: snap.docs[0].id };
  }

  // ───────────────────────────── the check ─────────────────────────────
  /** Run the diagnosis for one of the candidate profiles the email matched. */
  async useCandidate(pid: string): Promise<void> {
    this.profileId = pid;
    this.candidates = [];
    await this.check();
  }

  async check(): Promise<void> {
    const raw = this.profileId.trim();
    this.error = '';
    this.resolvedNote = '';
    this.candidates = [];
    if (!raw) { this.error = 'Enter a profileid or an email address.'; return; }
    if (!this.workshopId) { this.error = 'No workshop id on this dashboard.'; return; }

    this.running = true;
    this.ran = false;
    this.steps = [];
    this.kindMismatch = '';
    this.userName = '';

    let pid = raw;
    try {
      if (this.looksLikeEmail(raw)) {
        if (!EnrollDiagnosticsComponent.EMAIL_RE.test(raw)) {
          this.error = `"${raw}" has an @ but is not a valid email address.`;
          this.running = false; return;
        }
        const found = await this.resolveEmail(raw);
        if (!found.length) {
          this.error = `No profile found for ${raw} in participant metadata, profile_data or new_user_data.`;
          this.running = false; return;
        }
        // Distinct profileids for one email is a real condition worth seeing —
        // a duplicate account often IS the reason enrollment behaves oddly.
        const distinct = Array.from(new Set(found.map(f => f.pid)));
        if (distinct.length > 1) {
          this.candidates = distinct.map(id => found.find(f => f.pid === id)!);
          this.error = `${raw} matches ${distinct.length} different profiles. Pick the one to diagnose.`;
          this.running = false; return;
        }
        pid = distinct[0];
        const vias = Array.from(new Set(found.map(f => f.via))).join(', ');
        const mism = found.find(f => f.fieldMismatch);
        this.resolvedNote = `${raw} resolved to profileid ${pid} (matched in ${vias}).`
          + (mism ? ` WARNING: that document's own profileid field says "${mism.fieldMismatch}", which does not match its document id — the app would read the document at one id and run every other query with the other.` : '');
      }
    } catch (e: any) {
      console.error('Email lookup failed:', e);
      this.error = e?.message ? `Firestore error while resolving the email: ${e.message}` : 'The email lookup failed.';
      this.running = false; return;
    }

    try {
      const workshopRef = doc(this.db, 'workshopconfiguration', this.workshopId) as DocumentReference;

      // ── all reads, scoped to this profile and this workshop ──
      const [wsDoc, meta, profileData, newUserData, enrolled, progress, payments, referrals, tierSnap, journeySnap] =
        await Promise.all([
          this.byId('workshopconfiguration', this.workshopId),
          this.readMetadata(pid),
          this.byId('profile_data', pid),
          this.byId('new_user_data', pid),
          getDocs(query(collection(this.db, 'workshop participant enrolled'),
            where('profileid', '==', pid), where('workshopref', '==', workshopRef))),
          getDocs(query(collection(this.db, 'participant workshop'),
            where('profileid', '==', pid), where('workshopref', '==', workshopRef))),
          getDocs(query(collection(this.db, 'workshoppaymentlog'),
            where('profileid', '==', pid), where('workshopref', '==', workshopRef))),
          getDocs(query(collection(this.db, 'workshopreferral'),
            where('profileid', '==', pid), where('workshopref', '==', workshopRef))),
          getDocs(collection(this.db, 'tier')),
          getDocs(collection(this.db, 'journey')),
        ]);

      if (!wsDoc) { this.error = 'This workshop document could not be read.'; this.running = false; return; }

      const tierNames: { [k: string]: string } = {};
      tierSnap.docs.forEach(d => { tierNames[d.id] = this.str(d.data()?.['tier']) || d.id; });
      const journeyNames: { [k: string]: string } = {};
      journeySnap.docs.forEach(d => { journeyNames[d.id] = this.str(d.data()?.['journey']) || d.id; });

      this.evaluate({
        pid, workshop: wsDoc, meta: meta.data, metaFoundBy: meta.foundBy,
        profileData, newUserData, enrolled, progress, payments, referrals,
        tierNames, journeyNames,
      });
      this.ran = true;
    } catch (e: any) {
      console.error('Enroll diagnostics failed:', e);
      this.error = e?.message ? `Firestore error: ${e.message}` : 'The check failed. See the console.';
    } finally {
      this.running = false;
    }
  }

  /**
   * Turns a pasted email into a profileid with the same `where` shape used for a
   * profileid: `where('email','==',…)` on all three profile collections.
   *
   * Firestore string matching is case-sensitive and these documents are not
   * normalised, so the lowercased form is tried first and the original case as a
   * fallback — the pattern already used elsewhere in this app.
   *
   * The profileid is the document id in `profile_data` / `new_user_data`; in
   * `participant metadata` the `profileid` field wins, falling back to the id.
   */
  private async resolveEmail(email: string): Promise<{ pid: string; via: string; name: string; email: string; fieldMismatch?: string }[]> {
    const lower = email.toLowerCase();
    const forms = lower === email ? [email] : [lower, email];
    const cols = ['participant metadata', 'profile_data', 'new_user_data'];
    const out: { pid: string; via: string; name: string; email: string; fieldMismatch?: string }[] = [];

    for (const form of forms) {
      const snaps = await Promise.all(cols.map(col =>
        getDocs(query(collection(this.db, col), where('email', '==', form)))));
      snaps.forEach((snap, i) => {
        snap.docs.forEach(d => {
          const data: any = d.data();
          // The app uses the `profileid` FIELD as a document id in all three of
          // these collections, so the document id is the key that actually
          // addresses them. Keep the field too: if they disagree, the app reads
          // one id for the document and a different one for every downstream
          // query, which is a broken profile worth reporting.
          const pid = d.id;
          const field = this.str(data['profileid']);
          if (!out.some(o => o.pid === pid && o.via === cols[i])) {
            out.push({
              pid, via: cols[i],
              name: this.str(data['name']) || '(no name)',
              email: this.str(data['email']) || form,
              fieldMismatch: !!field && field !== pid ? field : '',
            });
          }
        });
      });
      if (out.length) break;   // the lowercase form matched — no need for the original case
    }
    return out;
  }

  /**
   * `participant metadata` — the Flutter app reads it by document id, the
   * Angular dashboard queries it by a `profileid` field. Try the field first
   * (the operator asked for where clauses) and fall back to the document id,
   * reporting which one matched: a doc that is only reachable by id has no
   * `profileid` field, which is itself worth seeing.
   */
  private async readMetadata(pid: string): Promise<{ data: any | null; foundBy: string }> {
    const byField = await getDocs(query(
      collection(this.db, 'participant metadata'), where('profileid', '==', pid)));
    if (!byField.empty) {
      return { data: { ...byField.docs[0].data(), __id: byField.docs[0].id }, foundBy: 'profileid field' };
    }
    const byDocId = await this.byId('participant metadata', pid);
    return { data: byDocId, foundBy: byDocId ? 'document id only (no profileid field)' : 'not found' };
  }

  // ───────────────────────── the gate evaluation ─────────────────────────
  private evaluate(c: {
    pid: string; workshop: any; meta: any; metaFoundBy: string;
    profileData: any; newUserData: any; enrolled: any; progress: any;
    payments: any; referrals: any;
    tierNames: { [k: string]: string }; journeyNames: { [k: string]: string };
  }): void {
    const w = c.workshop;
    const S: Step[] = [];

    // ── workshop config, exactly as the Flutter model maps it ──
    const newUsersOnly = w['newusersonly'] === true;
    const journeyBased = w['journeybased'] === true;
    const selectedJourneys = this.list(w['selectedjourneys']);
    const tierBased = w['tierbased'] === true;
    const selectedTiers = this.list(w['selectedtiers']);
    const activeParticipants = w['activeparticipants'] === true;
    // NOTE: camelCase in Firestore, unlike every other flag here.
    const evergreen = w['evergreenWorkshop'] === true;
    const referral = w['referralworkshop'] === true;
    const access = this.map(w['evergreenaccessto']);
    const accessAll = access['all'] === true;
    const accessNew = access['new'] === true;
    const accessSelected = this.list(access['selected']);
    const payment = w['payment'] === true;
    const pmap = this.map(w['paymentmap']);
    const paymentFor = this.str(pmap['paymentfor']).trim().toLowerCase();
    const payStatuses = this.list(pmap['customerstatus'])
      .map(s => s.trim().toLowerCase()).filter(s => !!s);
    const notAllowedMsg = this.str(w['enrollmentnotallowedmessage']);
    const notAllowedMsgNew = this.str(w['enrollmentnotallowedmessagenew']);

    // ── who the profile is ──
    // The app resolves the login to profile_data OR new_user_data (that document
    // becomes loggedInProfile, and its id is the profileid).
    const profileMap = c.profileData || c.newUserData || {};
    this.userName = this.str(profileMap['name']) || 'This user';
    const workshopOnly = profileMap['workshoponly'] === true;

    // isNewUser is DERIVED by the app, never asked:
    //   existing = participant metadata OR profile_data exists
    //   isNewUser = !existing && new_user_data exists
    const hasMeta = !!c.meta, hasProfile = !!c.profileData, hasNew = !!c.newUserData;
    const derivedNew = !(hasMeta || hasProfile) && hasNew;
    const selectedNew = this.userKind === 'new';
    if (derivedNew !== selectedNew) {
      this.kindMismatch = derivedNew
        ? `You selected "existing user", but the app would treat this profile as a NEW user (a new_user_data document exists and there is no participant metadata or profile_data). The report below follows the app.`
        : `You selected "new user", but the app would treat this profile as an EXISTING user (${hasProfile ? 'a profile_data document exists' : ''}${hasProfile && hasMeta ? ' and ' : ''}${hasMeta ? 'participant metadata exists' : ''}). The report below follows the app.`;
    }
    const isNewUser = derivedNew;

    const tiers = this.list(c.meta?.['tier']);
    const activeJourney = this.str(c.meta?.['activejourney']) || null;
    const customerStatus = this.str(c.meta?.['customerstatus']) || null;

    if (this.resolvedNote) {
      S.push({
        key: 'resolve', label: 'Email resolved', status: 'info',
        text: this.resolvedNote,
        q: `where('email','==', …) on participant metadata, profile_data, new_user_data (lowercase first, original case as fallback)`,
      });
    }

    // The app uses the `profileid` field as a document id. If a document's own
    // field disagrees with the id it lives at, or is not a string, every
    // profileid-keyed check downstream (tierExempt, the access list, the
    // enrollment ledger) silently looks at the wrong thing.
    const idIssues: string[] = [];
    ([['participant metadata', c.meta], ['profile_data', c.profileData], ['new_user_data', c.newUserData]] as [string, any][])
      .forEach(([col, d]) => {
        if (!d) return;
        const raw = d['profileid'];
        if (raw === undefined || raw === null) return;
        if (typeof raw !== 'string') {
          idIssues.push(`${col} has a non-string profileid (${typeof raw}) — the app would crash or mis-key on it`);
        } else if (raw !== c.pid) {
          idIssues.push(`${col} lives at "${d.__id}" but its profileid field says "${raw}"`);
        }
      });
    if (idIssues.length) {
      S.push({
        key: 'idcheck', label: 'Profile id integrity', status: 'fail',
        text: `The profileid field and the document id disagree, and the app treats the two as interchangeable — it reads the document at one id and runs the access-list check, the tier exemption and the enrollment ledger with the other. Fix this before trusting anything below: ${idIssues.join('; ')}.`,
      });
    }

    S.push({
      key: 'identity', label: 'Who this profile is', status: 'info',
      text: `${this.userName} is treated as ${isNewUser ? 'a NEW user' : 'an EXISTING user'}. `
        + `The app decides this itself: a profile counts as new only when it has a new_user_data document AND has neither participant metadata nor profile_data.`,
      q: `where(documentId(),'==','${c.pid}') on profile_data, new_user_data · participant metadata by ${c.metaFoundBy}`,
      facts: [
        { k: 'participant metadata', v: hasMeta ? `found (${c.metaFoundBy})` : 'not found' },
        { k: 'profile_data', v: hasProfile ? 'found' : 'not found' },
        { k: 'new_user_data', v: hasNew ? 'found' : 'not found' },
        { k: 'workshoponly', v: String(workshopOnly) },
        { k: 'tier', v: this.names(tiers, c.tierNames) },
        { k: 'activejourney', v: activeJourney ? (c.journeyNames[activeJourney] || activeJourney) : 'none' },
        { k: 'customerstatus', v: this.val(customerStatus) },
      ],
    });

    if (!hasMeta && !hasProfile && !hasNew) {
      S.push({
        key: 'noprofile', label: 'Profile not found', status: 'fail',
        text: `No document anywhere for this profileid — not in participant metadata, profile_data or new_user_data. Check the id; nothing below can be trusted for a profile that does not exist.`,
      });
    }

    // ── already enrolled? (the idempotency guard the app runs) ──
    const enrolledDocs = c.enrolled.docs.map((d: any) => d.data());
    const active = enrolledDocs.filter((d: any) => d['status'] === 'enrolled');
    const queued = enrolledDocs.filter((d: any) => d['status'] === 'enrollednotstarted');
    const waiting = queued.filter((d: any) => d['waitingstartedat'] != null);
    if (enrolledDocs.length) {
      S.push({
        key: 'enrolled', label: 'Already enrolled', status: 'info',
        text: active.length
          ? `${this.userName} is ALREADY ENROLLED in this workshop (status "enrolled"), so the ENROLL button is not what they see — the app opens their participant screen. A re-tap would never create a second enrollment.`
          : waiting.length
            ? `${this.userName} is QUEUED for this workshop (status "enrollednotstarted" with waitingstartedat): they enrolled, but another evergreen workshop of theirs must finish first. This is expected behaviour, not a refusal.`
            : `${this.userName} has an enrollment document with status "enrollednotstarted" and no waitingstartedat — enrolled but not started.`,
        q: `workshop participant enrolled · where profileid == '${c.pid}' and workshopref == workshopconfiguration/${this.workshopId}`,
        facts: [
          { k: 'enrolled docs', v: String(enrolledDocs.length) },
          { k: 'status enrolled', v: String(active.length) },
          { k: 'status enrollednotstarted', v: String(queued.length) },
          { k: 'queued (waitingstartedat)', v: String(waiting.length) },
          { k: 'participant workshop docs', v: String(c.progress.size) },
        ],
      });
    } else {
      S.push({
        key: 'enrolled', label: 'Already enrolled', status: 'info',
        text: `${this.userName} has no enrollment document for this workshop, so the gates below are what an ENROLL tap would face.`,
        q: `workshop participant enrolled · where profileid == '${c.pid}' and workshopref == workshopconfiguration/${this.workshopId}`,
      });
    }

    // ═════ LAYER 1 — eligibility ═════
    const noGates = !newUsersOnly && !journeyBased && !tierBased && !activeParticipants;
    // A profileid hand-picked in evergreenaccessto.selected skips the TIER gate
    // only (owner rule, 2026-08-27). The other gates still apply.
    const tierExempt = accessSelected.includes(c.pid);
    let blocked: string | null = null;

    if (noGates) {
      S.push({
        key: 'layer1', label: 'Layer 1 · eligibility', status: 'pass',
        text: `The workshop configures no eligibility gates at all (newusersonly, journeybased, tierbased and activeparticipants are all false), so nothing about this profile could be blocked here.`,
      });
    } else {
      // 1. new users only
      if (newUsersOnly && !workshopOnly) {
        blocked = 'newUsersOnly';
        S.push({
          key: 'g-new', label: 'Gate 1 · newusersonly', status: 'fail',
          text: `The workshop is newusersonly, which admits only a workshop-only profile, and ${this.userName} has workshoponly ${workshopOnly}. They are shown the "You're not eligible" dialog ("Please contact admin.").`,
          facts: [{ k: 'newusersonly', v: 'true' }, { k: 'workshoponly', v: String(workshopOnly) }],
        });
      } else {
        S.push({
          key: 'g-new', label: 'Gate 1 · newusersonly', status: newUsersOnly ? 'pass' : 'skip',
          text: newUsersOnly
            ? `The workshop is newusersonly and ${this.userName} is a workshop-only profile, so this gate passes.`
            : `newusersonly is false — this gate does not apply.`,
        });
      }

      // 2. journey based (skipped for a workshop-only profile)
      if (!blocked) {
        if (!workshopOnly && journeyBased) {
          const ok = !!activeJourney && selectedJourneys.includes(activeJourney);
          if (!ok) {
            blocked = 'journeyNotAllowed';
            S.push({
              key: 'g-journey', label: 'Gate 2 · journeybased', status: 'fail',
              text: `The workshop is journeybased and accepts only the journeys ${this.names(selectedJourneys, c.journeyNames)}, while ${this.userName}'s activejourney is ${activeJourney ? (c.journeyNames[activeJourney] || activeJourney) : 'not set'}. A missing active journey is never allowed. They are shown the "Contact Admin" dialog.`,
              facts: [{ k: 'selectedjourneys', v: this.names(selectedJourneys, c.journeyNames) },
                      { k: 'activejourney', v: activeJourney ? (c.journeyNames[activeJourney] || activeJourney) : 'none' }],
            });
          } else {
            S.push({
              key: 'g-journey', label: 'Gate 2 · journeybased', status: 'pass',
              text: `${this.userName}'s activejourney is in the workshop's allowed list, so this gate passes.`,
            });
          }
        } else {
          S.push({
            key: 'g-journey', label: 'Gate 2 · journeybased', status: 'skip',
            text: workshopOnly && journeyBased
              ? `journeybased is set, but it is skipped for a workshop-only profile.`
              : `journeybased is false — this gate does not apply.`,
          });
        }
      }

      // 3. tier based (applies to every profile, workshop-only included)
      if (!blocked) {
        if (tierBased && !tierExempt) {
          const ok = tiers.some(t => selectedTiers.includes(t));
          if (!ok) {
            blocked = 'tierLocked';
            S.push({
              key: 'g-tier', label: 'Gate 3 · tierbased', status: 'fail',
              text: `The workshop sets tierbased and accepts only the tiers ${this.names(selectedTiers, c.tierNames)}, while ${this.userName} holds ${this.names(tiers, c.tierNames)} — none of which match. They are also not on evergreenaccessto.selected, which would have exempted them from this tier check. They are shown the "Upgrade to Access!" dialog. To let them in: give them one of the accepted tiers, add their profileid to evergreenaccessto.selected, or set tierbased to false.`,
              facts: [{ k: 'selectedtiers', v: this.names(selectedTiers, c.tierNames) },
                      { k: 'user tier', v: this.names(tiers, c.tierNames) },
                      { k: 'tier exempt', v: 'false' }],
            });
          } else {
            S.push({
              key: 'g-tier', label: 'Gate 3 · tierbased', status: 'pass',
              text: `${this.userName} holds a tier the workshop accepts, so this gate passes.`,
              facts: [{ k: 'matched', v: this.names(tiers.filter(t => selectedTiers.includes(t)), c.tierNames) }],
            });
          }
        } else if (tierBased && tierExempt) {
          S.push({
            key: 'g-tier', label: 'Gate 3 · tierbased', status: 'pass',
            text: `The workshop is tierbased, but this profileid is hand-picked in evergreenaccessto.selected, which exempts it from the tier check (the owner's list wins). Only the tier gate is skipped — the other gates still apply.`,
          });
        } else {
          S.push({
            key: 'g-tier', label: 'Gate 3 · tierbased', status: 'skip',
            text: `tierbased is false — this gate does not apply.`,
          });
        }
      }

      // 4. active participants (skipped for workshop-only; absent status does NOT block)
      if (!blocked) {
        if (!workshopOnly && activeParticipants) {
          if (customerStatus !== null && customerStatus !== 'active') {
            blocked = 'subscriptionInactive';
            S.push({
              key: 'g-sub', label: 'Gate 4 · activeparticipants', status: 'fail',
              text: `The workshop requires an active subscription and ${this.userName}'s customerstatus is "${customerStatus}". They are shown the "Subscription Expired" dialog. Note a MISSING customerstatus would have passed — only a present, non-active status blocks.`,
              facts: [{ k: 'customerstatus', v: this.val(customerStatus) }],
            });
          } else {
            S.push({
              key: 'g-sub', label: 'Gate 4 · activeparticipants', status: 'pass',
              text: customerStatus === null
                ? `The workshop requires an active subscription, but this profile has no customerstatus at all — an absent status does not block, so the gate passes.`
                : `customerstatus is "active", so this gate passes.`,
            });
          }
        } else {
          S.push({
            key: 'g-sub', label: 'Gate 4 · activeparticipants', status: 'skip',
            text: workshopOnly && activeParticipants
              ? `activeparticipants is set, but it is skipped for a workshop-only profile.`
              : `activeparticipants is false — this gate does not apply.`,
          });
        }
      }
    }

    // ═════ LAYER 2 — the evergreenaccessto access list ═════
    // Runs only for an evergreen workshop that is either a referral one or
    // carries a non-empty evergreenaccessto map.
    const layer2Applies = evergreen && (referral || Object.keys(access).length > 0);
    let decision: 'allow' | 'referralRequired' | 'blocked' | 'blockedNew' | null = null;

    if (!blocked) {
      if (!layer2Applies) {
        S.push({
          key: 'layer2', label: 'Layer 2 · evergreenaccessto', status: 'skip',
          text: `The access list does not apply here: evergreenWorkshop is ${evergreen}, referralworkshop is ${referral} and the evergreenaccessto map ${Object.keys(access).length ? 'is set' : 'is empty'}. The gate only runs for an evergreen workshop that is either a referral one or carries a non-empty evergreenaccessto map — so this workshop is open to anyone who cleared the gates above.`,
        });
      } else {
        if (isNewUser) {
          decision = accessNew ? 'referralRequired' : 'blockedNew';
        } else if (accessAll) {
          decision = 'allow';
        } else {
          decision = accessSelected.includes(c.pid) ? 'allow' : 'blocked';
        }

        const cfg = [
          { k: 'evergreenWorkshop', v: String(evergreen) },
          { k: 'referralworkshop', v: String(referral) },
          { k: 'evergreenaccessto.all', v: String(accessAll) },
          { k: 'evergreenaccessto.new', v: String(accessNew) },
          { k: 'evergreenaccessto.selected', v: `${accessSelected.length} profile(s)` },
          { k: 'on the list', v: String(accessSelected.includes(c.pid)) },
        ];

        if (decision === 'allow') {
          S.push({
            key: 'layer2', label: 'Layer 2 · evergreenaccessto', status: 'pass',
            text: `${this.userName} is admitted by the access list — ${accessAll ? 'evergreenaccessto.all is true, so every existing user is allowed' : 'they are on the evergreenaccessto.selected list'} — so enrollment proceeds.`,
            facts: cfg,
          });
        } else if (decision === 'blocked') {
          S.push({
            key: 'layer2', label: 'Layer 2 · evergreenaccessto', status: 'fail',
            text: `This evergreen workshop is open only to the ${accessSelected.length} hand-picked profile(s) on its evergreenaccessto.selected list, and ${this.userName} is not one of them while evergreenaccessto.all is not true. A valid tier does NOT exempt anyone from this list — the relationship runs one way only. They are shown "Currently Unavailable for You"${notAllowedMsg ? ` with the workshop's enrollmentnotallowedmessage` : ` ("Enrollment is not available." — no enrollmentnotallowedmessage is set)`}. To let them in: set evergreenaccessto.all to true (tierbased still applies first), or add ${c.pid} to evergreenaccessto.selected.`,
            facts: cfg,
          });
        } else if (decision === 'blockedNew') {
          S.push({
            key: 'layer2', label: 'Layer 2 · evergreenaccessto', status: 'fail',
            text: `${this.userName} is a NEW user, so the decision is made by evergreenaccessto.new alone, which is ${this.val(access['new'])} rather than true. New users are refused outright no matter what tier they hold and no matter what evergreenaccessto.all or the selected list say. They are shown "Currently Unavailable for You"${notAllowedMsgNew ? ` with the workshop's enrollmentnotallowedmessagenew` : ` ("Enrollment is not available." — no enrollmentnotallowedmessagenew is set)`}. To let new users in: set evergreenaccessto.new to true, and give them a way to transact (payment true and/or referralworkshop true with paymentmap.paymentfor set to "new" or "both").`,
            facts: cfg,
          });
        } else {
          S.push({
            key: 'layer2', label: 'Layer 2 · evergreenaccessto', status: 'pass',
            text: `${this.userName} is a NEW user and evergreenaccessto.new is true, so they are admitted into the referral flow: the app shows the referral-code / Buy dialog rather than enrolling them straight away.`,
            facts: cfg,
          });
        }
      }
    }

    // ═════ the inline pay / coupon card ═════
    // Independent of the gates above: it decides whether ENROLL is replaced.
    const audienceAllows = paymentFor === 'new' ? isNewUser
      : paymentFor === 'exist' ? !isNewUser : true;
    const statusMatches = !isNewUser && customerStatus !== null
      && payStatuses.includes(customerStatus.trim().toLowerCase());
    const payAllows = (!isNewUser && payStatuses.length) ? statusMatches : audienceAllows;
    const paymentEnabled = evergreen && payment && payAllows;
    const freeAccess = decision === 'allow';
    const referralEnabled = evergreen && !freeAccess && referral && audienceAllows;
    const showCard = evergreen && !freeAccess && (paymentEnabled || referralEnabled);

    S.push({
      key: 'card', label: 'Pay / coupon card', status: showCard ? 'info' : 'skip',
      text: !evergreen
        ? `The inline pay/coupon card is an evergreen-flow feature and this workshop is not evergreen, so the ENROLL button is never replaced.`
        : freeAccess
          ? `${this.userName} already has free access, so the pay card is deliberately never shown to them — they enroll free through the normal flow.`
          : showCard
            ? `The pay/coupon card REPLACES the ENROLL button for this profile: ${paymentEnabled ? 'the Razorpay pay option is active' : 'there is no pay option'}, ${referralEnabled ? 'and the referral-code (free coupon) field is offered' : 'and there is no coupon field'}.`
            : `No pay or coupon route exists for this profile: payment is ${payment}, referralworkshop is ${referral}, and the offer targets "${this.val(paymentFor)}" users while this profile is ${isNewUser ? 'a new' : 'an existing'} user with customerstatus ${this.val(customerStatus)}. So the ENROLL button stays and the tap falls through to the refusal dialog.`,
      facts: [
        { k: 'payment', v: String(payment) },
        { k: 'paymentmap.paymentfor', v: this.val(paymentFor) },
        { k: 'paymentmap.customerstatus', v: payStatuses.length ? payStatuses.join(', ') : 'none' },
        { k: 'showCard', v: String(showCard) },
        { k: 'paymentEnabled', v: String(paymentEnabled) },
        { k: 'referralEnabled', v: String(referralEnabled) },
        { k: 'payment log docs', v: String(c.payments.size) },
        { k: 'referral docs', v: String(c.referrals.size) },
      ],
    });

    // ═════ LAYER 3 — the enrollment write itself ═════
    // Even a user who clears every UX gate is refused here. Both checks live in
    // WorkshopService._validateAndWrite, after the gates above.
    const detail = this.map(w['detailpage']);
    const regStart = this.date(detail['registrationStartDate']);
    const regEnd = this.date(detail['registrationEndDate']);
    const now = new Date();
    // Evergreen workshops have no fixed window — the date gate is skipped.
    const regOpen = evergreen || !((regStart && now < regStart) || (regEnd && now > regEnd));
    let writeBlocked: string | null = null;

    if (evergreen) {
      S.push({
        key: 'g-reg', label: 'Write gate · registration window', status: 'skip',
        text: `Evergreen workshops have no fixed registration window — they can be started at any time — so the date gate is skipped.`,
      });
    } else if (!regOpen) {
      writeBlocked = 'registrationClosed';
      S.push({
        key: 'g-reg', label: 'Write gate · registration window', status: 'fail',
        text: `Registration is CLOSED right now, so the enrollment write refuses even though the gates above passed. This is a workshop-wide block — it refuses every user, not just this one.`,
        facts: [{ k: 'registrationStartDate', v: this.fmt(regStart) },
                { k: 'registrationEndDate', v: this.fmt(regEnd) },
                { k: 'now', v: this.fmt(now) }],
      });
    } else {
      S.push({
        key: 'g-reg', label: 'Write gate · registration window', status: 'pass',
        text: `Registration is open right now.`,
        facts: [{ k: 'registrationStartDate', v: this.fmt(regStart) },
                { k: 'registrationEndDate', v: this.fmt(regEnd) }],
      });
    }

    const hasChallenges = w['challenges'] !== null && w['challenges'] !== undefined;
    if (!hasChallenges) {
      writeBlocked = writeBlocked || 'challengesNotAssigned';
      S.push({
        key: 'g-ch', label: 'Write gate · challenges assigned', status: 'fail',
        text: `The workshop has no challenges array at all, so the enrollment write refuses with "challenges not assigned". Another workshop-wide block: build the curriculum on the Challenges tab before anyone can enroll.`,
      });
    } else {
      S.push({
        key: 'g-ch', label: 'Write gate · challenges assigned', status: 'pass',
        text: `The workshop has a challenges array, so the write is not blocked on curriculum.`,
        facts: [{ k: 'sets', v: String(this.list(w['challenges']).length || (Array.isArray(w['challenges']) ? w['challenges'].length : 0)) }],
      });
    }

    // Not a gate, but it explains a status an admin is likely to misread.
    if (w['categorybased'] === true) {
      S.push({
        key: 'category', label: 'Category based', status: 'info',
        text: `This is a category-based workshop, so a successful enrollment is written with status "enrollednotstarted" and never carries waitingstartedat: the user picks a focus group first, and only then does the workshop start. An enrolled user sitting at "enrollednotstarted" here is waiting on that choice, not blocked. Category settings never affect eligibility.`,
      });
    }

    if (evergreen) {
      S.push({
        key: 'queue', label: 'Evergreen queue', status: 'info',
        text: `On an evergreen workshop, a user who already has another active evergreen workshop is QUEUED rather than started: the enrollment is written with status "enrollednotstarted" and a waitingstartedat timestamp, and Start stays locked until the current one finishes. That is expected behaviour, not a refusal. This tool does not check the user's other workshops, so it cannot tell you here whether this particular enrollment would be queued.`,
      });
    }

    // ═════ verdict ═════
    if (blocked) {
      this.verdict = 'block';
      this.dialogSeen = blocked === 'newUsersOnly' ? "You're not eligible"
        : blocked === 'journeyNotAllowed' ? 'Contact Admin'
        : blocked === 'tierLocked' ? 'Upgrade to Access!'
        : 'Subscription Expired';
      this.headline = `${this.userName} CANNOT enroll — refused by the eligibility layer.`;
    } else if (decision === 'blocked' || decision === 'blockedNew') {
      this.verdict = 'block';
      this.dialogSeen = 'Currently Unavailable for You';
      this.headline = `${this.userName} CANNOT enroll — cleared eligibility but refused by the evergreenaccessto access list.`;
    } else if (decision === 'referralRequired') {
      this.verdict = 'card';
      this.dialogSeen = 'Referral code / Buy dialog';
      this.headline = `${this.userName} is admitted into the referral flow, not enrolled directly.`;
    } else if (showCard) {
      this.verdict = 'card';
      this.dialogSeen = 'Pay / coupon card replaces ENROLL';
      this.headline = `${this.userName} must pay or redeem a code — the ENROLL button is replaced by the card.`;
    } else if (active.length) {
      this.verdict = 'allow';
      this.dialogSeen = 'Already enrolled — participant screen';
      this.headline = `${this.userName} is already enrolled in this workshop.`;
    } else if (writeBlocked) {
      this.verdict = 'block';
      this.dialogSeen = writeBlocked === 'registrationClosed'
        ? 'Registration closed' : 'Challenges not assigned';
      this.headline = writeBlocked === 'registrationClosed'
        ? `${this.userName} passes every gate, but registration is closed — nobody can enroll right now.`
        : `${this.userName} passes every gate, but this workshop has no challenges assigned — nobody can enroll.`;
    } else {
      this.verdict = 'allow';
      this.dialogSeen = '';
      this.headline = `${this.userName} CAN enroll — every gate this workshop configures passes.`;
    }

    this.steps = S;
  }

  reset(): void {
    this.ran = false; this.steps = []; this.error = '';
    this.headline = ''; this.dialogSeen = ''; this.kindMismatch = '';
    this.resolvedNote = ''; this.candidates = [];
  }
}
