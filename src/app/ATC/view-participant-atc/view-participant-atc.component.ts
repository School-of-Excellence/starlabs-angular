import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  collection, getFirestore, query, where, orderBy,
  getDocs, doc, getDoc
} from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { AuthguardService } from '../../authguard.service';

interface TranscriptionItem {
  adjustment: { id: string; data: any; path: string };
  procedures: { id: string; data: any; path: string }[];
}

interface ATCItem {
  id: string;
  path: string;
  data: any;
  transcription: TranscriptionItem[];
}

interface ProductGroup {
  product: string;
  atcItems: ATCItem[];
}

@Component({
  selector: 'app-view-participant-atc',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule
  ],
  templateUrl: './view-participant-atc.component.html',
  styleUrl: './view-participant-atc.component.css'
})
export class ViewParticipantAtcComponent implements OnInit, OnChanges, OnDestroy {
  @Input() profileid?: string;
  // When set, ATCs whose `queueid` matches will be excluded — used by the
  // "Previous Cycle" step in dynamic-studio-v2 so the current queue's ATCs
  // don't appear there (they already show in the View Submitted ATC step).
  @Input() excludeQueueId?: string;

  // private firestore = inject(Firestore);
  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore
  private route = inject(ActivatedRoute);
  private guard = inject(AuthguardService);

  private destroy$ = new Subject<void>();

  // Signals
  loading = signal(true);
  profileId = signal<string | null>(null);
  participantName = signal('');
  participantProfile = signal<any>(null);

  private atcList = signal<ATCItem[]>([]);

  // Filter signal: re-evaluates productGroups when the excludeQueueId
  // @Input() changes (we update it via ngOnChanges).
  private excludeQueueIdSignal = signal<string | null>(null);

  // Computed: Group ATCs by consecutive products, excluding any whose
  // queueid matches `excludeQueueId` (for the "Previous Cycle" view).
  productGroups = computed<ProductGroup[]>(() => {
    const exclude = this.excludeQueueIdSignal();
    const all = this.atcList();
    const atcs = all.filter(a => !exclude || !this.atcMatchesQueue(a, exclude));
    console.log('[view-participant-atc] excludeQueueId=', exclude,
      'in=', all.length, 'out=', atcs.length,
      'sample-queue-fields=', all.slice(0, 3).map(a => ({
        queueid: a.data?.['queueid'],
        queueref_id: a.data?.['queueref']?.id,
        queueref_path: a.data?.['queueref']?.path,
      })));
    if (atcs.length === 0) return [];

    const groups: ProductGroup[] = [];
    let currentGroup: ProductGroup | null = null;

    for (const atc of atcs) {
      const product = atc.data['product'] || 'No Product Mentioned';

      if (!currentGroup || currentGroup.product !== product) {
        currentGroup = { product, atcItems: [atc] };
        groups.push(currentGroup);
      } else {
        currentGroup.atcItems.push(atc);
      }
    }

    return groups;
  });

  totalATCs = computed(() => {
    const exclude = this.excludeQueueIdSignal();
    return this.atcList()
      .filter(a => !exclude || !this.atcMatchesQueue(a, exclude))
      .length;
  });

  /**
   * Returns true when the ATC belongs to the given queue. Checks multiple
   * possible field shapes since older ATCs may have stored a DocumentReference
   * (`queueref`) instead of a flat string (`queueid`).
   */
  private atcMatchesQueue(atc: ATCItem, queueId: string): boolean {
    const d: any = atc?.data || {};
    if (d['queueid'] === queueId) return true;
    if (d['queueref']?.id === queueId) return true;
    if (d['queueref']?.path && typeof d['queueref'].path === 'string'
        && d['queueref'].path.endsWith('/' + queueId)) return true;
    // Tokens / live-assignment-linked fields some ATCs carry
    if (d['liveassignment']?.['queueid'] === queueId) return true;
    return false;
  }

  // Lookup maps
  profileMap: Record<string, any> = {};
  procedureMap: Record<string, string> = {};
  mapBigActivity: Record<string, string> = {};

  // Per-ATC expand/collapse state for the "View Full ATC" toggle.
  expandedATCIds = signal<Set<string>>(new Set<string>());

  toggleATC(atcId: string): void {
    const next = new Set(this.expandedATCIds());
    if (next.has(atcId)) next.delete(atcId);
    else next.add(atcId);
    this.expandedATCIds.set(next);
  }

  isATCExpanded(atcId: string): boolean {
    return this.expandedATCIds().has(atcId);
  }

