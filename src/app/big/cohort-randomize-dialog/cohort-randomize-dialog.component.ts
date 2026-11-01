import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import {
  canFillCohorts,
  diffCohortMembers,
  eventDayKeys,
  fillShortageMessage,
  isRandomizeCategory,
  pickSpecialists,
  pullShortageMessage,
  RandomizeGroup,
  shuffleIds,
  splitByAttendance,
  splitIntoCohorts,
  spreadSpecialists,
  toDayKey,
} from './cohort-randomize.logic';

export type AttendanceMode = 'attended' | 'not_attended' | 'all';
type StepName = 'event' | 'groups' | 'specialists' | 'participants';

export interface RandomizeDialogData {
  sources: any[];
  cohorts: any[];
  events: any[];
  profileName: (id: string) => string;
  mapMarathon: any;
}

// One randomized cohort: an existing cohort that gets overwritten, or a new one (cohort is null) created on save.
export interface RandomizePlanGroup extends RandomizeGroup {
  name: string;
  isNew: boolean;
  cohort: any | null;
  addedIds: string[];
  keptIds: string[];
  removedIds: string[];
}

interface DayOption {
  key: string;
  label: string;
  count: number;
}

// A problem explains what went wrong in a step. A todo is just the next thing to fill in.
interface DialogIssue {
  kind: 'problem' | 'todo';
  title: string;
  detail: string;
}

@Component({
  selector: 'app-cohort-randomize-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSelectModule],
  templateUrl: './cohort-randomize-dialog.component.html',
  styleUrl: './cohort-randomize-dialog.component.css',
})
export class CohortRandomizeDialogComponent {
  profileName: (id: string) => string;
  allowedCohorts: any[] = [];
  takenNames = new Set<string>();
  events: any[] = [];
  marathonId: string | undefined;
  marathonName = '';
  showAllMarathons = false;

  // Chosen on the first screen; the steps and their order follow from it.
  withSpecialists: boolean | null = null;
  steps: StepName[] = [];

  // Event day
  eventSearch = '';
  selectedEventId: string | null = null;
  selectedDay: string | null = null;
  dayOptions: DayOption[] = [];
  attendanceByDay: { [day: string]: Set<string> } = {};
  attendanceLoading = false;
  attendanceError = '';

  // Groups
  targetSearch = '';
  selectedTargetIds: string[] = [];
  newCohortNames: string[] = [];
  addingNewCohort = false;
  newCohortName = '';
  newCohortError = '';
  showSelectedGroups = false;

  // Specialists
  specialistAttendance: AttendanceMode = 'attended';
  specialistSearch = '';
  specialistCohortId: string | null = null;
  specialistsPerGroup: number | null = null;

  // Participants
  sourceSearch = '';
  sourceCohortIds: string[] = [];
  attendance: AttendanceMode = 'attended';
  size: number | null = null;
  unmarkedSearch = '';
  includedUnmarkedIds: string[] = [];

  // Worked out by recompute()
  sourceIds: string[] = [];
  unmarkedIds: string[] = [];
  matchedIds: string[] = [];
  eligibleIds: string[] = [];
  specialistPoolCount = 0;
  specialistAvailableIds: string[] = [];
  pickedSpecialistIds: string[] = [];
  stepIssues: { [step: string]: DialogIssue[] } = {};
  plan: RandomizePlanGroup[] = [];
  canConfirm = false;

