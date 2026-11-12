import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore,collection,doc,getDoc,getDocs,setDoc,updateDoc,query,where,Timestamp } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

@Component({
  selector: 'app-journey-pipeline',
  imports: [CommonModule, FormsModule],
  templateUrl: './journey-pipeline.component.html',
  styleUrl: './journey-pipeline.component.css'
})
export class JourneyPipelineComponent implements OnInit {

  constructor(private db: Firestore, private auth: Auth) {}

  sales: any[] = [];
  gsvList: any[] = [];
  asvList: any[] = [];
  metaByProfile: any = {};

  pjpBySale: any = {};
  completedList: any[] = [];
  bookedList: any[] = [];

  variations: any[] = [];
  showDialog = false;
  dialogCard: any = null;
  selectedId = '';
  selectedVariation: any = null;
  error = '';

  coachId = '';
  preps: any[] = [];
  stageColumns: any[] =[];
  readyForSeList: any[] = [];
  isDeveloper = true;

  journeyNames: any = {};
  journeyByProfile: any = {};
  journeyButtons: any[] = [];
  validCount = 0;
  selectedJourney = 'all';

  async ngOnInit() {
    await this.loadCoachId();
    await this.loadAll();
  }

  async loadAll() {
    await this.loadJourneys();
    await this.loadSales();
    await this.loadMetaData();
    await this.loadpjp();
    await this.loadvariations();
    await this.loadPreps();
    await this.buildColumns();
    this.buildPrepColumns();
    this.buildJourneyButtons();
  }

  async loadSales() {
    const snap = await getDocs(query(collection(this.db, 'salesleads'), where('journeytype','==','new')));
    this.sales = snap.docs.map(d => ({ ...(d.data() as any), docid: d.id }));
    this.journeyByProfile = {};
    for (const s of this.sales) {
      this.journeyByProfile[s.profileid] = s.journey;
    }
    console.log(this.sales);
  }

  isRemoved(sale: any): boolean {
    if(sale.status?.toLowerCase() === 'rejected') return true;
    if(sale.journey === 'InLXMl7OBAqlDTZcXwK0') return true;
    if(sale.journey === 'RXvsMYoK0g4SstvDDURZ' && sale.email?.toLowerCase().includes('soexcellence.com')) return true;
    return false;
  }

  async buildColumns() {
    const validSales = this.sales.filter(s => !this.isRemoved(s));
    this.gsvList = validSales.filter(s => !s.paymentplan);

    const paidSales = validSales.filter(s => s.paymentplan);
    const toCheck: any[] = [];
    this.asvList = [];
    this.completedList = [];
    this.bookedList = [];

    for (const sale of paidSales) {
      const pjp = this.pjpBySale[sale.docid];

      if (pjp?.onboarded === true) {
        const onboardedAt = pjp.onboardedtime ? pjp.onboardedtime.toMillis() : 0;
        const started = this.preps.some(p =>
          p.profileid === sale.profileid && p.createdon && p.createdon.toMillis() > onboardedAt
        );
        if (!started) this.completedList.push(sale);
      } else if (pjp?.onboardingscheduled && pjp?.appointmentid) {
        sale.appointmentid = pjp.appointmentid;
        toCheck.push(sale);
      } else {
        this.asvList.push(sale);
      }
    }

    await this.checkAppointments(toCheck);
  }

  async checkAppointments(toCheck: any[]) {
    for (const sale of toCheck) {
      const snap = await getDoc(doc(this.db, 'appointments', sale.appointmentid));
      const appt: any = snap.data();

      if (appt && appt.cancelled !== true && appt.attended !== true) {
        const host = appt.hosts?.[0];
        const hostId = host?.id || host;
        sale.specialist = this.metaByProfile[hostId]?.name || hostId;
        this.bookedList.push(sale);
      } else {
        this.asvList.push(sale);
      }
    }
  }

  async loadMetaData() {
    const snap = await getDocs(collection(this.db, 'participant metadata'));
    snap.forEach(d => {
      const m: any = d.data();
      this.metaByProfile[m.profileid] = m;
    });
  }

  getName(card: any): string {
    return this.metaByProfile[card.profileid]?.name || card.name || card.profileid;
  }

  getEmail(card: any): string {
    return this.metaByProfile[card.profileid]?.email || card.email || '';
  }

  async loadpjp() {
    const snap = await getDocs(query(collection(this.db,'participantjourneyproduct'), where('journeytype','==','new')));
    snap.forEach(d => {
      const p: any = d.data();
      if(p.salesleadsref) {
        this.pjpBySale[p.salesleadsref.id] = p;
      }
    });
  }

  async loadvariations() {
    const snap = await getDocs(collection(this.db, 'evolution prep variation'));
    this.variations = snap.docs.map(d => {
      const v: any = d.data();
      v.variationid = v.variationid || d.id;
      v.stage = Array.isArray(v.stage || v.stages) ? (v.stage || v.stages) : Object.values(v.stage || v.stages || {});
      return v;
    });
  }

  openDialog(card: any) {
    this.dialogCard = card;
    this.selectedId = '';
    this.selectedVariation = null;
    this.error = '';
    this.showDialog = true;
  }