  ngOnInit(): void {
    // Seed the exclusion signal from the @Input on first render
    console.log('[view-participant-atc] ngOnInit excludeQueueId =', this.excludeQueueId);
    this.excludeQueueIdSignal.set(this.excludeQueueId || null);
    if (this.profileid) {
      this.profileId.set(this.profileid);
      this.loadAllData(this.profileid);
      return;
    }
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const profileid = params['profileid'];
      if (profileid) {
        this.profileId.set(profileid);
        this.loadAllData(profileid);
      } else {
        this.loading.set(false);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profileid'] && !changes['profileid'].firstChange) {
      const next = changes['profileid'].currentValue;
      if (next) {
        this.profileId.set(next);
        this.loadAllData(next);
      }
    }
    if (changes['excludeQueueId']) {
      const v = changes['excludeQueueId'].currentValue || null;
      console.log('[view-participant-atc] @Input excludeQueueId changed →', v,
        '(firstChange:', changes['excludeQueueId'].firstChange, ')');
      this.excludeQueueIdSignal.set(v);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadAllData(profileId: string): Promise<void> {
    this.loading.set(true);

    try {
      // Load profile map
      const profileMapData = await this.guard.getProfileMap();
      this.profileMap = profileMapData.docdata;

      // Load participant profile
      const profileDoc = await getDoc(doc(this.firestoreDefault, `profile_data/${profileId}`));
      if (profileDoc.exists()) {
        const profileData = profileDoc.data();
        this.participantProfile.set(profileData);
        this.participantName.set(profileData['name'] || 'Unknown');
        this.profileMap[profileId] = { ...this.profileMap[profileId], ...profileData };
      }

      // Load procedures
      const proceduresSnap = await getDocs(collection(this.firestoreDefault, 'procedures'));
      proceduresSnap.forEach(docSnap => {
        this.procedureMap[docSnap.ref.path] = docSnap.data()['name'];
      });

      // Load big activity
      const bigActivitySnap = await getDocs(collection(this.firestoreDefault, 'bigactivity'));
      bigActivitySnap.forEach(docSnap => {
        const data = docSnap.data();
        this.mapBigActivity[data['docid']] = data['activity'];
      });

      // Load all ATCs with full data
      await this.loadAllATCsWithTranscription(profileId);

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAllATCsWithTranscription(profileId: string): Promise<void> {
    const baseConstraints = [
      where('isdelete', '==', false),
      where('profileid', '==', profileId),
      where('type', '==', 'online'),
      orderBy('prescription_date', 'desc')
    ];

    // Fetch from both collections
    const alphaQuery = query(collection(this.firestoreATC, 'atc_alpha'), ...baseConstraints);
    const validateQuery = query(
      collection(this.firestoreATC, 'atc_to_validate'),
      where('status', '==', 'atc given'),
      ...baseConstraints
    );

    const [alphaSnap, validateSnap] = await Promise.all([
      getDocs(alphaQuery),
      getDocs(validateQuery)
    ]);

    // Merge and dedupe
    const atcMap = new Map<string, ATCItem>();

    const processDoc = (docSnap: any) => {
      if (!docSnap.data()['isdelete']) {
        atcMap.set(docSnap.id, {
          id: docSnap.id,
          path: docSnap.ref.path,
          data: docSnap.data(),
          transcription: []
        });
      }
    };

    alphaSnap.forEach(processDoc);
    validateSnap.forEach(processDoc);

    // Sort by prescription_date desc
    const sortedATCs = Array.from(atcMap.values()).sort(
      (a, b) => b.data['prescription_date'].toDate() - a.data['prescription_date'].toDate()
    );

    // Load all transcriptions in parallel
    await Promise.all(sortedATCs.map(atc => this.loadTranscription(atc)));

    console.log('[view-participant-atc] loaded', sortedATCs.length, 'ATCs for profile',
      profileId, '— excludeQueueId currently =', this.excludeQueueIdSignal());
    this.atcList.set(sortedATCs);
  }

  private async loadTranscription(atc: ATCItem): Promise<void> {
    try {
      const correctionsSnap = await getDocs(collection(this.firestoreATC, `${atc.path}/corrections`));

      const transcriptionPromises = correctionsSnap.docs.map(async (adjDoc) => {
        const proceduresSnap = await getDocs(collection(this.firestoreATC, `${adjDoc.ref.path}/procedures`));

        return {
          adjustment: {
            id: adjDoc.id,
            data: adjDoc.data(),
            path: adjDoc.ref.path
          },
          procedures: proceduresSnap.docs.map(pDoc => ({
            id: pDoc.id,
            data: pDoc.data(),
            path: pDoc.ref.path
          }))
        };
      });

      atc.transcription = await Promise.all(transcriptionPromises);
    } catch (error) {
      console.error('Error loading transcription:', error);
    }
  }

  // Helper methods
  getAuthorNames(authors: any[]): string {
    if (!authors || authors.length === 0) return '-';
    return authors
      .map(author => this.profileMap[author.id]?.name || 'Unknown')
      .join(', ');
  }

  getProfileName(profileId: string): string {
    return this.profileMap[profileId]?.name || 'Unknown';
  }

  getBigActivityEntries(bigActivity: any): { key: string; value: any[] }[] {
    if (!bigActivity || typeof bigActivity !== 'object') return [];
    return Object.entries(bigActivity).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value : [value]
    }));
  }

  getProcedureName(procedureRef: any): string {
    return this.procedureMap[procedureRef?.path] || 'Unknown Procedure';
  }

  getAssignedNames(assignedTo: any[]): string {
    if (!assignedTo || assignedTo.length === 0) return '-';
    return assignedTo
      .map(author => this.profileMap[author.id]?.name || 'Unknown')
      .join(', ');
  }

  getProcedureStatus(procData: any): 'completed' | 'autogeneralized' | null {
    if (procData?.['autogeneralized']) return 'autogeneralized';
    if (procData?.['status'] === 'completed') return 'completed';
    return null;
  }
}