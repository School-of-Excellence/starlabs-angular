import { CommonModule } from '@angular/common';
import { Component, Inject, ViewChild, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { collection, collectionData, doc, Firestore, orderBy, query, where, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-studio-preassign-dialog',
  imports: [
    MatTableModule,
    MatIconModule,
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatPaginatorModule,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatInputModule
  ],
  templateUrl: './studio-preassign-dialog.component.html',
  styleUrl: './studio-preassign-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudioPreassignDialogComponent implements OnDestroy {

  // Array declarations 
  displayedColumns: string[] = ['participants', 'preassign', 'activities', 'atcModel'];
  queueTokenList = [];
  filteredTokenList = []; // Cached filtered token list

  // Object declarations 
  mapProfile: any = {};
  stageTokenMap: any = {};
  studioPreAssign: any = {};
  mapBigActivity: any = {};
  stageStudioMap: any = {};
  studioAssignmentMap: any = {};

  // String declarations
  filterText: string = '';
  participantFilter: string = '';

  // Boolean declarations
  loading: boolean = true;

  // Subjects for debouncing
  private unsubscribe$ = new Subject<void>();
  private participantFilterSubject$ = new Subject<string>();
  private tokenFilterSubject$ = new Subject<string>();

  filteredStudioPairingList: MatTableDataSource<any>;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  constructor(
    public dialogRef: MatDialogRef<StudioPreassignDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data,
    public firestore: Firestore,
    private guard: AuthguardService,
    private cdr: ChangeDetectorRef
  ) {
    guard.getProfileMap().then(data => {
      this.mapProfile = data.map;
      this.cdr.markForCheck();
    });

    // Debounced participant filter (300ms delay)
    this.participantFilterSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.unsubscribe$)
    ).subscribe(filterValue => {
      if (this.filteredStudioPairingList) {
        this.filteredStudioPairingList.filter = filterValue.trim().toLowerCase();
        if (this.filteredStudioPairingList.paginator) {
          this.filteredStudioPairingList.paginator.firstPage();
        }
        this.cdr.markForCheck();
      }
    });

    // Debounced token filter (300ms delay)
    this.tokenFilterSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.unsubscribe$)
    ).subscribe(filterValue => {
      this.updateFilteredTokenList(filterValue);
      this.cdr.markForCheck();
    });
  }

  ngOnInit() {
    collectionData(collection(this.firestore, "bigactivity"), { idField: 'id' }).pipe(takeUntil(this.unsubscribe$)).subscribe(snap => {
      snap.forEach(e => {
        this.mapBigActivity[e["docid"]] = e["activity"];
      });
      this.cdr.markForCheck();
    });

    // Live Assignment
    collectionData(query(collection(this.firestore, "live assignment"), where("queueid", "==", this.data.selectedQueue["docid"]))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
      var completedStageAssignment = {};
      // Group Assignment by Studio
      this.studioAssignmentMap = list.reduce(function (r, a) {
        completedStageAssignment[a["stagename"]] = completedStageAssignment[a["stagename"]] || [];
        if (a["status"] == "completed") completedStageAssignment[a["stagename"]].push(a);
        r[a["studioid"]] = r[a["studioid"]] || [];
        if (!r[a["studioid"]].includes(a["participantid"])) r[a["studioid"]].push(a["participantid"]);
        return r;
      }, {});

      this.sortStudioAssignment();
      this.cdr.markForCheck();
    });

    var stageActivityParse = {};
    var stageList = this.data.selectedQueue["stages"] ?? [];
    for (let i = 0; i < stageList.length; i++) {
      const stage = stageList[i];
      const stageProperty = this.data.selectedQueue["stageproperty"][stage];
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {});
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination: any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination) ? activitycombination : [activitycombination];
        var parse = combinationArray.sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        stageActivityParse[parse] = stageActivityParse[parse] ?? [];
        stageActivityParse[parse].push(stage);
      }
    }

    // Queue Studio Pairing
    collectionData(query(collection(this.firestore, "queue studio pairing"), where("queueref", "==", doc(this.firestore, "queue generation", this.data.selectedQueue["docid"])), orderBy("created", "desc"))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
      list = list.filter((e) => e['studioin']);
      this.filteredStudioPairingList = new MatTableDataSource(list);
      this.filteredStudioPairingList.paginator = this.paginator;

      // Set custom filter predicate with cached mapProfile reference
      const mapProfile = this.mapProfile;
      this.filteredStudioPairingList.filterPredicate = (data: any, filter: string): boolean => {
        if (!filter) return true;
        const participants = data.participants || [];
        for (let i = 0; i < participants.length; i++) {
          const name = mapProfile[participants[i]] || '';
          if (name.toLowerCase().includes(filter)) {
            return true;
          }
        }
        return false;
      };

      var localMap = {};
      var checkin = 0;
      for (let i = 0; i < list.length; i++) {
        const studio = list[i];
        if (studio["checkin"]) checkin += 1;
        var studioActivity = Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        (stageActivityParse[studioActivity] ?? []).forEach(stage => {
          localMap[stage] = localMap[stage] ?? [];
          if (localMap[stage].filter((e: { [key: string]: any }) => e["docid"] == studio["docid"]).length == 0) localMap[stage].push(studio);
        });
      }
      this.stageStudioMap = localMap;
      this.sortStudioAssignment();
      this.cdr.markForCheck();
    });

    // Queue Token
    collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, "queue generation", this.data.selectedQueue.docid)), where("tokenstatus", "==", "Active"), orderBy("logdate", "asc"))).pipe(takeUntil(this.unsubscribe$)).subscribe(token => {
      this.queueTokenList = token.sort((a, b) => (a["profile_name"] ?? "").localeCompare(b["profile_name"] ?? ""));
      this.filteredTokenList = [...this.queueTokenList]; // Initialize filtered list
      
      var localPreAssign = {};
      // Group token by Stage
      this.stageTokenMap = this.queueTokenList.reduce(function (r, a) {
        // Pre Assigned
        Object.keys(a["preassigned"] ?? {}).forEach(stage => {
          (a["preassigned"][stage] ?? []).forEach(studio => {
            localPreAssign[studio] = localPreAssign[studio] ?? [];
            localPreAssign[studio].push(a);
          });
        });
        // Filter Token Status
        r[a["currentstage"]] = r[a["currentstage"]] || {};
        r[a["currentstage"]]["waiting"] = r[a["currentstage"]]["waiting"] ?? 0;
        r[a["currentstage"]]["queued"] = r[a["currentstage"]]["queued"] ?? 0;
        r[a["currentstage"]]["instudio"] = r[a["currentstage"]]["instudio"] ?? 0;
        r[a["currentstage"]]["total"] = (r[a["currentstage"]]["total"] ?? 0) + 1;
        r[a["currentstage"]]["tokenlist"] = r[a["currentstage"]]["tokenlist"] ?? [];
        r[a["currentstage"]]["tokenlist"].push(a);
        if (a["status"] == "ready") {
          r[a["currentstage"]]["waiting"] += 1;
        }
        else if (a["status"] == null || a["status"] == "queued" || a["status"] == "invited") {
          r[a["currentstage"]]["queued"] += 1;
        }
        else if (a["status"] == "instudio") {
          r[a["currentstage"]]["instudio"] += 1;
        }
        return r;
      }, {});
      this.studioPreAssign = localPreAssign;
      this.cdr.markForCheck();
    });

    setTimeout(() => {
      this.loading = false;
      this.cdr.markForCheck();
    }, 500);
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  sortStudioAssignment() {
    Object.keys(this.stageStudioMap).forEach(key => {
      this.stageStudioMap[key]?.sort((a, b) => (this.studioAssignmentMap[b["docid"]]?.length ?? 0) - (this.studioAssignmentMap[a["docid"]]?.length ?? 0));
    });
  }

  getUniquePreAssignedTokens(studioid: string): any[] {
    const tokens = this.studioPreAssign[studioid];
    if (!tokens) return [];

    // Use Map for O(1) lookup instead of findIndex
    const seen = new Map();
    const result = [];
    for (const token of tokens) {
      if (!seen.has(token['docid'])) {
        seen.set(token['docid'], true);
        result.push(token);
      }
    }
    return result;
  }

  getStageName(token, studioid): string {
    if (!token['preassigned']) return 'N/A';

    const stages = [];
    const preassigned = token['preassigned'];
    for (const stage of Object.keys(preassigned)) {
      const studios = preassigned[stage];
      if (Array.isArray(studios) && studios.includes(studioid)) {
        stages.push(stage);
      }
    }
    return stages.length > 0 ? stages.join(', ') : 'N/A';
  }

  updatePreAssigned(studioid, value) {
    var batch = writeBatch(this.firestore);
    var selectedToken = value.map(e => e["docid"]);
    let stages = Object.keys(this.stageStudioMap).filter(element => {
      let studioList = this.stageStudioMap[element].filter(e => e['docid'] == studioid);
      return studioList.length > 0;
    });

    value.forEach(token => {
      token["preassigned"] = token["preassigned"] ?? {};
      stages.forEach((stage) => {
        token["preassigned"][stage] = token["preassigned"][stage] ?? [];
        if (!token["preassigned"][stage].includes(studioid)) token["preassigned"][stage].push(studioid);
      });

      batch.update(doc(this.firestore, "queue_token", token["docid"]), {
        preassigned: token["preassigned"]
      });
    });

    stages.forEach((stage) => {
      var assignedToken = this.queueTokenList.filter(e => (e["preassigned"] ?? {})[stage] != null && (e["preassigned"] ?? {})[stage] != undefined);

      assignedToken.forEach(token => {
        if (!selectedToken.includes(token["docid"])) {
          token["preassigned"] = token["preassigned"] ?? {};
          token["preassigned"][stage] = token["preassigned"][stage] ?? [];
          var index = token["preassigned"][stage].findIndex(e => e == studioid);
          if (index != -1) {
            token["preassigned"][stage].splice(index, 1);

            batch.update(doc(this.firestore, "queue_token", token["docid"]), {
              preassigned: token["preassigned"]
            });
          }
        }
      });
    });
    batch.commit();
  }

  // Debounced token filter input handler
  onTokenFilterChange(value: string) {
    this.tokenFilterSubject$.next(value);
  }

  // Update filtered token list (called after debounce)
  private updateFilteredTokenList(filterValue: string) {
    if (!filterValue) {
      this.filteredTokenList = [...this.queueTokenList];
    } else {
      const lowerFilter = filterValue.toLowerCase();
      this.filteredTokenList = this.queueTokenList.filter(e => 
        (e["profile_name"] || '').toLowerCase().includes(lowerFilter)
      );
    }
  }

  // Apply participant filter with debounce
  onParticipantFilterChange(value: string) {
    this.participantFilterSubject$.next(value);
  }

  // Clear the participant filter
  clearParticipantFilter() {
    this.participantFilter = '';
    this.participantFilterSubject$.next('');
  }

  // Track by function for ngFor performance
  trackByDocId(index: number, item: any): string {
    return item?.docid || index;
  }

  trackByParticipant(index: number, participant: string): string {
    return participant || index.toString();
  }
}