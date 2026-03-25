import { Component, OnInit, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { Firestore } from '@angular/fire/firestore';
import { DatePipe, Location, NgClass, NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-eco-system-new-dialog',
  templateUrl: './eco-system-new-dialog.component.html',
  styleUrls: ['./eco-system-new-dialog.component.css'],
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    NgClass,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  providers: [DatePipe],
})
export class EcoSystemNewDialogComponent implements OnInit {
  mapProfile: { [key: string]: any } = {};
  loading = true;
  searchTerm: string = '';
  filteredData: any[] = [];
  heading: string = '';
  subHeading: string = '';
  profileIdWiseCountDataMap: { [key: string]: any } = {};
  limitationYearsData: any[] = [];
  metricData: any;
  previousMetric: any;
  sectionMetric: string = '';

  data = inject(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<EcoSystemNewDialogComponent>);
  firestore = inject(Firestore);
  guard = inject(AuthguardService);
  datepipe = inject(DatePipe);
  location = inject(Location);
  router = inject(Router);

  constructor() {
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
      if (
        this.heading === 'Limitation Years' ||
        this.heading === 'Saved Years' ||
        this.heading === 'Total Adjustment' ||
        this.heading === 'Un Aware' ||
        this.heading === 'Aware'
      ) {
        this.limitationYearsData = Object.entries(this.profileIdWiseCountDataMap).map(
          ([key, value]) => ({ key, value })
        );
      }
    });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  ngOnInit(): void {
    console.log('datatatata', this.data);
  }

  profileNavigation(profileId: string) {
    const profileid = profileId;
    const navigationurl = 'user profile';
    const url = `${navigationurl}/${profileid}`;
    window.open(url, '_blank');
    // const navigationurl = 'UserProfile';
    // const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid } });
    // window.open(url.toString(), '_blank');
  }

  filterItems() {
    const isLimitationOrSavedYears =
      this.heading === 'Limitation Years' ||
      this.heading === 'Saved Years' ||
      this.heading === 'Total Adjustment' ||
      this.heading === 'Un Aware' ||
      this.heading === 'Aware';

    if (isLimitationOrSavedYears) {
      if (this.searchTerm) {
        this.limitationYearsData = Object.entries(this.profileIdWiseCountDataMap)
          .map(([key, value]) => ({ key, value }))
          .filter(profile =>
            this.mapProfile[profile.key]?.toLowerCase().includes(this.searchTerm.toLowerCase())
          );
      } else {
        this.limitationYearsData = Object.entries(this.profileIdWiseCountDataMap).map(
          ([key, value]) => ({ key, value })
        );
      }
    } else {
      if (this.searchTerm) {
        this.filteredData = this.data.element.filter((profile: any) =>
          this.mapProfile[profile]?.toLowerCase().includes(this.searchTerm.toLowerCase())
        );
      } else {
        this.filteredData = this.data.element;
      }
    }
  }
}