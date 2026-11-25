import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, doc, getDoc, getDocs, onSnapshot, query, where } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { AuthguardService } from '../authguard.service';
import { filter, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { FormtemplateComponent } from '../Product Designer/delivery-set/formtemplate/formtemplate.component';

@Component({
  selector: 'app-evolution-prep-pipeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormtemplateComponent],
  templateUrl: './evolution-prep-forms.component.html',
  styleUrls: ['./evolution-prep-forms.component.css'],
})
export class EvolutionPrepPipelineComponent implements OnInit, OnDestroy {
  private auth = inject(AuthguardService);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private unsubscribe: () => void;

  loading = true;
  error = '';
  prep: any = null;
  variationName = '';
  stages: any[] = [];
  showForm = false;

  async ngOnInit() {
    try {
      const uid = await firstValueFrom(this.auth.uid$.pipe(filter(u => !!u)));
      const roles: any = await this.auth.getRoles(uid);
      const res = await getDocs(query(collection(this.firestore, 'evolution prep'), where('profileid', '==', roles['profile_ref'].id)));
      const preps = res.docs.map(d => d.data());
      const newest = (list: any[]) => list.sort((a, b) => b['createdon']?.toMillis() - a['createdon']?.toMillis())[0];
      const chosen = newest(preps.filter(p => p['status'] === 'initiated' || p['status'] === 'ongoing')) || newest(preps.filter(p => p['status'] === 'completed'));
      if (!chosen) return;

      const variation = (await getDoc(doc(this.firestore, 'evolution prep variation', chosen['variationid']))).data();
      this.variationName = variation?.['variationname'] || '';
      this.stages = variation?.['stages'] || [];
      this.prep = chosen;
      this.router.navigate([], { queryParams: { epid: chosen['docid'] }, replaceUrl: true });
      this.unsubscribe = onSnapshot(doc(this.firestore, 'evolution prep', chosen['docid']), snap => {
        this.prep = snap.data();
        if (!this.formId) this.showForm = false;
      });
    } catch (e) {
      console.error(e);
      this.error = 'Your preparation could not be loaded. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  get currentStage() {
    const running = this.prep?.status === 'initiated' || this.prep?.status === 'ongoing';
    return running ? this.stages.find(s => s.stagename === this.prep.currentstage) : null;
  }

  get formId(): string {
    const type = this.currentStage?.stagetype;
    return type === 'form' || type === 'AEL' ? this.currentStage.reference?.id : null;
  }

  stateOf(stage: any) {
    const done = (this.prep.completedstages || []).some((c: any) => (c.stagename || c) === stage.stagename);
    if (done || this.prep.status === 'completed') return 'done';
    return stage.stagename === this.prep.currentstage ? 'current' : 'upcoming';
  }
}
