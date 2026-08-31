import { CommonModule } from '@angular/common';
import { Component, Inject, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { collection, Firestore, getDocs,query,where } from '@angular/fire/firestore';
import { SpecialistAppointmentSlotsComponent } from '../specialist-appointment-slot/specialist-appointment-slots.component';

// export interface SpecialistSlotsDialogData {
//   eisId: string;
//   eisName?: string;
//   appointmentTypeId?: string | null;
// }

type ViewName = 'dashboard' | 'participants' | 'specialists' | 'planning';
type LifecycleKey = 'notStarted' | 'onTrack' | 'needsAttention' | 'awaitingSignoff' | 'completed';

interface Member {
  id: string;
  name: string;
  ini: string;
  age: string;
  cat: string;
  spec: boolean;
  email?: string;
}

interface Product {
  id: string;
  name: string;
  group: 'major' | 'dfu';
  impl: number;
}

interface Journey {
  id: string;
  pid: string;
  prod: string;
  owner: string;
  focus: string;
  start: string;
  curr: string;
  implIdx: number;
  days: number;
  deliver: string | null;
  started: boolean;
  completed: boolean;
  notes: Record<string, string>;
  mv?: { p: number };
}

interface CapacityRow {
  avail: number;
  team: number;
  cust: number;
  active: number;
  done: number;
}

interface Session {
  spec: string;
  date: string;
  time: string;
  kind: 'team' | 'customer';
  who: string;
  label: string;
}

interface StageStep {
  key: string;
  hos: string;
  by: 'owner' | 'participant' | 'specialist';
  label: string;
}

@Component({
  selector: 'app-team-evolution-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SpecialistAppointmentSlotsComponent],
  templateUrl: './team-evolution-dashboard.component.html',
  styleUrl: './team-evolution-dashboard.component.css'
})
export class TeamEvolutionDashboardComponent implements OnInit {

  // ================= STATIC REFERENCE DATA =================
  readonly canon: { key: string; hos: string; by: 'owner' | 'participant' | 'specialist' }[] = [
    { key: 'Directive', hos: 'Registration', by: 'owner' },
    { key: 'Video Ask', hos: 'Referral', by: 'participant' },
    { key: 'Diagnostics', hos: 'Findings', by: 'owner' },
    { key: 'Implementation', hos: 'Procedure', by: 'specialist' },
    { key: 'Validation', hos: 'Recovery', by: 'participant' },
    { key: 'Specialist Notes', hos: 'Chart notes', by: 'specialist' },
    { key: 'Integration', hos: 'Discharge', by: 'specialist' },
    { key: 'Review', hos: 'Follow-up', by: 'owner' },
    { key: 'Milestone Validation', hos: 'Sign-off', by: 'owner' }
  ];
  readonly gate = ['Validation', 'Review', 'Milestone Validation'];
  readonly stip = 7;

  readonly members: Record<string, Member> = {
    ash: { id: 'ash', name: 'Asha R.', ini: 'AR', age: '30–39', cat: 'Operator', spec: true },
    dan: { id: 'dan', name: 'Daniel K.', ini: 'DK', age: '40–49', cat: 'Partner', spec: true },
    pri: { id: 'pri', name: 'Priya S.', ini: 'PS', age: '30–39', cat: 'Consistent performer', spec: true },
    mar: { id: 'mar', name: 'Marcus L.', ini: 'ML', age: '20–29', cat: 'Pioneer', spec: true },
    sar: { id: 'sar', name: 'Sarah V.', ini: 'SV', age: '40–49', cat: 'Partner', spec: true },
    len: { id: 'len', name: 'Lena M.', ini: 'LM', age: '40–49', cat: 'Partner', spec: false },
    tom: { id: 'tom', name: 'Tom B.', ini: 'TB', age: '30–39', cat: 'Consistent performer', spec: false },
    rav: { id: 'rav', name: 'Ravi N.', ini: 'RN', age: '20–29', cat: 'Operator', spec: false }
  };

  readonly products: Record<string, Product> = {
    big: { id: 'big', name: 'B!G', group: 'major', impl: 2 },
    lyl: { id: 'lyl', name: 'LYL', group: 'major', impl: 3 },
    up: { id: 'up', name: 'uP!', group: 'major', impl: 3 },
    wish: { id: 'wish', name: 'W!SH', group: 'dfu', impl: 6 },
    eistart: { id: 'eistart', name: 'EI Starter Pack', group: 'dfu', impl: 1 },
    eisol: { id: 'eisol', name: 'EI Solutions', group: 'dfu', impl: 4 },
    csol: { id: 'csol', name: 'Critical Solutions', group: 'dfu', impl: 2 }
  };

  readonly journeys: Journey[] = [
    { id: 'j1', pid: 'ash', prod: 'eisol', owner: 'dan', focus: 'Client onboarding', start: '2026-05-28', curr: 'Implementation', implIdx: 2, days: 4, deliver: 'pri', started: true, completed: false,
      notes: { 'Directive': 'Improve client onboarding turnaround.', 'Video Ask': '3-min video clarifying scope & blockers.', 'Diagnostics': 'Root cause: manual handoff; 2 skill gaps.', 'Implementation #1': 'Coaching on async checklist.', 'Implementation #2': 'Pair-built the onboarding template.' } },
    { id: 'j2', pid: 'dan', prod: 'wish', owner: 'sar', focus: 'Delegation & leadership', start: '2026-05-05', curr: 'Validation', implIdx: 3, days: 19, deliver: 'pri', started: true, completed: false, notes: { 'Diagnostics': 'Delegation bottleneck at review stage.' } },
    { id: 'j3', pid: 'pri', prod: 'eistart', owner: 'dan', focus: 'Public speaking', start: '2026-05-22', curr: 'Diagnostics', implIdx: 0, days: 3, deliver: null, started: true, completed: false, notes: {} },
    { id: 'j4', pid: 'mar', prod: 'wish', owner: 'sar', focus: 'Time management', start: '2026-05-10', curr: 'Review', implIdx: 3, days: 11, deliver: 'dan', started: true, completed: false, notes: {} },
    { id: 'j5', pid: 'len', prod: 'big', owner: 'dan', focus: 'Career growth', start: '2026-04-28', curr: 'Milestone Validation', implIdx: 2, days: 2, deliver: 'mar', started: true, completed: true, notes: {}, mv: { p: 9 } },
    { id: 'j6', pid: 'tom', prod: 'eisol', owner: 'dan', focus: 'Relationships', start: '2026-04-15', curr: 'Milestone Validation', implIdx: 4, days: 1, deliver: 'pri', started: true, completed: true, notes: {}, mv: { p: 8 } },
    { id: 'j7', pid: 'rav', prod: 'eistart', owner: 'dan', focus: 'Focus & drive', start: '2026-06-01', curr: 'Directive', implIdx: 0, days: 0, deliver: null, started: false, completed: false, notes: {} },
    { id: 'j8', pid: 'ash', prod: 'big', owner: 'dan', focus: 'Leadership presence', start: '2026-03-10', curr: 'Milestone Validation', implIdx: 2, days: 3, deliver: 'mar', started: true, completed: true, notes: {}, mv: { p: 8 } }
  ];

  readonly capacity: Record<string, CapacityRow> = {
    dan: { avail: 40, team: 20, cust: 14, active: 2, done: 9 },
    pri: { avail: 40, team: 22, cust: 16, active: 3, done: 7 },
    mar: { avail: 40, team: 10, cust: 12, active: 1, done: 5 },
    sar: { avail: 20, team: 8, cust: 4, active: 1, done: 4 },
    ash: { avail: 40, team: 12, cust: 10, active: 1, done: 3 }
  };

  readonly dailyCap: Record<string, number> = { dan: 6, pri: 6, mar: 6, sar: 3, ash: 6 };

  readonly sessions: Session[] = [
    { spec: 'dan', date: '2026-06-03', time: '09:30', kind: 'team', who: 'Asha R.', label: 'EI Solutions · Impl #2' },
    { spec: 'dan', date: '2026-06-03', time: '11:00', kind: 'team', who: 'Priya S.', label: 'EI Starter · Diagnostics' },
    { spec: 'dan', date: '2026-06-03', time: '14:00', kind: 'customer', who: 'Acme Corp', label: 'Customer delivery' },
    { spec: 'pri', date: '2026-06-03', time: '10:00', kind: 'team', who: 'Asha R.', label: 'EI Solutions · Impl #2' },
    { spec: 'pri', date: '2026-06-03', time: '12:00', kind: 'customer', who: 'Nova Ltd', label: 'Customer delivery' },
    { spec: 'pri', date: '2026-06-03', time: '15:00', kind: 'customer', who: 'Orbit Inc', label: 'Customer delivery' },
    { spec: 'pri', date: '2026-06-03', time: '16:30', kind: 'team', who: 'Daniel K.', label: 'WISH · Validation' },
    { spec: 'sar', date: '2026-06-03', time: '13:00', kind: 'team', who: 'Marcus L.', label: 'WISH · Review' },
    { spec: 'mar', date: '2026-06-03', time: '11:00', kind: 'customer', who: 'Zen Co', label: 'Customer delivery' },
    { spec: 'dan', date: '2026-06-04', time: '10:00', kind: 'team', who: 'Asha R.', label: 'EI Solutions · Impl #3' },
    { spec: 'sar', date: '2026-06-04', time: '09:00', kind: 'customer', who: 'Acme Corp', label: 'Customer delivery' },
    { spec: 'sar', date: '2026-06-04', time: '11:00', kind: 'team', who: 'Daniel K.', label: 'WISH · Diagnostics' },
    { spec: 'sar', date: '2026-06-04', time: '14:00', kind: 'customer', who: 'Peak LLC', label: 'Customer delivery' },
    { spec: 'ash', date: '2026-06-04', time: '10:30', kind: 'team', who: 'Lena M.', label: 'B!G · Milestone' },
    { spec: 'pri', date: '2026-06-05', time: '09:30', kind: 'team', who: 'Asha R.', label: 'EI Solutions · Impl #3' },
    { spec: 'dan', date: '2026-06-05', time: '13:00', kind: 'customer', who: 'Acme Corp', label: 'Customer delivery' }
  ];

  readonly lifecycleConfig: Record<LifecycleKey, { label: string; cssVar: string; desc: string }> = {
    notStarted: { label: 'Not started', cssVar: '--c-notstarted', desc: 'Directive not issued' },
    onTrack: { label: 'On track', cssVar: '--c-ontrack', desc: 'Within stipulated time' },
    needsAttention: { label: 'Needs attention', cssVar: '--c-attention', desc: 'Overdue — act now' },
    awaitingSignoff: { label: 'Awaiting sign-off', cssVar: '--c-await', desc: 'At a validation gate' },
    completed: { label: 'Completed', cssVar: '--c-done', desc: 'Milestone signed off' }
  };
  readonly order: LifecycleKey[] = ['notStarted', 'onTrack', 'needsAttention', 'awaitingSignoff', 'completed'];

  readonly categoryColors: Record<string, [string, string]> = {
    'Pioneer': ['#efe7ff', '#6b3fd4'],
    'Partner': ['#d9f5f7', '#0e7d86'],
    'Consistent performer': ['#dcf6e8', '#12885e'],
    'Operator': ['#fde6ea', '#c33a52']
  };

  readonly titles: Record<ViewName, [string, string]> = {
    dashboard: ['Overview', 'Where every team member is on their journey'],
    participants: ['Participants', 'Every member and their current evolution'],
    specialists: ['Specialists & Capacity', 'Delivery load across team and customers'],
    planning: ['Planning', 'Match waiting journeys to available specialists']
  };

  private authguard = inject(AuthguardService);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // ================= DYNAMIC PARTICIPANTS (Firestore) =================
  participants: any[] = [];

  // ================= UI STATE =================
  theme: 'light' | 'dark' = 'light';
  currentView: ViewName = 'dashboard';
  kpiFilter: LifecycleKey | null = null;

  fMember = 'All members';
  fAge = 'All ages';
  fCat = 'All categories';
  fProduct = 'All products';

  pplSearch = '';
  pplCat = 'All categories';
  pplRole: 'all' | 'spec' | 'ponly' = 'all';

  schedDate = '2026-06-03';

  drawerOpen = false;
  drawerPid: string | null = null;
  drawerJid: string | null = null;

  paletteOpen = false;
  paletteQuery = '';

  dateRangeStart = '2026-05-01';
  dateRangeEnd = '2026-06-30';

  expandedSpecialistId: string | null = null;

  ngOnInit(): void {
    this.loadParticipants();
  }

  // ================= HELPERS =================
  member(id: string): Member {
    return this.members[id];
  }

  lifecycle(j: Journey): LifecycleKey {
    if (j.completed) { return 'completed'; }
    if (!j.started) { return 'notStarted'; }
    if (j.days > this.stip) { return 'needsAttention'; }
    if (this.gate.includes(j.curr)) { return 'awaitingSignoff'; }
    return 'onTrack';
  }

  stageLabel(j: Journey): string {
    return j.curr === 'Implementation' ? 'Implementation #' + j.implIdx : j.curr;
  }

  sevColor(days: number): string {
    if (days < 7) { return 'var(--sev-good)'; }
    if (days < 14) { return 'var(--sev-warn)'; }
    return 'var(--sev-crit)';
  }

  utilColor(u: number): string {
    if (u < 70) { return 'var(--sev-good)'; }
    if (u <= 90) { return 'var(--sev-warn)'; }
    return 'var(--sev-crit)';
  }

  util(c: CapacityRow): number {
    return Math.round(((c.team + c.cust) / c.avail) * 100);
  }

  tokColor(id: string): string {
    const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `hsl(${hash} 45% 45%)`;
  }

  catColors(cat: string): [string, string] {
    return this.categoryColors[cat] || this.categoryColors['Operator'];
  }

  expanded(prodId: string): StageStep[] {
    const p = this.products[prodId];
    const out: StageStep[] = [];
    this.canon.forEach(s => {
      if (s.key === 'Implementation') {
        for (let i = 1; i <= p.impl; i++) {
          out.push({ ...s, label: 'Implementation #' + i });
        }
      } else {
        out.push({ ...s, label: s.key });
      }
    });
    return out;
  }

  currIdx(j: Journey): number {
    const st = this.expanded(j.prod);
    return j.curr === 'Implementation'
      ? st.findIndex(s => s.label === 'Implementation #' + j.implIdx)
      : st.findIndex(s => s.key === j.curr);
  }

  progress(j: Journey): number {
    const st = this.expanded(j.prod);
    const ci = this.currIdx(j);
    return j.completed ? 100 : Math.round((ci / (st.length - 1)) * 100);
  }

  // ================= NAVIGATION =================
  goToView(view: ViewName): void {
    this.currentView = view;
  }

  toggleSpecialistDetails(id: string): void {
    this.expandedSpecialistId = this.expandedSpecialistId === id ? null : id;
  }

  async loadParticipants(): Promise<void> {
    const getProfileData = await this.authguard.getProfileMap();
    console.log("profile:",getProfileData)
    const domain = '@soexcellence.com';

    const result: any[] = [];
    for (const id in getProfileData.docdata) {
      const profile = getProfileData.docdata[id];
      const email = (profile['email'] ?? '').toLowerCase();
      const isSoExcellenceProfile = email.endsWith(domain);
      if (!isSoExcellenceProfile) { 
        continue; 
      }
      result.push({ id, ...profile });
    }

    this.participants = result;
  }

  // async loadParticipants(): Promise<void> {
  //   const snapshot = await getDocs(collection(this.firestore, 'profile_data'));

  //   this.participants = snapshot.docs.map(docSnap => ({
  //       id: docSnap.id,
  //       ...docSnap.data()
  //     }))
  //     .filter((participant: any) =>
  //       participant.email?.toLowerCase().endsWith('@soexcellence.com')
  //     );

  //   console.log('participantlist:', this.participants);
  // }

  private initials(name: string): string {
    const parts = (name ?? '').split(' ').filter(Boolean);
    return parts.map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }

  openUserProfile(profileId: string): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/userprofile', profileId]));
    window.open(url, '_blank');
  }

  setTheme(t: 'light' | 'dark'): void {
    this.theme = t;
  }

  toggleTheme(): void {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  // ================= DASHBOARD =================
  get memberOptions(): Member[] {
    return Object.values(this.members);
  }

  get majorProducts(): Product[] {
    return Object.values(this.products).filter(p => p.group === 'major');
  }

  get dfuProducts(): Product[] {
    return Object.values(this.products).filter(p => p.group === 'dfu');
  }

  get filteredJourneys(): Journey[] {
    return this.journeys.filter(j => {
      const p = this.member(j.pid);
      const memberOk = this.fMember === 'All members' || p.name === this.fMember;
      const ageOk = this.fAge === 'All ages' || p.age === this.fAge;
      const catOk = this.fCat === 'All categories' || p.cat === this.fCat;
      const prodOk = this.fProduct === 'All products' || j.prod === this.fProduct;
      return memberOk && ageOk && catOk && prodOk;
    });
  }

  get lifecycleCounts(): Record<LifecycleKey, number> {
    const counts: Record<LifecycleKey, number> = { notStarted: 0, onTrack: 0, needsAttention: 0, awaitingSignoff: 0, completed: 0 };
    this.filteredJourneys.forEach(j => counts[this.lifecycle(j)]++);
    return counts;
  }

  get totalJourneys(): number {
    return this.filteredJourneys.length;
  }

  overdueGateCount(key: LifecycleKey): number {
    if (key !== 'awaitingSignoff') { return 0; }
    return this.filteredJourneys.filter(j => this.lifecycle(j) === 'awaitingSignoff' && j.days > this.stip).length;
  }

  get alarmJourneys(): Journey[] {
    return this.filteredJourneys
      .filter(j => this.lifecycle(j) === 'needsAttention')
      .sort((a, b) => b.days - a.days);
  }

  get donutGradient(): string {
    const counts = this.lifecycleCounts;
    const total = this.totalJourneys || 1;
    if (!this.totalJourneys) { return 'var(--surface-3)'; }
    let acc = 0;
    const stops: string[] = [];
    this.order.forEach(k => {
      const v = counts[k];
      if (!v) { return; }
      const start = (acc / total) * 360;
      acc += v;
      const end = (acc / total) * 360;
      stops.push(`var(${this.lifecycleConfig[k].cssVar}) ${start}deg ${end}deg`);
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  get overviewRows(): Journey[] {
    return this.filteredJourneys
      .filter(j => !this.kpiFilter || this.lifecycle(j) === this.kpiFilter)
      .sort((a, b) => b.days - a.days);
  }

  get attentionRows(): Journey[] {
    return this.filteredJourneys
      .filter(j => ['needsAttention', 'awaitingSignoff'].includes(this.lifecycle(j)) && j.days > this.stip)
      .sort((a, b) => b.days - a.days);
  }

  toggleKpi(k: LifecycleKey): void {
    this.kpiFilter = this.kpiFilter === k ? null : k;
  }

  // ================= PARTICIPANTS =================
  get participantCards(): Member[] {
    const q = this.pplSearch.toLowerCase();
    let list = this.participants.filter(p => p.name.toLowerCase().includes(q));
    if (this.pplCat !== 'All categories') { list = list.filter(p => p.cat === this.pplCat); }
    if (this.pplRole === 'spec') { list = list.filter(p => p.spec); }
    if (this.pplRole === 'ponly') { list = list.filter(p => !p.spec); }
    return list;
  }

  activeJourneyFor(pid: string): Journey | undefined {
    return this.journeys.find(j => j.pid === pid && !j.completed);
  }

  completedCountFor(pid: string): number {
    return this.journeys.filter(j => j.pid === pid && j.completed).length;
  }

  // ================= SPECIALISTS =================
  shiftDay(n: number): void {
    const d = new Date(this.schedDate + 'T00:00:00');
    d.setDate(d.getDate() + n);
    this.schedDate = d.toISOString().slice(0, 10);
  }

  get specialistIds(): string[] {
    return Object.keys(this.capacity);
  }

  sessionsFor(id: string): Session[] {
    return this.sessions
      .filter(s => s.date === this.schedDate && s.spec === id)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  freeSlotsFor(id: string): number {
    return Math.max(0, this.dailyCap[id] - this.sessionsFor(id).length);
  }

  freeSlotsLabel(id: string): string {
    const free = this.freeSlotsFor(id);
    return free === 0 ? 'Fully booked' : free + ' slot' + (free > 1 ? 's' : '') + ' free';
  }

  freeSlotsColor(id: string): string {
    const free = this.freeSlotsFor(id);
    if (free === 0) { return 'var(--sev-crit)'; }
    if (free <= 1) { return 'var(--sev-warn)'; }
    return 'var(--sev-good)';
  }

  teamCountFor(id: string): number {
    return this.sessionsFor(id).filter(s => s.kind === 'team').length;
  }

  customerCountFor(id: string): number {
    return this.sessionsFor(id).filter(s => s.kind === 'customer').length;
  }

  freeCapacity(c: CapacityRow): number {
    return Math.max(0, c.avail - c.team - c.cust);
  }

  widthPct(part: number, whole: number): number {
    return whole ? (part / whole) * 100 : 0;
  }

  // ================= PLANNING =================
  get planningJourneys(): Journey[] {
    return this.journeys
      .filter(j => ['needsAttention', 'awaitingSignoff'].includes(this.lifecycle(j)))
      .sort((a, b) => b.days - a.days);
  }

  get planningCount(): number {
    return this.planningJourneys.length;
  }

  matchSpecialists(): { id: string; u: number }[] {
    return Object.keys(this.capacity)
      .map(id => ({ id, u: this.util(this.capacity[id]) }))
      .filter(s => s.u < 100)
      .sort((a, b) => a.u - b.u);
  }

  whoIsWaiting(j: Journey): 'participant' | 'owner' | 'specialist' {
    const st = this.expanded(j.prod)[this.currIdx(j)];
    return st.by;
  }

  alertPrototype(specId: string, stage: string): void {
    alert('Prototype: would schedule ' + this.member(specId).name + ' for ' + stage + ' — pending the real capacity feed.');
  }

  // ================= DRAWER =================
  openDrawer(pid: string, jid: string | null): void {
    this.drawerPid = pid;
    this.drawerJid = jid;
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  get drawerMember(): Member | null {
    return this.drawerPid ? this.member(this.drawerPid) : null;
  }

  get drawerJourneys(): Journey[] {
    return this.drawerPid ? this.journeys.filter(j => j.pid === this.drawerPid) : [];
  }

  get drawerActiveJourney(): Journey | undefined {
    const mine = this.drawerJourneys;
    if (this.drawerJid) {
      const found = mine.find(j => j.id === this.drawerJid);
      if (found) { return found; }
    }
    return mine.find(j => !j.completed) || mine[0];
  }

  get drawerPastJourneys(): Journey[] {
    return this.drawerJourneys.filter(j => j.completed);
  }

  stepStatus(j: Journey, stepIndex: number): 'done' | 'now' | 'todo' {
    const ci = this.currIdx(j);
    if (j.completed || stepIndex < ci) { return 'done'; }
    if (stepIndex === ci) { return 'now'; }
    return 'todo';
  }

  stepWhoLabel(j: Journey, step: StageStep): string {
    if (step.by === 'participant') { return this.member(j.pid).name; }
    if (step.by === 'owner') { return this.member(j.owner).name; }
    return j.deliver ? this.member(j.deliver).name : 'unassigned';
  }

  stepNote(j: Journey, step: StageStep, status: string): string {
    return j.notes[step.label] || (status === 'todo' ? 'Pending' : '—');
  }

  // ================= COMMAND PALETTE =================
  openPalette(): void {
    this.paletteQuery = '';
    this.paletteOpen = true;
  }

  closePalette(): void {
    this.paletteOpen = false;
  }

  get paletteResults(): Member[] {
    const q = this.paletteQuery.toLowerCase();
    return Object.values(this.members).filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  }

  paletteGo(p: Member): void {
    this.closePalette();
    this.openDrawer(p.id, null);
  }
}