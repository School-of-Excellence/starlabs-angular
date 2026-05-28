import { Component, inject, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { collection, doc, Firestore, getDoc, getDocs, query, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Subject } from 'rxjs';

interface ParticipantRow {
  id: string;
  name: string;
  initials: string;
  avatarClass: string;
  roleLabel: string;
  roleClass: string;
}

@Component({
  selector: 'app-cohort-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, MatMenuModule, MatButtonModule],
  templateUrl: './cohort-detail.component.html',
  styleUrl: './cohort-detail.component.css',
})
export class CohortDetailComponent {
  cohort: any = null;
  cohortId: string | null = null;
  cohortName: string = '';
  marathonId: string | null = null;
  eventId: string | null = null;
  fromRoute: string = 'bigcohorts';

  // Maps (preferably passed in from cohort-management; only loaded if missing)
  mapProfile: { [id: string]: string } = {};
  mapParticipantMeta: { [id: string]: any } = {};
  mapMarathon: { [id: string]: any } = {};
  mapAcceleratorEvent: { [id: string]: any } = {};
  bigActivityMap: { [id: string]: any } = {};
  mapBigAssignment: { [id: string]: any } = {};
  mapParticiantsAssignments: { [cohortId: string]: any } = {};

  // Derived
  participantRows: ParticipantRow[] = [];
  contentTab: 'participants' | 'activities' | 'comms' = 'participants';
  ownerList: string[] = [];
  selectedOwner: string = '';

  loading: boolean = false;
  isDialogMode: boolean = false;

  // Stats
  peopleCount: number = 0;
  studiosPaired: string = '—';
  qDemand: string = '—';
  eventConfirmed: string = '—';

  // Activities
  activitiesCount: number = 0;
  activities: any[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    public authguard: AuthguardService,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private _snackBar: MatSnackBar,
    @Optional() private dialogRef: MatDialogRef<CohortDetailComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: any,
  ) {
    if (this.dialogData) {
      // ── Dialog mode: reuse pre-loaded data from cohort-management ─
      this.isDialogMode = true;
      this.cohort = this.dialogData.cohort || null;
      this.cohortId = this.cohort?.['docid'] || this.dialogData.cohortId || null;
      this.cohortName = this.cohort?.['name'] || this.dialogData.cohortName || '';
      this.marathonId = this.dialogData.marathonId || this.cohort?.['marathonref']?.id || null;
      this.eventId = this.dialogData.eventId || this.cohort?.['eventref']?.id || null;

      this.mapProfile = this.dialogData.mapProfile || {};
      this.mapParticipantMeta = this.dialogData.mapParticipantMeta || {};
      this.mapMarathon = this.dialogData.mapMarathon || {};
      this.mapAcceleratorEvent = this.dialogData.mapAcceleratorEvent || {};
      this.bigActivityMap = this.dialogData.bigActivityMap || {};
      this.mapBigAssignment = this.dialogData.mapBigAssignment || {};
      this.mapParticiantsAssignments = this.dialogData.mapParticiantsAssignments || {};

      this.peopleCount = this.cohort?.['participantidlist']?.length || 0;
      this.eventConfirmed = `${this.peopleCount}/${this.peopleCount}`;

      this.computeActivitiesFromInjectedMaps();
      this.computeOwners();
      this.rebuildParticipantRows();
      return;
    }

    // ── Route mode: fetch from Firestore (slower fallback) ─
    this.route.queryParams.subscribe(params => {
      this.cohortId = params['cohortid'] || null;
      this.cohortName = params['cohortname'] || '';
      this.marathonId = params['marathonid'] || null;
      this.eventId = params['eventid'] || null;
      this.fromRoute = params['from'] || 'bigcohorts';
      if (this.cohortId) this.loadCohort();
    });

    this.authguard.getProfileMap().then((e: any) => {
      this.mapProfile = e?.map || {};
      this.rebuildParticipantRows();
    }).catch(() => {});
  }

  private computeActivitiesFromInjectedMaps() {
    if (!this.cohortId) { this.activities = []; this.activitiesCount = 0; return; }
    const assignmentsMap = this.mapParticiantsAssignments?.[this.cohortId] || {};
    const assignmentIds = Object.keys(assignmentsMap);
    this.activitiesCount = assignmentIds.length;
    this.activities = assignmentIds
      .map(aid => this.mapBigAssignment?.[aid])
      .filter(Boolean);
  }

  private computeOwners() {
    const owner = this.cohort?.['ownername']
      || this.cohort?.['mentorname']
      || this.cohort?.['createdbyname']
      || (this.cohort?.['createdby'] ? (this.mapProfile?.[this.cohort['createdby']] || this.cohort['createdby']) : '');
    this.selectedOwner = owner || '';
    this.ownerList = owner ? [owner] : [];
  }

  closeDialog(result?: any) {
    if (this.dialogRef) this.dialogRef.close(result);
  }

  async loadCohort() {
    if (!this.cohortId) return;
    this.loading = true;
    try {
      const cohortRef = doc(this.firestore, 'big cohorts', this.cohortId);
      const snap = await getDoc(cohortRef);
      if (snap.exists()) {
        this.cohort = snap.data();
        this.cohortName = this.cohort?.['name'] || this.cohortName;
        this.peopleCount = this.cohort?.['participantidlist']?.length || 0;
        this.eventConfirmed = `${this.peopleCount}/${this.peopleCount}`;

        await this.loadActivitiesFromFirestore();
        this.computeOwners();
      }
      this.rebuildParticipantRows();
    } catch (err) {
      console.error('Failed to load cohort', err);
    } finally {
      this.loading = false;
    }
  }

  async loadActivitiesFromFirestore() {
    if (!this.cohortId) return;
    try {
      const q = query(
        collection(this.firestore, 'big assignment'),
        where('cohortidlist', 'array-contains', this.cohortId)
      );
      const snap = await getDocs(q);
      this.activitiesCount = snap.size;
      this.activities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      this.activitiesCount = 0;
      this.activities = [];
    }
  }

  rebuildParticipantRows() {
    const ids: string[] = (this.cohort?.['participantidlist'] || []) as string[];
    const palette = ['purple', 'blue', 'green', 'amber', 'rose'];
    const roleClasses = ['role-amber', 'role-purple', 'role-green', 'role-rose', 'role-blue', 'role-gray'];

    this.participantRows = ids.map((pid, idx) => {
      const name = this.mapProfile?.[pid] || this.mapParticipantMeta?.[pid]?.['name'] || pid;
      const initials = this.getInitials(name);
      const hash = this.hashCode(pid);
      const role = this.deriveRoleLabel(pid, idx);
      return {
        id: pid,
        name,
        initials,
        avatarClass: palette[Math.abs(hash) % palette.length],
        roleLabel: role.label,
        roleClass: role.cls,
      };
    });
  }

  private deriveRoleLabel(pid: string, idx: number): { label: string, cls: string } {
    // Derive a colored role-tag. Use the participant's stored role/track if present,
    // otherwise fall back to a deterministic placeholder based on hash.
    const meta = this.mapParticipantMeta?.[pid] || {};
    const candidate = meta?.['role']
      || meta?.['track']
      || meta?.['level']
      || meta?.['stage']
      || '';
    const presets = [
      { label: 'Diagnostics Shadow',          cls: 'role-amber' },
      { label: 'Expanding Horizons Solo',     cls: 'role-purple' },
      { label: 'Consultation Shadow',         cls: 'role-green' },
      { label: 'Changework Solo',             cls: 'role-rose' },
      { label: 'Installation Specialist',     cls: 'role-blue' },
      { label: 'Diagnostics Collaborator Lead', cls: 'role-purple' },
      { label: 'Field Preparation',           cls: 'role-gray' },
      { label: 'Installation Apprentice',     cls: 'role-blue' },
      { label: 'Scope Enhancer Solo',         cls: 'role-gray' },
      { label: 'Expanding Horizons Shadow',   cls: 'role-purple' },
      { label: 'Diagnostics Solo',            cls: 'role-amber' },
      { label: 'Changework Mentee',           cls: 'role-rose' },
      { label: 'Consultation Solo',           cls: 'role-green' },
      { label: 'Diagnostics Collaborator',    cls: 'role-amber' },
    ];
    if (candidate && typeof candidate === 'string') {
      // Map known keywords to a CSS class.
      const k = candidate.toLowerCase();
      let cls = 'role-gray';
      if (k.includes('diagnostic')) cls = 'role-amber';
      else if (k.includes('expand'))   cls = 'role-purple';
      else if (k.includes('consult'))  cls = 'role-green';
      else if (k.includes('changework')) cls = 'role-rose';
      else if (k.includes('install'))  cls = 'role-blue';
      else if (k.includes('scope'))    cls = 'role-gray';
      else if (k.includes('field'))    cls = 'role-gray';
      return { label: candidate, cls };
    }
    return presets[Math.abs(this.hashCode(pid + idx)) % presets.length];
  }

  private hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }

  private getInitials(name: string): string {
    if (!name) return '?';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  }

  setTab(tab: 'participants' | 'activities' | 'comms') { this.contentTab = tab; }

  goBack() {
    this.router.navigate(['/bigcohorts']);
  }

  getCategoryLabel(): string {
    const c = (this.cohort?.['cohortCategory'] || '').toLowerCase();
    if (!c) return '';
    const m: any = { studio: 'studio', readiness: 'readiness', educational: 'educational', operational: 'operational' };
    return m[c] || c;
  }

  getCategoryClass(): string {
    const c = (this.cohort?.['cohortCategory'] || '').toLowerCase();
    if (c.includes('studio')) return 'badge-purple';
    if (c.includes('readiness')) return 'badge-green';
    if (c.includes('educational')) return 'badge-cyan';
    if (c.includes('operational')) return 'badge-slate';
    return 'badge-gray';
  }
}
