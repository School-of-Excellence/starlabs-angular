import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, limit, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MarkdownModule } from 'ngx-markdown';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-atc-generated-from-queue-stage',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatSnackBarModule,
    MarkdownModule,
  ],
  templateUrl: './atc-generated-from-queue-stage.component.html',
  styleUrl: './atc-generated-from-queue-stage.component.css'
})
export class AtcGeneratedFromQueueStageComponent implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['profileid', 'stage', 'createdAt', 'actions'];
  dataSource = new MatTableDataSource<any>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  queueGenerationList: any[] = [];
  selectedQueue: string | null = null;
  isLoadingQueues = false;
  isLoadingAtc = false;

  mapProfileData: { [key: string]: string } = {};
  selectedParticipant: any = null;

  rubricsOutput: any = null;
  showScoreBreakdown = false;

  nameFilter = '';
  typeFilter = '';
  availableTypes: string[] = [];

  viewMode: 'rubric' | 'raw' = 'rubric';

  editedOutput = '';
  isSavingOutput = false;

  constructor(
    private firestore: Firestore,
    public guard: AuthguardService,
    private snackBar: MatSnackBar
  ) {
    this.guard.getProfileMap().then(data => {
      this.mapProfileData = data.map;
    });
  }

  ngOnInit(): void {
    this.fetchQueues();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const f = JSON.parse(filter || '{}');
      const name = (this.mapProfileData[data.profileid] || data.profileid || '').toString().toLowerCase();
      const type = (data.type || '').toString().toLowerCase();
      const nameOk = !f.name || name.includes(f.name);
      const typeOk = !f.type || type === f.type;
      return nameOk && typeOk;
    };
  }

  private async fetchQueues() {
    this.isLoadingQueues = true;
    const snap = await getDocs(
      query(
        collection(this.firestore, 'queue generation'),
        orderBy('queueenddate', 'desc'),
        limit(5)
      )
    );
    this.queueGenerationList = snap.docs.map(d => d.data());
    this.isLoadingQueues = false;
  }

  async onQueueChange() {
    this.selectedParticipant = null;
    this.rubricsOutput = null;
    this.nameFilter = '';
    this.typeFilter = '';
    if (!this.selectedQueue) {
      this.dataSource.data = [];
      this.availableTypes = [];
      return;
    }
    this.isLoadingAtc = true;
    const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue);
    const snap = await getDocs(
      query(
        collection(this.firestore, 'queue_atc_generation'),
        where('queueref', '==', queueRef),
        where('status', '==', 'completed')
      )
    );
    this.dataSource.data = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    const set = new Set<string>();
    this.dataSource.data.forEach((r: any) => {
      const t = (r?.type ?? '').toString().trim();
      if (t) set.add(t);
    });
    this.availableTypes = Array.from(set).sort();
    this.applyFilters();
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    this.isLoadingAtc = false;
  }

  applyFilters() {
    this.dataSource.filter = JSON.stringify({
      name: this.nameFilter.trim().toLowerCase(),
      type: this.typeFilter.trim().toLowerCase(),
    });
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onNameFilterChange(value: string) {
    this.nameFilter = value;
    this.applyFilters();
  }

  onTypeFilterChange(value: string) {
    this.typeFilter = value || '';
    this.applyFilters();
  }

  viewDetails(row: any) {
    this.selectedParticipant = row;
    this.showScoreBreakdown = false;
    this.rubricsOutput = null;
    this.editedOutput = (row?.output ?? '').toString();

    const raw = this.pickOutput(row);
    this.rubricsOutput = this.parseOutput(raw);

    this.viewMode = (this.isRubricsScoring(row) && this.rubricsOutput) ? 'rubric' : 'raw';
  }

  setViewMode(mode: 'rubric' | 'raw') {
    this.viewMode = mode;
  }

  canShowRubricView(): boolean {
    return !!this.rubricsOutput;
  }

  async copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text ?? '');
      this.snackBar.open(`${label} copied`, 'OK', { duration: 1500 });
    } catch {
      this.snackBar.open(`Failed to copy ${label.toLowerCase()}`, 'OK', { duration: 2000 });
    }
  }

  async pasteOutputFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      this.editedOutput = text ?? '';
      this.snackBar.open('Pasted from clipboard. Click Save to update.', 'OK', { duration: 2000 });
    } catch {
      this.snackBar.open('Clipboard read failed', 'OK', { duration: 2000 });
    }
  }

  hasOutputChanged(): boolean {
    return this.editedOutput !== ((this.selectedParticipant?.output ?? '').toString());
  }

  async saveOutputToFirestore() {
    if (!this.selectedParticipant?._docId) {
      this.snackBar.open('Missing document id — cannot save.', 'OK', { duration: 2500 });
      return;
    }
    if (!this.hasOutputChanged()) {
      this.snackBar.open('No changes to save.', 'OK', { duration: 1500 });
      return;
    }
    this.isSavingOutput = true;
    try {
      const ref = doc(this.firestore, 'queue_atc_generation', this.selectedParticipant._docId);
      await updateDoc(ref, { output: this.editedOutput });
      this.selectedParticipant.output = this.editedOutput;
      const reparsed = this.parseOutput(this.pickOutput(this.selectedParticipant));
      this.rubricsOutput = reparsed;
      this.snackBar.open('Output updated.', 'OK', { duration: 2000 });
    } catch (e) {
      console.error('saveOutputToFirestore failed', e);
      this.snackBar.open('Save failed.', 'OK', { duration: 2500 });
    } finally {
      this.isSavingOutput = false;
    }
  }

  resetOutputEdit() {
    this.editedOutput = (this.selectedParticipant?.output ?? '').toString();
  }

  isRubricsScoring(row: any): boolean {
    const t = (row?.type ?? '').toString().trim().toLowerCase().replace(/[_-]+/g, ' ');
    return t === 'rubrics scoring' || t === 'rubric scoring' || t === 'rubrics';
  }

  objectKeys(o: any): string {
    if (!o || typeof o !== 'object') return '';
    return Object.keys(o).join(', ');
  }

  debugTypeOf(v: any): string { return v === null ? 'null' : typeof v; }
  debugLen(v: any): string {
    if (typeof v === 'string') return String(v.length);
    if (Array.isArray(v)) return `array(${v.length})`;
    if (v && typeof v === 'object') return `object(${Object.keys(v).length} keys)`;
    return '-';
  }
  debugHasMarker(v: any): boolean {
    return typeof v === 'string' && /assistantfinal/i.test(v);
  }
  debugHead(v: any, n: number): string {
    return typeof v === 'string' ? v.slice(0, n) : JSON.stringify(v)?.slice(0, n) ?? '';
  }
  debugTail(v: any, n: number): string {
    return typeof v === 'string' ? v.slice(-n) : '';
  }

  private pickOutput(row: any): any {
    return row?.output ?? row?.output_json ?? row?.result ?? row?.response ?? row?.data ?? null;
  }

  closeDetails() {
    this.selectedParticipant = null;
    this.rubricsOutput = null;
    this.showScoreBreakdown = false;
    this.editedOutput = '';
    this.viewMode = 'rubric';
  }

  private parseOutput(output: any): any {
    if (output == null) return null;
    if (typeof output === 'object') return output;
    if (typeof output !== 'string') return null;

    const extracted = this.extractAssistantFinalJson(output);
    if (extracted && typeof extracted === 'object') return extracted;
    if (typeof extracted === 'string') {
      try {
        return JSON.parse(extracted);
      } catch {
        return null;
      }
    }
    return null;
  }

  private extractAssistantFinalJson(raw: any): any {
    if (typeof raw !== 'string') return raw;
    const marker = /assistantfinal/i;
    const m = raw.match(marker);
    const tail = m ? raw.slice((m.index as number) + m[0].length) : raw;

    const start = tail.indexOf('{');
    if (start === -1) return raw;

    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < tail.length; i++) {
      const ch = tail[i];
      if (escape) { escape = false; continue; }
      if (inStr) {
        if (ch === '\\') escape = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = tail.slice(start, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return jsonStr;
          }
        }
      }
    }
    return raw;
  }

  toggleScoreBreakdown() {
    this.showScoreBreakdown = !this.showScoreBreakdown;
  }

  verdictPill(verdict: string): string {
    switch (verdict) {
      case 'strong': return 'pill-green';
      case 'developing': return 'pill-teal';
      case 'needs_mentoring': return 'pill-amber';
      case 'partial': return 'pill-amber';
      case 'weak': return 'pill-red';
      case 'absent': return 'pill-gray';
      default: return 'pill-gray';
    }
  }

  confidenceDot(conf: string): string {
    switch (conf) {
      case 'high': return 'dot-high';
      case 'medium': return 'dot-medium';
      case 'low': return 'dot-low';
      default: return 'dot-gray';
    }
  }

  confidenceTooltip(conf: string): string {
    switch (conf) {
      case 'high': return 'Confidence: high — based on explicit data';
      case 'medium': return 'Confidence: medium — requires some inference';
      case 'low': return 'Confidence: low — mentor to verify independently';
      default: return 'Confidence: unknown';
    }
  }

  scoreBarColor(color: string): string {
    switch (color) {
      case 'green': return 'bar-green';
      case 'amber': return 'bar-amber';
      case 'red': return 'bar-red';
      default: return 'bar-gray';
    }
  }

  capabilityDot(type: string): string {
    switch (type) {
      case 'suboptimal_pattern': return 'cap-dot-green';
      case 'trajectory_installation': return 'cap-dot-purple';
      case 'needs_more_data': return 'cap-dot-amber';
      default: return 'cap-dot-gray';
    }
  }

  capabilityLabel(type: string): string {
    switch (type) {
      case 'suboptimal_pattern': return 'Suboptimal pattern';
      case 'trajectory_installation': return 'Trajectory installation';
      case 'needs_more_data': return 'Needs more data';
      default: return type;
    }
  }

  groundingPill(g: string): string {
    switch (g) {
      case 'grounded': return 'pill-green';
      case 'inferred':
      case 'aspirational': return 'pill-amber';
      case 'ungrounded': return 'pill-red';
      default: return 'pill-gray';
    }
  }

  procedureFitPill(f: string): string {
    switch (f) {
      case 'correct': return 'pill-green';
      case 'partial': return 'pill-amber';
      case 'wrong_trigger':
      case 'misapplied':
      case 'missed': return 'pill-red';
      default: return 'pill-gray';
    }
  }

  outcomeSpecPill(o: string): string {
    return o === 'specific' ? 'pill-green' : 'pill-amber';
  }

  overallReadinessClass(pct: number): string {
    if (pct > 80) return 'text-success';
    if (pct >= 50) return 'text-warning';
    return 'text-danger';
  }

  aiCaughtClass(): string {
    const m = this.rubricsOutput?.metrics;
    if (!m || !m.ai_adjustment_count) return '';
    const pct = (m.ai_patterns_specialist_caught / m.ai_adjustment_count) * 100;
    if (pct < 30) return 'text-danger';
    if (pct < 50) return 'text-warning';
    return '';
  }

  proceduresCorrectClass(): string {
    const m = this.rubricsOutput?.metrics;
    if (!m || !m.specialist_adjustment_count) return '';
    const pct = (m.specialist_procedures_correct / m.specialist_adjustment_count) * 100;
    if (pct > 80) return 'text-success';
    if (pct >= 50) return 'text-warning';
    return 'text-danger';
  }

  humanizeVerdict(v: string): string {
    if (!v) return '';
    return v.replace(/_/g, ' ');
  }

  checkpointBadgeVisible(): boolean {
    const s = this.rubricsOutput?.meta?.checkpoint_status_carried_forward;
    return s === 'passed_with_flags' || s === 'failed';
  }

  tabDetailLines: string[] = [
    "Capabilities extracted directly from the participant's data.",
    'Trajectory shift evaluated across four dimensions against the A&H AI ATC gold standard.',
    'Which patterns the Specialist identified vs which were missed.',
    'A&H AI ATC on the left, Specialist ATC on the right, grouped by semantic category.',
    'Every procedure the Specialist used — whether the trigger matches the procedure mechanism.',
    'Specific focus points and questions for the mentor session.',
  ];
  activeTabIndex = 0;
}
