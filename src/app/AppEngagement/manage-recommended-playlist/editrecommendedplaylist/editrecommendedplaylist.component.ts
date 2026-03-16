import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  Firestore, collection, doc, getDocs, query, where,
  writeBatch, updateDoc
} from '@angular/fire/firestore';

@Component({
  selector: 'app-editrecommendedplaylist',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    MatDialogModule,
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule,
    MatChipsModule, 
    MatDatepickerModule, 
    MatNativeDateModule, 
    MatSelectModule,
    MatOptionModule, 
    MatTooltipModule, 
    NgxMatSelectSearchModule, 
    MatProgressBarModule
  ],
  templateUrl: './editrecommendedplaylist.component.html',
  styleUrl: './editrecommendedplaylist.component.css'
})
export class EditrecommendedplaylistComponent implements OnInit {
  form: FormGroup;
  mapPlaylist: any = {};
  mapProfile: any = {};
  mapPlaylistMeta: any = {};

  eiflix: string[] = [];
  solarvoice: string[] = [];
  generalcontent: string[] = [];

  oldEiflix: string[] = [];
  oldSolarvoice: string[] = [];
  oldGeneralcontent: string[] = [];
  oldTitle = '';
  oldDesc = '';
  oldExpire: any = null;

  eiflixList: any[] = [];
  solarvoiceList: any[] = [];
  generalcontentList: any[] = [];

  searchEiflix = '';
  searchSolarvoice = '';
  searchGeneralcontent = '';
  saving = false;
  typePaths = {
    'eiflix': 'series',
    'solarvoice': 'solar voice playlist',
    'generalcontent': 'content_urls'
  };

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    public ref: MatDialogRef<EditrecommendedplaylistComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.form = this.fb.group({
      title: [''], description: [''], expiredate: [null], createdby: ['']
    });
  }

  ngOnInit() {
    this.mapPlaylist = this.data.mapPlaylist || {};
    this.mapProfile = this.data.mapProfile || {};
    this.mapPlaylistMeta = this.data.mapPlaylistMeta || {};
    let row = this.data.row;
    this.eiflix = (row.eiflix || []).map((e: any) => e?.id || e);
    this.solarvoice = (row.solarvoice || []).map((e: any) => e?.id || e);
    this.generalcontent = (row.generalcontent || []).map((e: any) => e?.id || e);
    this.oldEiflix = [...this.eiflix];
    this.oldSolarvoice = [...this.solarvoice];
    this.oldGeneralcontent = [...this.generalcontent];
    this.oldTitle = row.title || '';
    this.oldDesc = row.description || '';
    this.oldExpire = row.expiredate?.toDate ? row.expiredate.toDate() : row.expiredate || null;
    for (let id of Object.keys(this.mapPlaylistMeta)) {
      let playlistmap = this.mapPlaylistMeta[id];
      if (playlistmap['seriesName'] != null) this.eiflixList.push({ id, name: playlistmap['seriesName'] });
      else if (playlistmap['title'] != null) this.generalcontentList.push({ id, name: playlistmap['title'] });
      if (playlistmap['name'] != null && playlistmap['seriesName'] == null) this.solarvoiceList.push({ id, name: playlistmap['name'] });
    }
    this.eiflixList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    this.solarvoiceList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    this.generalcontentList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    this.form.patchValue({
      title: this.oldTitle, description: this.oldDesc,
      expiredate: this.oldExpire,
      createdby: this.mapProfile[row.createdby] || row.createdby || ''
    });
  }
  filtered(list: any[], search: string) {
    if (!search) return list;
    let s = search.toLowerCase();
    return list.filter(o => (o.name || '').toLowerCase().includes(s));
  }

  remove(arr: string[], id: string) { return arr.filter(i => i !== id); }
  same(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    let x = [...a].sort(), y = [...b].sort();
    return x.every((v, i) => v === y[i]);
  }
  refs(ids: string[], type: string) {
    let path = this.typePaths[type];
    return ids.map(id => doc(this.firestore, path, id));
  }
  ids(type: string) {
    if (type === 'eiflix') return this.eiflix;
    if (type === 'solarvoice') return this.solarvoice;
    return this.generalcontent;
  }
  oldIds(type: string) {
    if (type === 'eiflix') return this.oldEiflix;
    if (type === 'solarvoice') return this.oldSolarvoice;
    return this.oldGeneralcontent;
  }

  async save() {
    let row = this.data.row;
    let formvalue = this.form.value;
    let types = ['eiflix', 'solarvoice', 'generalcontent'];
    let titleDiff = formvalue.title !== this.oldTitle;
    let descDiff = formvalue.description !== this.oldDesc;
    let expDiff = (formvalue.expiredate?.getTime?.() || null) !== (this.oldExpire?.getTime?.() || null);
    let typeDiff = {};
    for (let t of types) typeDiff[t] = !this.same(this.ids(t), this.oldIds(t));

    let hasChange = titleDiff || descDiff || expDiff || types.some(t => typeDiff[t]);
    if (!hasChange) { alert('No changes.'); return; }
    if (!confirm('Update?')) return;
    this.saving = true;
    try {
      let bufRef = doc(this.firestore, 'buffermix archive', row.docid);
      let bufUp: any = {};
      if (titleDiff) bufUp['title'] = formvalue.title;
      if (descDiff) bufUp['description'] = formvalue.description;
      if (expDiff) bufUp['expiredate'] = formvalue.expiredate || null;
      for (let t of types) if (typeDiff[t]) bufUp[t] = this.refs(this.ids(t), t);
      await updateDoc(bufRef, bufUp);
      let snap = await getDocs(query(
        collection(this.firestore, 'recommended mix playlist'),
        where('bufferdocref', '==', bufRef)
      ));
      let batch = writeBatch(this.firestore);
      let n = 0;
      for (let d of snap.docs) {
        let type = d.data()['type'];
        let nowIds = this.ids(type);
        if (nowIds.length === 0) {
          batch.delete(d.ref);
          n++;
        } else {
          let up: any = {};
          if (titleDiff) up['title'] = formvalue.title;
          if (descDiff) up['description'] = formvalue.description;
          if (expDiff) up['expiredate'] = formvalue.expiredate || null;
          if (typeDiff[type]) up['list'] = this.refs(nowIds, type);
          if (Object.keys(up).length > 0) { batch.update(d.ref, up); n++; }
        }
        if (n > 0 && n % 400 === 0) { await batch.commit(); batch = writeBatch(this.firestore); }
      }
      let profiles: string[] = row.profileid || [];
      for (let t of types) {
        if (this.oldIds(t).length === 0 && this.ids(t).length > 0) {
          for (let pid of profiles) {
            let newRef = doc(collection(this.firestore, 'recommended mix playlist'));
            batch.set(newRef, {
              profileid: pid,
              title: formvalue.title || '', description: formvalue.description || '',
              expiredate: formvalue.expiredate || null,
              bufferdocref: bufRef, date: row.date || new Date(),
              id: newRef.id, type: t,
              list: this.refs(this.ids(t), t),
              personalised: row.personalised || false,
              ...(row.personalised ? { recommendedby: row.recommendedby, recommendedbyname: row.recommendedbyname } : {})
            });
            n++;
            if (n > 0 && n % 400 === 0) { await batch.commit(); batch = writeBatch(this.firestore); }
          }
        }
      }
      if (n > 0) await batch.commit();
      Object.assign(row, bufUp);
      this.saving = false;
      this.ref.close({ updated: true });
    } catch (err) {
      console.error(err);
      this.saving = false;
      alert('Update failed.');
    }
  }
  close() { this.ref.close(); }
}