  showMatchedList = false;
  expandedCards = new Set<string>();
  expandedRemovals = new Set<string>();
  private seed = Math.floor(Math.random() * 1000000000);

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<CohortRandomizeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: RandomizeDialogData,
  ) {
    this.profileName = data.profileName;
    const first = data.sources?.[0];
    this.marathonId = first?.['marathonref']?.id;
    const marathon = data.mapMarathon?.[this.marathonId ?? ''];
    this.marathonName = marathon?.['title'] || marathon?.['name'] || '';
    this.showAllMarathons = !this.marathonName;
    (data.cohorts ?? []).forEach(c => this.takenNames.add((c['name'] ?? '').trim().toLowerCase()));
    // Inactive cohorts are hidden, except one the admin ticked on purpose to randomize from.
    const tickedIds = (data.sources ?? []).map(c => c['docid']);
    this.allowedCohorts = (data.cohorts ?? [])
      .filter(c => isRandomizeCategory(c['cohortCategory']) && (c['status'] !== 'nonactive' || tickedIds.includes(c['docid'])))
      .sort((a, b) => (a['name'] ?? '').localeCompare(b['name'] ?? '', undefined, { numeric: true }));
    this.sourceCohortIds = (data.sources ?? []).map(c => c['docid']);
    this.events = (data.events ?? [])
      .filter(e => e['ref'] && this.asDate(e['start_date']) && this.asDate(e['end_date']))
      .sort((a, b) => this.asDate(b['start_date'])!.getTime() - this.asDate(a['start_date'])!.getTime());
    this.recompute();
  }

  // ---- lists shown in the dialog ----
  // A cohort has one role at a time, so each list hides cohorts already used for another role.
  get filteredEvents(): any[] {
    const search = this.eventSearch.trim().toLowerCase();
    return this.events.filter(e => (e['name'] ?? '').toLowerCase().includes(search) || e['ref'].id === this.selectedEventId);
  }

  get filteredTargets(): any[] {
    return this.searchCohorts(this.targetSearch, [...this.sourceCohortIds, ...this.specialistCohortIds], [])
      .filter(c => c['status'] !== 'nonactive');
  }

  // A dropdown drops its selection if the selected option leaves the list, so selected cohorts always stay in.
  get filteredSpecialistCohorts(): any[] {
    return this.searchCohorts(this.specialistSearch, [...this.sourceCohortIds, ...this.selectedTargetIds], this.specialistCohortIds)
      .filter(c => c['status'] !== 'nonactive');
  }

  get filteredSourceCohorts(): any[] {
    return this.searchCohorts(this.sourceSearch, [...this.selectedTargetIds, ...this.specialistCohortIds], this.sourceCohortIds);
  }

  get selectedTargets(): any[] {
    return this.selectedTargetIds.map(id => this.findCohort(id)).filter(Boolean);
  }

  get selectedSourceCohorts(): any[] {
    return this.sourceCohortIds.map(id => this.findCohort(id)).filter(Boolean);
  }

  get specialistCohort(): any {
    return this.specialistCohortId ? this.findCohort(this.specialistCohortId) : null;
  }

  get targetCount(): number {
    return this.selectedTargetIds.length + this.newCohortNames.length;
  }

  get totalToAdd(): number {
    return this.plan.reduce((total, group) => total + group.addedIds.length, 0);
  }

  get totalRemoved(): number {
    return this.plan.reduce((total, group) => total + group.removedIds.length, 0);
  }

  get selectedDayLabel(): string {
    return this.selectedDay ? this.dayLabel(this.selectedDay) : '';
  }

  get selectedEventName(): string {
    return this.events.find(e => e['ref'].id === this.selectedEventId)?.['name'] ?? '';
  }

  get filterReady(): boolean {
    return this.attendance === 'all' || this.attendanceReady;
  }

  get specialistFilterReady(): boolean {
    return this.specialistAttendance === 'all' || this.attendanceReady;
  }

  // The tickable list only applies when shuffling people who attended, once the day is known.
  get showUnmarkedList(): boolean {
    return this.attendance === 'attended' && this.attendanceReady && this.sourceIds.length > 0;
  }

  get filteredUnmarkedIds(): string[] {
    const search = this.unmarkedSearch.trim().toLowerCase();
    return this.unmarkedIds
      .filter(id => this.profileName(id).toLowerCase().includes(search))
      .sort((a, b) => this.profileName(a).localeCompare(this.profileName(b)));
  }

  get attendedCount(): number {
    return this.matchedIds.length - this.includedUnmarkedIds.length;
  }

  // Specialists already placed that were also in the participant cohorts.
  get specialistOverlapCount(): number {
    return this.matchedIds.length - this.eligibleIds.length;
  }

  get specialistSplitText(): string {
    if (!this.specialistsValid || this.targetCount === 0) return '';
    const perGroup = this.specialistsPerGroup!;
    return `${perGroup} ${perGroup === 1 ? 'specialist' : 'specialists'} will be added to each of your ${this.targetCount} selected ${this.groupWord(this.targetCount)}: ${this.pickedSpecialistIds.length} in total.`;
  }

  get participantSplitText(): string {
    if (!this.isCount(this.size) || this.targetCount === 0 || !this.filterReady || !canFillCohorts(this.eligibleIds.length, this.targetCount, this.size!)) return '';
    const count = this.eligibleIds.length;
    const extras = count - this.targetCount * this.size!;
    const extraText = extras > 0 ? ` That leaves ${extras} extra, spread evenly, so each group gets ${this.perGroupRange(count)}.` : '';
    return `${count} participants will be added to your ${this.targetCount} selected ${this.groupWord(this.targetCount)}, ${this.size} in each.${extraText}`;
  }

  get eventNeeded(): boolean {
    return this.attendance !== 'all' || (!!this.withSpecialists && this.specialistAttendance !== 'all');
  }

  private get attendanceReady(): boolean {
    return !!this.selectedDay && !this.attendanceLoading && !this.attendanceError;
  }

  private get specialistCohortIds(): string[] {
    return this.specialistCohortId ? [this.specialistCohortId] : [];
  }

  private get specialistsValid(): boolean {
    return !!this.withSpecialists && !!this.specialistCohortId && this.specialistFilterReady && this.targetCount > 0
      && this.isCount(this.specialistsPerGroup) && this.specialistsPerGroup! * this.targetCount <= this.specialistAvailableIds.length;
  }

  // ---- first screen ----
  chooseMode(withSpecialists: boolean): void {
    this.withSpecialists = withSpecialists;
    this.steps = withSpecialists
      ? ['event', 'groups', 'specialists', 'participants']
      : ['event', 'participants', 'groups'];
    this.recompute();
  }

  changeMode(): void {
    this.withSpecialists = null;
    this.steps = [];
    this.recompute();
  }

  // ---- steps ----
  stepDone(step: StepName): boolean {
    return (this.stepIssues[step] ?? []).length === 0;
  }

  stepProblems(step: StepName): DialogIssue[] {
    return (this.stepIssues[step] ?? []).filter(issue => issue.kind === 'problem');
  }

  stepTodos(step: StepName): DialogIssue[] {
    return (this.stepIssues[step] ?? []).filter(issue => issue.kind === 'todo');
  }

  stepTitle(step: StepName): string {
    if (step === 'event') return 'Which event day?';
    if (step === 'groups') return 'Which groups?';
    if (step === 'specialists') return 'Put specialists in the groups';
    return this.withSpecialists ? 'Add participants to the groups' : 'Who should be shuffled?';
  }

  // ---- event day ----
  async onEventChange(eventId: string): Promise<void> {
    this.selectedEventId = eventId;
    this.selectedDay = null;
    this.includedUnmarkedIds = [];
    this.dayOptions = [];
    this.attendanceByDay = {};
    this.attendanceError = '';
    this.attendanceLoading = true;
    this.recompute();

    const event = this.events.find(e => e['ref'].id === eventId);
    try {
      const snap = await getDocs(query(collection(this.firestore, 'arena e-ticket log'), where('eventref', '==', event['ref'])));
      if (this.selectedEventId !== eventId) return;

      const byDay: { [day: string]: Set<string> } = {};
      snap.docs.forEach(logDoc => {
        const log: any = logDoc.data();
        const logDate = log['logdate']?.toDate ? log['logdate'].toDate() : null;
        if (!log['profileid'] || !logDate) return;
        const day = toDayKey(logDate);
        (byDay[day] = byDay[day] ?? new Set<string>()).add(log['profileid']);
      });
      this.attendanceByDay = byDay;
      this.dayOptions = eventDayKeys(this.asDate(event['start_date'])!, this.asDate(event['end_date'])!).map(key => ({
        key,
        label: this.dayLabel(key),
        count: byDay[key]?.size ?? 0,
      }));
    } catch (error: any) {
      if (this.selectedEventId !== eventId) return;
      console.error('Error loading event attendance:', error);
      this.attendanceError = error?.code === 'permission-denied'
        ? "Your account isn't allowed to read attendance records."
        : `The attendance records couldn't be read (${error?.code || error?.message || 'unknown error'}). Check your connection.`;
    }
    this.attendanceLoading = false;
    this.recompute();
  }

  retryAttendance(): void {
    if (this.selectedEventId) this.onEventChange(this.selectedEventId);
  }

  // Ticks in the "not marked" list were made for one day, so a new day starts clean.
  onDayChange(day: string): void {
    this.selectedDay = day;
    this.includedUnmarkedIds = [];
    this.recompute();
  }

  skipAttendance(): void {
    this.attendance = 'all';
    this.specialistAttendance = 'all';
    this.recompute();
  }

  onAttendanceChange(mode: AttendanceMode): void {
    this.attendance = mode;
    this.recompute();
  }

  onSpecialistAttendanceChange(mode: AttendanceMode): void {
    this.specialistAttendance = mode;
    this.recompute();
  }

  // ---- groups ----
  isTargetSelected(docid: string): boolean {
    return this.selectedTargetIds.includes(docid);
  }

  toggleTarget(docid: string): void {
    this.selectedTargetIds = this.selectedTargetIds.includes(docid)
      ? this.selectedTargetIds.filter(id => id !== docid)
      : [...this.selectedTargetIds, docid];
    this.recompute();
  }

  // Works on what the search is showing, so "Group" then Select all picks every group at once.
  selectAllShownTargets(): void {
    const shown = this.filteredTargets.map(c => c['docid']);
    this.selectedTargetIds = Array.from(new Set([...this.selectedTargetIds, ...shown]));
    this.recompute();
  }

  clearTargets(): void {
    this.selectedTargetIds = [];
    this.newCohortNames = [];
    this.recompute();
  }

  startNewCohort(): void {
    this.addingNewCohort = true;
    this.newCohortName = '';
    this.newCohortError = '';
  }

  cancelNewCohort(): void {
    this.addingNewCohort = false;
    this.newCohortError = '';
  }

  addNewCohort(): void {
    const name = this.newCohortName.trim();
    if (!name) {
      this.newCohortError = 'Type a name for the new cohort first.';
      return;
    }
    const lower = name.toLowerCase();
    if (this.takenNames.has(lower) || this.newCohortNames.some(n => n.toLowerCase() === lower)) {
      this.newCohortError = `A cohort called "${name}" already exists. Tick it in the list to overwrite it, or use a different name.`;
      return;
    }
    this.newCohortNames = [...this.newCohortNames, name];
    this.addingNewCohort = false;
    this.newCohortError = '';
    this.recompute();
  }

  removeNewCohort(name: string): void {
    this.newCohortNames = this.newCohortNames.filter(n => n !== name);
    this.recompute();
  }

  // ---- specialists ----
  onSpecialistCohortChange(docid: string): void {
    this.specialistCohortId = docid;
    this.recompute();
  }

  specialistOptionLabel(cohort: any): string {
    const ids = this.uniqueIds(cohort['participantidlist']);
    if (this.specialistAttendance === 'all' || !this.specialistFilterReady) return `${ids.length} people`;
    const matched = this.filterByAttendance(ids, this.specialistAttendance).length;
    return `${matched} of ${ids.length} ${this.specialistAttendance === 'attended' ? 'attended' : 'absent'}`;
  }

  // ---- participants ----
  onSourceChange(docids: string[]): void {
    this.sourceCohortIds = docids;
    this.recompute();
  }

  isUnmarkedIncluded(id: string): boolean {
    return this.includedUnmarkedIds.includes(id);
  }

  toggleUnmarked(id: string): void {
    this.includedUnmarkedIds = this.isUnmarkedIncluded(id)
      ? this.includedUnmarkedIds.filter(existing => existing !== id)
      : [...this.includedUnmarkedIds, id];
    this.recompute();
  }

  // Works on what the search is showing, like Select all shown in the groups list.
  selectAllShownUnmarked(): void {
    this.includedUnmarkedIds = Array.from(new Set([...this.includedUnmarkedIds, ...this.filteredUnmarkedIds]));
    this.recompute();
  }

  clearUnmarked(): void {
    this.includedUnmarkedIds = [];
    this.recompute();
  }

  // ---- preview ----
  reshuffle(): void {
    this.seed++;
    this.recompute();
  }

  toggleCard(name: string): void {
    this.toggleInSet(this.expandedCards, name);
  }

  toggleRemovals(name: string): void {
    this.toggleInSet(this.expandedRemovals, name);
  }

  recompute(): void {
    this.sourceIds = this.uniqueIds(this.selectedSourceCohorts.flatMap(c => c['participantidlist'] ?? []));
    // Ticked people only stay ticked while they're still in the selected cohorts.
    this.unmarkedIds = this.attendance === 'attended' && this.attendanceReady
      ? splitByAttendance(this.sourceIds, this.attendanceByDay[this.selectedDay!]).unmarked
      : [];
    const unmarked = new Set(this.unmarkedIds);
    this.includedUnmarkedIds = this.includedUnmarkedIds.filter(id => unmarked.has(id));
    this.matchedIds = this.filterReady ? [...this.filterByAttendance(this.sourceIds, this.attendance), ...this.includedUnmarkedIds] : [];

    const pool = this.uniqueIds(this.specialistCohort?.['participantidlist']);
    this.specialistPoolCount = pool.length;
    this.specialistAvailableIds = this.withSpecialists && this.specialistFilterReady ? this.filterByAttendance(pool, this.specialistAttendance) : [];

    // Specialists are placed first, so anyone picked as a specialist isn't shuffled again as a participant.
    this.pickedSpecialistIds = this.specialistsValid
      ? pickSpecialists(this.specialistAvailableIds, this.matchedIds, this.specialistsPerGroup! * this.targetCount, this.seed + 1)
      : [];
    const picked = new Set(this.pickedSpecialistIds);
    this.eligibleIds = this.matchedIds.filter(id => !picked.has(id));

    this.stepIssues = {
      event: this.eventIssues(),
      groups: this.groupIssues(),
      specialists: this.specialistIssues(),
      participants: this.participantIssues(),
    };
    this.updatePlan();
  }

  // The button that calls this is commented out in the template for now.
  confirm(): void {
    if (!this.canConfirm) return;
    this.dialogRef.close({ plan: this.plan, source: this.selectedSourceCohorts[0] });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private eventIssues(): DialogIssue[] {
    if (!this.eventNeeded) return [];
    if (!this.selectedEventId) return [this.todo('Pick the event', 'Attendance is checked against who checked in at an event.')];
    if (this.attendanceLoading) return [this.todo('Wait for attendance to load', '')];
    if (this.attendanceError) return [this.problem(`Couldn't load attendance for ${this.selectedEventName}`, `${this.attendanceError} Then press Try again.`)];
    if (this.dayOptions.length === 0) {
      return [this.problem(`${this.selectedEventName} hasn't started yet`, 'There are no event days to check, so nobody has attendance. Pick an event that has started, or continue without attendance.')];
    }
    if (!this.selectedDay) return [this.todo('Pick the date', `Choose which day of ${this.selectedEventName} to check.`)];
    return [];
  }

  private groupIssues(): DialogIssue[] {
    return this.targetCount === 0 ? [this.todo('Select at least one group', 'Tick an existing cohort or create a new one.')] : [];
  }

  private specialistIssues(): DialogIssue[] {
    if (!this.withSpecialists) return [];
    const issues: DialogIssue[] = [];
    if (!this.specialistCohortId) {
      issues.push(this.todo('Select the specialist cohort', ''));
    }
    if (!this.specialistFilterReady) {
      issues.push(this.todo('Pick the event day in step 1', ''));
    }
    if (this.targetCount === 0) {
      issues.push(this.todo('Select the groups above', ''));
    }
    if (this.specialistsPerGroup === null || (this.specialistsPerGroup as any) === '') {
      issues.push(this.todo('Enter how many specialists to add to each group', ''));
    } else if (!this.isCount(this.specialistsPerGroup)) {
      issues.push(this.problem('The number of specialists must be a whole number', `You entered ${this.specialistsPerGroup}. Enter 1 or more, with no decimals.`));
    } else if (this.specialistFilterReady && this.specialistCohortId && this.targetCount > 0 && !this.specialistsValid) {
      const outsideText = this.specialistAttendance === 'attended' ? `did not attend on ${this.selectedDayLabel}` : `attended on ${this.selectedDayLabel}`;
      issues.push(this.problem('Not enough specialists available', pullShortageMessage(
        this.specialistsPerGroup!, this.targetCount, this.specialistPoolCount, this.specialistPoolCount - this.specialistAvailableIds.length, this.specialistAvailableIds.length, outsideText,
      )));
    }
    return issues;
  }

  private participantIssues(): DialogIssue[] {
    const issues: DialogIssue[] = [];
    if (this.sourceCohortIds.length === 0) {
      issues.push(this.todo('Select a participants cohort', ''));
    } else if (this.sourceIds.length === 0) {
      issues.push(this.problem('The selected cohort has no participants', 'There is nobody to add. Select a cohort that has people in it.'));
    } else if (!this.filterReady) {
      issues.push(this.todo('Pick the event day in step 1', ''));
    } else if (this.matchedIds.length === 0) {
      issues.push(this.noMatchIssue());
    }

    if (this.size === null || (this.size as any) === '') {
      issues.push(this.todo('Enter how many participants to add to each group', ''));
    } else if (!this.isCount(this.size)) {
      issues.push(this.problem('The number of participants must be a whole number', `You entered ${this.size}. Enter 1 or more, with no decimals.`));
    } else if (this.filterReady && this.eligibleIds.length > 0 && this.targetCount > 0
      && !canFillCohorts(this.eligibleIds.length, this.targetCount, this.size!)) {
      issues.push(this.problem('Not enough people to fill these groups', fillShortageMessage(this.eligibleIds.length, this.targetCount, this.size!)));
    }
    return issues;
  }

  private noMatchIssue(): DialogIssue {
    if (this.attendance === 'not_attended') {
      return this.problem(`Nobody was absent on ${this.selectedDayLabel}`, 'Everyone in the participants cohort attended that day, so nobody matches Not attended. Pick another date or change the attendance filter.');
    }
    const checkedIn = this.attendanceByDay[this.selectedDay!]?.size ?? 0;
    return checkedIn === 0
      ? this.problem(`No attendance recorded on ${this.selectedDayLabel}`, `Nobody has a check-in for ${this.selectedEventName} that day, so the event may not have run or attendance wasn't taken. Pick another date, or tick people in the list above.`)
      : this.problem(`Nobody from the participants cohort attended on ${this.selectedDayLabel}`, `${checkedIn} ${checkedIn === 1 ? 'person' : 'people'} checked in that day, but none of them are in the cohort you selected. Check that this is the right event, pick another date, or tick people in the list above.`);
  }

  private updatePlan(): void {
    this.plan = [];
    this.canConfirm = false;
    if (this.withSpecialists === null || !this.steps.every(step => this.stepDone(step))) return;

    const groups = spreadSpecialists(
      splitIntoCohorts(shuffleIds(this.eligibleIds, this.seed), this.targetCount, this.size!),
      this.pickedSpecialistIds,
    );
    const details = [
      ...this.selectedTargets.map(cohort => ({ name: cohort['name'], isNew: false, cohort })),
      ...this.newCohortNames.map(name => ({ name, isNew: true, cohort: null })),
    ];
    this.plan = groups.map((group, index) => {
      const nextIds = [...group.specialistIds, ...group.participantIds];
      const { added, kept, removed } = diffCohortMembers(this.uniqueIds(details[index].cohort?.['participantidlist']), nextIds);
      return { ...group, ...details[index], addedIds: added, keptIds: kept, removedIds: removed };
    });
    this.canConfirm = true;
  }

  private perGroupRange(total: number): string {
    const low = Math.floor(total / this.targetCount);
    const high = Math.ceil(total / this.targetCount);
    return low === high ? `${low}` : `${low} to ${high}`;
  }

  private groupWord(count: number): string {
    return count === 1 ? 'group' : 'groups';
  }

  private searchCohorts(text: string, hideIds: string[], keepIds: string[]): any[] {
    const search = text.trim().toLowerCase();
    return this.allowedCohorts.filter(c =>
      keepIds.includes(c['docid']) || (!hideIds.includes(c['docid'])
        && (this.showAllMarathons || c['marathonref']?.id === this.marathonId)
        && (c['name'] ?? '').toLowerCase().includes(search)));
  }

  private findCohort(docid: string): any {
    return this.allowedCohorts.find(c => c['docid'] === docid);
  }

  private filterByAttendance(ids: string[], mode: AttendanceMode): string[] {
    if (mode === 'all') return ids;
    const present = this.selectedDay ? this.attendanceByDay[this.selectedDay] : undefined;
    return ids.filter(id => (present?.has(id) ?? false) === (mode === 'attended'));
  }

  private problem(title: string, detail: string): DialogIssue {
    return { kind: 'problem', title, detail };
  }

  private todo(title: string, detail: string): DialogIssue {
    return { kind: 'todo', title, detail };
  }

  private toggleInSet(set: Set<string>, value: string): void {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  private uniqueIds(ids: string[] | undefined): string[] {
    return Array.from(new Set((ids ?? []).filter(Boolean)));
  }

  private isCount(value: number | null): boolean {
    return Number.isInteger(value) && value! >= 1;
  }

  private asDate(value: any): Date | null {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  private dayLabel(key: string): string {
    return new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
