import { DatePipe } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { collection, doc, Firestore, getDocs, serverTimestamp, updateDoc } from '@angular/fire/firestore';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-ael-edit-dialog',
  imports: [
    MatSelectModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './ael-edit-dialog.component.html',
  styleUrl: './ael-edit-dialog.component.css'
})
export class AelEditDialogComponent {
  acceleratedLevel : any[] = []
  numberRange: number[] = Array.from({ length: 11 }, (_, i) => i);
  updating = false;
  selectedPoints: { 
    Business: { startpoint?: any, endpoint?: any, metric?:any, jumpedfrom?:any },
    Career: { startpoint?: any, endpoint?: any, metric?:any, jumpedfrom?:any },
    Health: { startpoint?: any, endpoint?: any, metric?:any, jumpedfrom?:any },
    ['Personal Genius']: { startpoint?: any, endpoint?: any, metric?:any, jumpedfrom?:any },
    Family: { startpoint?: any, endpoint?: any, metric?:any, jumpedfrom?:any }
  } = {
    Business: { startpoint: null, endpoint: null, metric: null,jumpedfrom:null },
    Career: { startpoint: null, endpoint: null, metric: null,jumpedfrom:null },
    Health: { startpoint: null, endpoint: null, metric: null,jumpedfrom:null },
    ['Personal Genius']: { startpoint: null, endpoint: null, metric: null,jumpedfrom:null },
    Family: { startpoint: null, endpoint: null, metric: null,jumpedfrom:null }
  };
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    public guard: AuthguardService,
    public datepipe: DatePipe,
    public router: Router,
  ) { }

  ngOnInit(): void {
    console.log(this.data);
    
    getDocs(collection(this.firestore, 'accelerated evolution level')).then((acceleratedlevel) => {
      acceleratedlevel.docs.forEach((doc) => {
        const sequence = doc.data();
        this.acceleratedLevel.push(sequence);
      });  
      const metrics = this.data['element']['metric'] || {}; 
      
      // Business
      if (metrics.Business) {
        this.selectedPoints.Business.startpoint = metrics.Business.startpoint || null;
        this.selectedPoints.Business.endpoint = metrics.Business.endpoint || null;
        this.selectedPoints.Business.metric = metrics.Business.metric || null;
        this.selectedPoints.Business.jumpedfrom = metrics.Business.jumpedfrom || null;
      }
  
      // Career
      if (metrics.Career) {
        this.selectedPoints.Career.startpoint = metrics.Career.startpoint || null;
        this.selectedPoints.Career.endpoint = metrics.Career.endpoint || null;
        this.selectedPoints.Career.metric = metrics.Career.metric || null;
        this.selectedPoints.Career.jumpedfrom = metrics.Career.jumpedfrom || null;
      }
  
      // Health
      if (metrics.Health) {
        this.selectedPoints.Health.startpoint = metrics.Health.startpoint || null;
        this.selectedPoints.Health.endpoint = metrics.Health.endpoint || null;
        this.selectedPoints.Health.metric = metrics.Health.metric || null;
        this.selectedPoints.Health.jumpedfrom = metrics.Health.jumpedfrom || null;
      }
  
      // Personal Genius
      if (metrics['Personal Genius']) {
        this.selectedPoints['Personal Genius'].startpoint = metrics['Personal Genius'].startpoint || null;
        this.selectedPoints['Personal Genius'].endpoint = metrics['Personal Genius'].endpoint || null;
        this.selectedPoints['Personal Genius'].metric = metrics['Personal Genius'].metric || null;
        this.selectedPoints['Personal Genius'].jumpedfrom = metrics['Personal Genius'].jumpedfrom || null;
      }
  
      // Family
      if (metrics.Family) {
        this.selectedPoints.Family.startpoint = metrics.Family.startpoint || null;
        this.selectedPoints.Family.endpoint = metrics.Family.endpoint || null;
        this.selectedPoints.Family.metric = metrics.Family.metric || null;
        this.selectedPoints.Family.jumpedfrom = metrics.Family.jumpedfrom || null;
      }
    });
  }
  save() {
    this.updating = true;
    console.log('Selected Points:', this.selectedPoints);
    const docid = this.data['element']['docid'];
    console.log("docid log", docid);
    updateDoc(doc(this.firestore, 'interim crossover', docid), {
      metric:this.selectedPoints,
      edited: serverTimestamp(),
    }).then(() => {
      this.updating = false
      console.log("updated");
      this.dialogRef.close();
    }).catch(error => {
      this.updating = false
      console.error("Error updating document: ", error);
    });
  }
}