  closeDialog() { this.showDialog = false; }

  onSelect() {
    this.selectedVariation = this.variations.find(v => v.variationid === this.selectedId);
  }

  async initiate() {
    if(!this.coachId) { this.error = 'Logged-in profile not found'; return; }
    if(!this.selectedId) { this.error = 'Select a variation'; return; }
    if(this.selectedVariation.stage.length === 0) { this.error = 'This variation has no stages'; return; }

    const running = await getDocs(query(collection(this.db, 'evolution prep'),
      where('profileid', '==', this.dialogCard.profileid),
      where('variationid', '==', this.selectedId),
      where('status', 'in', ['initiated', 'ongoing'])
    ));
    if(!running.empty) { this.error = 'Already running for this participant'; return; }

    const ref = doc(collection(this.db, 'evolution prep'));
    await setDoc(ref, {
      docid: ref.id,
      profileid: this.dialogCard.profileid,
      variationid: this.selectedId,
      currentstage: this.selectedVariation.stage[0].stagename,
      completedstages: [],
      status: 'initiated',
      createdon: Timestamp.now(),
      createdby: this.coachId
    });
    this.showDialog = false;
    await this.loadAll();
  }

  getVariationName(prep: any): string {
    const variation = this.variations.find(v => v.variationid === prep.variationid);
    return variation ? variation.variationname : '';
  }

  async cancel(card: any) {
    await updateDoc(doc(this.db, 'evolution prep', card.docid), {
      status: 'cancelled',
      cancelledby: this.coachId,
      cancelledon: Timestamp.now()
    });
    await this.loadAll();
  }

  async moveStage(card: any, step: number) {
    const variation = this.variations.find(v => v.variationid === card.variationid);
    const stages = variation.stage.map((s: any) => s.stagename);
    const newIndex = stages.indexOf(card.currentstage) + step;

    if (newIndex < 0) return;

    let status = 'ongoing';
    if (newIndex === 0) status = 'initiated';
    if (newIndex >= stages.length) status = 'completed';

    await updateDoc(doc(this.db, 'evolution prep', card.docid), {
      currentstage: stages[Math.min(newIndex, stages.length - 1)],
      completedstages: stages.slice(0, newIndex),
      status: status
    });
    await this.loadAll();
  }

  async loadPreps() {
    const snap = await getDocs(collection(this.db, 'evolution prep'));
    this.preps = snap.docs.map(d => d.data());
  }

  buildPrepColumns() {
    const stageNames: string[] = [];
    for (const v of this.variations) {
      for (const s of v.stage) {
        if (!stageNames.includes(s.stagename)) stageNames.push(s.stagename);
      }
    }

    const activePreps = this.preps.filter(p => p.status === 'initiated' || p.status === 'ongoing');
    this.stageColumns = stageNames.map(name => ({
      title: name,
      cards: activePreps.filter(p => p.currentstage === name)
    }));

    this.readyForSeList = this.preps.filter(p => p.status === 'completed');
  }

  async loadCoachId() {
    const user = await new Promise<any>(resolve => {
      const stop = onAuthStateChanged(this.auth, u => {
        stop();
        resolve(u);
      });
    });
    if (!user) {
      console.warn('No logged-in user');
      return;
    }

    const snap = await getDocs(query(
      collection(this.db, 'participant metadata'),
      where('email', '==', user.email)
    ));
    this.coachId = snap.empty ? user.uid : (snap.docs[0].data() as any).profileid;
    console.log('coachId:', this.coachId);
  }

  async loadJourneys() {
    const snap = await getDocs(collection(this.db, 'journey'));
    this.journeyNames = {};
    snap.forEach(d => {
      const j: any = d.data();
      this.journeyNames[d.id] = j.journey || d.id;
    });
  }

  buildJourneyButtons() {
    const validSales = this.sales.filter(s => !this.isRemoved(s));
    this.validCount = validSales.length;

    const counts: any = {};
    for (const s of validSales) {
      counts[s.journey] = (counts[s.journey] || 0) + 1;
    }
    this.journeyButtons = Object.keys(counts).map(id => ({
      id: id,
      name: this.journeyNames[id] || id,
      count: counts[id]
    }));
  }

  selectJourney(id: string) {
    this.selectedJourney = id;
  }

  journeyOf(card: any): string {
    return card.journey || this.journeyByProfile[card.profileid];
  }

  visible(list: any[]): any[] {
    if (this.selectedJourney === 'all') return list;
    return list.filter(c => this.journeyOf(c) === this.selectedJourney);
  }

  // ---------- Card details ----------

  getJourneyName(card: any): string {
    const id = this.journeyOf(card);
    return this.journeyNames[id] || id || '';
  }

  getPayLabel(card: any): string {
    if (!card.paymentplan) return '';
    return String(card.paymentplan).toLowerCase().includes('full') ? 'Paid in full' : 'EMI';
  }

  getTimeHere(card: any): string {
    const t = card.since || card.createdon;
    if (!t) return '';
    const days = Math.floor((Date.now() - t.toMillis()) / 86400000);
    return days + ' days here';
  }

  getScheduled(card: any): string {
    return card.scheduled ? card.scheduled.toDate().toLocaleString() : '';
  }
}
