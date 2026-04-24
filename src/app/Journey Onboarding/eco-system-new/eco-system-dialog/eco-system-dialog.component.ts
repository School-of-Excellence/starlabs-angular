import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Firestore } from '@angular/fire/firestore';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { Router } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-eco-system-dialog',
  templateUrl: './eco-system-dialog.component.html',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    FormsModule,
    ReactiveFormsModule
  ],
  styleUrls: ['./eco-system-dialog.component.css']
})
export class EcoSystemDialogComponent implements OnInit {
  mapProfile = {};
  loading = true; 
  searchTerm: string = ''; 
  filteredData: any[] = [];
  heading: string;
  subHeading:string;
  profileIdWiseCountDataMap = {};
  limitationYearsData: any[] = [];
  metricData: any;
  previousMetric: any;
  sectionMetric:string;
  

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    public guard: AuthguardService,
    public datepipe: DatePipe,
    public location: Location,
    public router: Router,
  ) {
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.loading = false;
      this.filteredData = this.data.element;
      this.heading = this.data.heading;
      this.sectionMetric = this.data.metricSection;
      this.subHeading = this.data.subhead;
      this.profileIdWiseCountDataMap = this.data.profileIdWiseCountData;
      this.metricData = this.data.metricData;
      this.previousMetric = this.data.previoudMetricData;
    });
  }
  closeDialog(): void {
    this.dialogRef.close(); 
  }
  ngOnInit(): void {
  }

  profileNavigation(profileId: string) {
    const profileid = profileId;
    const navigationurl = 'userprofile';
    const url = `${navigationurl}/${profileid}`;
    window.open(url, '_blank');
  }

  filterItems() {
    if (this.searchTerm) {
      this.filteredData = this.data.element.filter(profile => 
        profile.profileid && this.mapProfile[profile.profileid]?.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    } else {
      this.filteredData = this.data.element;
    }
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  getHeaderIconClass(): string {
    switch (this.heading) {
      case 'Total ATC': return 'blue';
      case 'Completed ATC': return 'green';
      case 'Limitation Years': return 'red';
      case 'Saved Years': return 'green';
      case 'Total Adjustment': return 'teal';
      default: return 'purple';
    }
  }

  getValueClass(): string {
    switch (this.heading) {
      case 'Limitation Years': return 'red';
      case 'Saved Years': return 'green';
      default: return 'teal';
    }
  }
  
}