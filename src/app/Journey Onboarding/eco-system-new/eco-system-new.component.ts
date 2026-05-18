import { Component, OnInit, inject } from '@angular/core';
import { collection, getFirestore, query, where, getDocs } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Storage } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { Timestamp } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { KeyValue, DatePipe, NgFor, NgIf, NgClass, NgStyle, KeyValuePipe } from '@angular/common';
import { EcoSystemNewDialogComponent } from './eco-system-new-dialog/eco-system-new-dialog.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
// import { NewReleaseDialogComponent } from '../../Participants Profile Management/new-profile/new-profile.component';

@Component({
  selector: 'app-eco-system-new',
  templateUrl: './eco-system-new.component.html',
  styleUrls: ['./eco-system-new.component.css'],
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    NgClass,
    NgStyle,
    FormsModule,
    DatePipe,
    KeyValuePipe,
    MatDialogModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
  ],
  providers: [DatePipe],
})
export class EcoSystemNewComponent implements OnInit {
  firestoreDefault = getFirestore();
  private guard = inject(AuthguardService);
  private storage = inject(Storage);
  public dialog = inject(MatDialog);
  public router = inject(Router);

  mapProfile: { [key: string]: any } = {};
  mapParticipant: { [key: string]: any } = {};
  eventProfiles: { [key: string]: any } = {};
  eventNames: string[] = [];
  loading = true;
  leakRetained: { [key: string]: { retainedprofile: { [key: string]: string[] }, leakedprofile: string[] } } = {};
  selectedEvent: string = '';
  countType: string = 'retaincount';
  ael: { [key: string]: any } = {};
  interimCrossover: any[] = [];
  lightColors: string[] = [
    'rgba(255, 99, 132, 1)',
    'rgba(54, 162, 235, 1)',
    'rgba(255, 206, 86, 1)',
    'rgba(75, 192, 192, 1)',
    'rgba(153, 102, 255, 1)',
    'rgba(255, 159, 64, 1)',
    'rgba(255, 99, 132, 0.7)',
    'rgba(54, 162, 235, 0.7)',
    'rgba(255, 206, 86, 0.7)',
    'rgba(75, 192, 192, 0.7)',
    'rgba(153, 102, 255, 0.7)',
    'rgba(255, 159, 64, 0.7)',
    'rgba(255, 99, 132, 0.5)',
    'rgba(54, 162, 235, 0.5)',
    'rgba(255, 206, 86, 0.5)',
    'rgba(75, 192, 192, 0.5)',
    'rgba(153, 102, 255, 0.5)',
    'rgba(255, 159, 64, 0.5)',
    'rgba(255, 99, 132, 0.3)',
    'rgba(54, 162, 235, 0.3)',
  ];

  // filter
  filter: any = {
    startdate: null,
    enddate: null
  };
  startDate: any;
  totalATCKey: any;
  endDate: any;
  saleUpgradedCounts: { [key: string]: any } = {};
  saleDowngradedCounts: { [key: string]: any } = {};
  groupedData: { [key: string]: any } = {};
  // totalATC = 0;
  totalATC: { [key: string]: any } = {};
  totalAdjustmentsCompleted = 0;
  evolutionYearSaved = 0;
  evolutionYearSavedMap: { [key: string]: any } = {};
  evolutionYearWasted = 0;
  evolutionYearWastedMap: { [key: string]: any } = {};
  totalAdjustmentAware = 0;
  totalAdjustmentAwareMap: { [key: string]: any } = {};
  totalAdjustmentUnAware = 0;
  totalAdjustmentUnAwareMap: { [key: string]: any } = {};
  extendedLifeImpactTotal = 0;
  extendedLifeImpactMap: { [key: string]: any } = {};
  evolutionprogressCount = 0;
  evolutionprogressMap: { [key: string]: any } = {};
  productCountMap: { [key: string]: any } = {};
  percentageCompleted = 0;
  percentageOngoing = 0;
  totalProductCount = 0;
  totalAdjustmentsCompletedMap: { [key: string]: any } = {};
  adjustmentCompletedMap: { [key: string]: any } = {};
  // selectedEvent: string = '';
  // countType
  retainedCount: any;
  leakCount: any;
  groupedByMonthYear: any = {};
  sortedMonths: string[] = [];
  filteredMonths: string[] = [];
  areaChangeLabels = [
    { key: 'noChange', label: 'No Change' },
    { key: 'oneArea', label: '1 Area Changed' },
    { key: 'twoAreas', label: '2 Areas Changed' },
    { key: 'threeAreas', label: '3 Areas Changed' },
    { key: 'fourAreas', label: '4 Areas Changed' },
    { key: 'allAreas', label: 'All Areas Changed' },
  ];
  processedData: any = {};

  constructor() {
    this.guard.getRoles().then(async roles => {
      if (roles['admin'] || roles['ah']) {
        console.log('Good');
      } else {
        alert('Unauthorized Access');
        this.router.navigateByUrl('/');
      }
    });
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
    this.participantDashboard();
  }

  ngOnInit(): void {
    this.getEvents();
    this.getUpgradesDowngrades();
    this.getAtcAlpha();
    this.getAEL();
  }

  // openDialog(): void {
  //   const dialogRef = this.dialog.open(NewReleaseDialogComponent, {
  //     width: '100%',
  //     height: '85%',
  //     data: {
  //       content: {
  //         'Interim Report': "When a row in the Interim Report section's table is clicked, a dialog will open displaying a detailed report of the user's Cross Over Metric, Evolution Progress, Love Letter, and Ask A&H.",
  //         'AEL': 'A new AEL section has been added. It contains a table listing all AEL entries filled by the user, along with an edit button to modify the AEL.',
  //       },
  //       date: '26/12/2024',
  //       screenname: 'User Profile Screen'
  //     }
  //   });
  // }

  groupEntriesByMonthYear() {
    for (const profile of Object.keys(this.groupedData)) {
      for (const entry of this.groupedData[profile]) {
        for (const dateKey of Object.keys(entry)) {
          const date = new Date(dateKey);
          const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`;
          if (!this.groupedByMonthYear[monthYear]) {
            this.groupedByMonthYear[monthYear] = [];
          }
          const profileData = {
            [profile]: entry[dateKey]
          };
          this.groupedByMonthYear[monthYear].push(profileData);
        }
      }
    }
    this.processData();
    this.sortedMonths = Object.keys(this.groupedByMonthYear).sort((a, b) => {
      const [yearA, monthA] = a.split('-').map(Number);
      const [yearB, monthB] = b.split('-').map(Number);
      return yearA === yearB ? monthA - monthB : yearA - yearB;
    });
    // console.log("Group data console",this.groupedByMonthYear);
  }

  filterDataByDateRange() {
    const startYear = this.filter.startdate.getFullYear();
    const startMonth = this.filter.startdate.getMonth() + 1;
    const endYear = this.filter.enddate.getFullYear();
    const endMonth = this.filter.enddate.getMonth() + 1;
    this.filteredMonths = this.sortedMonths.filter(monthYear => {
      const [year, month] = monthYear.split('-').map(Number);
      if (year < startYear || year > endYear) {
        return false;
      }
      if (year === startYear && month < startMonth) {
        return false;
      }
      if (year === endYear && month > endMonth) {
        return false;
      }
      return true;
    });
  }

  processData() {
    const months = Object.keys(this.groupedByMonthYear).sort((a, b) => {
      const [yearA, monthA] = a.split('-').map(Number);
      const [yearB, monthB] = b.split('-').map(Number);
      return yearA === yearB ? monthA - monthB : yearA - yearB;
    });

    months.forEach((month, index) => {
      const currentMonthData = this.groupedByMonthYear[month];
      const totalProfiles = currentMonthData.length;

      const upCounts: { [key: string]: any } = {};
      const downCounts: { [key: string]: any } = {};
      const areaChangedUpCounts: { [key: string]: any[] } = {
        noChange: [],
        oneArea: [],
        twoAreas: [],
        threeAreas: [],
        fourAreas: [],
        allAreas: []
      };
      const areaChangedDownCounts: { [key: string]: any[] } = {
        oneArea: [],
        twoAreas: [],
        threeAreas: [],
        fourAreas: [],
        allAreas: []
      };

      const areaChangedUpCountsMetric: { [key: string]: any } = {
        noChange: {},
        oneArea: {},
        twoAreas: {},
        threeAreas: {},
        fourAreas: {},
        allAreas: {}
      };

      const areaChangedDownCountsMetric: { [key: string]: any } = {
        oneArea: {},
        twoAreas: {},
        threeAreas: {},
        fourAreas: {},
        allAreas: {}
      };

      ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
        upCounts[category] = { count: 0, profileIds: [] };
        downCounts[category] = { count: 0, profileIds: [] };
      });

      currentMonthData.forEach((profile: any) => {
        const profileName = Object.keys(profile)[0];
        const profileData = profile[profileName];
        let upAreaChanges = 0;
        let downAreaChanges = 0;

        ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
          const currentSequence = profileData[category]?.sequence;
          let previousSequence: any;
          for (let i = index - 1; i >= 0; i--) {
            const previousMonth = months[i];
            const previousMonthData = this.groupedByMonthYear[previousMonth];
            const previousProfileData = previousMonthData.find((p: any) => Object.keys(p)[0] === profileName);

            if (previousProfileData) {
              previousSequence = previousProfileData[profileName][category]?.sequence;
              if (previousSequence !== undefined) break;
            }
          }
          if (previousSequence !== undefined && currentSequence !== undefined) {
            if (Number(currentSequence) > Number(previousSequence)) {
              upCounts[category].count++;
              upCounts[category].profileIds.push(profileName);
              upAreaChanges++;
            } else if (Number(currentSequence) < Number(previousSequence)) {
              downCounts[category].count++;
              downCounts[category].profileIds.push(profileName);
              downAreaChanges++;
            }
          }
        });

        if (upAreaChanges > 0) {
          if (upAreaChanges === 1) {
            areaChangedUpCounts['oneArea'].push(profileName);
            areaChangedUpCountsMetric['oneArea'][profileName] = profileData;
          } else if (upAreaChanges === 2) {
            areaChangedUpCounts['twoAreas'].push(profileName);
            areaChangedUpCountsMetric['twoAreas'][profileName] = profileData;
          } else if (upAreaChanges === 3) {
            areaChangedUpCounts['threeAreas'].push(profileName);
            areaChangedUpCountsMetric['threeAreas'][profileName] = profileData;
          } else if (upAreaChanges === 4) {
            areaChangedUpCounts['fourAreas'].push(profileName);
            areaChangedUpCountsMetric['fourAreas'][profileName] = profileData;
          } else {
            areaChangedUpCounts['allAreas'].push(profileName);
            areaChangedUpCountsMetric['allAreas'][profileName] = profileData;
          }
        }

        if (downAreaChanges > 0) {
          if (downAreaChanges === 1) {
            areaChangedDownCounts['oneArea'].push(profileName);
            areaChangedDownCountsMetric['oneArea'][profileName] = profileData;
          } else if (downAreaChanges === 2) {
            areaChangedDownCounts['twoAreas'].push(profileName);
            areaChangedDownCountsMetric['twoAreas'][profileName] = profileData;
          } else if (downAreaChanges === 3) {
            areaChangedDownCounts['threeAreas'].push(profileName);
            areaChangedDownCountsMetric['threeAreas'][profileName] = profileData;
          } else if (downAreaChanges === 4) {
            areaChangedDownCounts['fourAreas'].push(profileName);
            areaChangedDownCountsMetric['fourAreas'][profileName] = profileData;
          } else {
            areaChangedDownCounts['allAreas'].push(profileName);
            areaChangedDownCountsMetric['allAreas'][profileName] = profileData;
          }
        }

        if (upAreaChanges === 0 && downAreaChanges === 0) {
          areaChangedUpCounts['noChange'].push(profileName);
          areaChangedUpCountsMetric['noChange'][profileName] = profileData;
        }
      });

      this.processedData[month] = {
        upCounts,
        downCounts,
        areaChangedUpCounts,
        areaChangedDownCounts,
        areaChangedUpCountsMetric,
        areaChangedDownCountsMetric,
        totalProfiles
      };
      // console.log("this.processedData[month]", this.processedData[month]);
    });
    // this.filterDataByDateRange()
  }

  // processData() {
  //   const months = Object.keys(this.groupedByMonthYear).sort((a, b) => {
  //     const [yearA, monthA] = a.split('-').map(Number);
  //     const [yearB, monthB] = b.split('-').map(Number);
  //     return yearA === yearB ? monthA - monthB : yearA - yearB;
  //   });

  //   months.forEach((month, index) => {
  //     const currentMonthData = this.groupedByMonthYear[month];
  //     console.log("currentMonthData",currentMonthData);
  //     const totalProfiles = currentMonthData.length;

  //     const upCounts = {};
  //     const downCounts = {};
  //     const areaChangedUpCounts = {
  //       noChange: [],
  //       oneArea: [],
  //       twoAreas: [],
  //       threeAreas: [],
  //       fourAreas: [],
  //       allAreas: []
  //     };
  //     const areaChangedDownCounts = {
  //       oneArea: [],
  //       twoAreas: [],
  //       threeAreas: [],
  //       fourAreas: [],
  //       allAreas: []
  //     };

  //     ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
  //       upCounts[category] = { count: 0, profileIds: [] };
  //       downCounts[category] = { count: 0, profileIds: [] };
  //     });

  //     // currentMonthData.forEach(profile => {
  //     //   const profileName = Object.keys(profile)[0];
  //     //   const profileData = profile[profileName];
  //     //   let upAreaChanges = 0;
  //     //   let downAreaChanges = 0;

  //     //   ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
  //     //     const currentSequence = profileData[category]?.sequence;
  //     //     let previousSequence;
  //     //     for (let i = index - 1; i >= 0; i--) {
  //     //       const previousMonth = months[i];
  //     //       const previousMonthData = this.groupedByMonthYear[previousMonth];
  //     //       const previousProfileData = previousMonthData.find(p => Object.keys(p)[0] === profileName);

  //     //       if (previousProfileData) {
  //     //         previousSequence = previousProfileData[profileName][category]?.sequence;
  //     //         if (previousSequence !== undefined) break;
  //     //       }
  //     //     }
  //     //     if (previousSequence !== undefined) {
  //     //       if (currentSequence > previousSequence) {
  //     //         upCounts[category].count++;
  //     //         upCounts[category].profileIds.push(profileName);
  //     //         upAreaChanges++;
  //     //       } else if (currentSequence < previousSequence) {
  //     //         downCounts[category].count++;
  //     //         downCounts[category].profileIds.push(profileName);
  //     //         downAreaChanges++;
  //     //       }
  //     //     }
  //     //   });
  //     //   if (upAreaChanges > 0) {
  //     //     if (upAreaChanges === 1) areaChangedUpCounts.oneArea.push(profileName);
  //     //     else if (upAreaChanges === 2) areaChangedUpCounts.twoAreas.push(profileName);
  //     //     else if (upAreaChanges === 3) areaChangedUpCounts.threeAreas.push(profileName);
  //     //     else if (upAreaChanges === 4) areaChangedUpCounts.fourAreas.push(profileName);
  //     //     else areaChangedUpCounts.allAreas.push(profileName);
  //     //   } else if (downAreaChanges > 0) {
  //     //     if (downAreaChanges === 1) areaChangedDownCounts.oneArea.push(profileName);
  //     //     else if (downAreaChanges === 2) areaChangedDownCounts.twoAreas.push(profileName);
  //     //     else if (downAreaChanges === 3) areaChangedDownCounts.threeAreas.push(profileName);
  //     //     else if (downAreaChanges === 4) areaChangedDownCounts.fourAreas.push(profileName);
  //     //     else areaChangedDownCounts.allAreas.push(profileName);
  //     //   } else {
  //     //     areaChangedUpCounts.noChange.push(profileName);
  //     //   }
  //     // });
  //     currentMonthData.forEach(profile => {
  //       const profileName = Object.keys(profile)[0];
  //       const profileData = profile[profileName];
  //       let upAreaChanges = 0;
  //       let downAreaChanges = 0;

  //       ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
  //         const currentSequence = profileData[category]?.sequence;
  //         let previousSequence;
  //         for (let i = index - 1; i >= 0; i--) {
  //           const previousMonth = months[i];
  //           const previousMonthData = this.groupedByMonthYear[previousMonth];
  //           const previousProfileData = previousMonthData.find(p => Object.keys(p)[0] === profileName);

  //           if (previousProfileData) {
  //             previousSequence = previousProfileData[profileName][category]?.sequence;
  //             if (previousSequence !== undefined) break;
  //           }
  //         }
  //         if (previousSequence !== undefined) {
  //           if (currentSequence > previousSequence) {
  //             upCounts[category].count++;
  //             upCounts[category].profileIds.push(profileName);
  //             upAreaChanges++;
  //           } else if (currentSequence < previousSequence) {
  //             downCounts[category].count++;
  //             downCounts[category].profileIds.push(profileName);
  //             downAreaChanges++;
  //           }
  //         }
  //       });

  //       if (upAreaChanges > 0) {
  //         if (upAreaChanges === 1) areaChangedUpCounts.oneArea.push(profileName);
  //         else if (upAreaChanges === 2) areaChangedUpCounts.twoAreas.push(profileName);
  //         else if (upAreaChanges === 3) areaChangedUpCounts.threeAreas.push(profileName);
  //         else if (upAreaChanges === 4) areaChangedUpCounts.fourAreas.push(profileName);
  //         else areaChangedUpCounts.allAreas.push(profileName);
  //       }

  //       if (downAreaChanges > 0) {
  //         if (downAreaChanges === 1) areaChangedDownCounts.oneArea.push(profileName);
  //         else if (downAreaChanges === 2) areaChangedDownCounts.twoAreas.push(profileName);
  //         else if (downAreaChanges === 3) areaChangedDownCounts.threeAreas.push(profileName);
  //         else if (downAreaChanges === 4) areaChangedDownCounts.fourAreas.push(profileName);
  //         else areaChangedDownCounts.allAreas.push(profileName);
  //       }
  //       if (upAreaChanges === 0 && downAreaChanges === 0) {
  //         areaChangedUpCounts.noChange.push(profileName);
  //       }
  //     });

  //     this.processedData[month] = {
  //       upCounts,
  //       downCounts,
  //       areaChangedUpCounts,
  //       areaChangedDownCounts,
  //       totalProfiles
  //     };
  //   });
  //   // this.filterDataByDateRange()
  // }



  // processData() {
  //   const months = Object.keys(this.groupedByMonthYear);

  //   months.forEach((month, index) => {
  //     const currentMonthData = this.groupedByMonthYear[month];
  //     const previousMonthData = months[index - 1] ? this.groupedByMonthYear[months[index - 1]] : [];

  //     const upCounts = {};
  //     const downCounts = {};
  //     const changeCounts = {};
  //     ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
  //       upCounts[category] = { count: 0, profileIds: [] };
  //       downCounts[category] = { count: 0, profileIds: [] };
  //     });

  //     currentMonthData.forEach(profile => {
  //       const profileName = Object.keys(profile)[0];
  //       const profileData = profile[profileName];
  //       changeCounts[profileName] = { changed: 0, unchanged: 0 };

  //       ['Business', 'Career', 'Family', 'Health', 'Personal Genius'].forEach(category => {
  //         const currentSequence = profileData[category]?.sequence;
  //         const previousSequence = previousMonthData.find(p => Object.keys(p)[0] === profileName)?.[profileName][category]?.sequence;

  //         if (previousSequence !== undefined) {
  //           if (currentSequence > previousSequence) {
  //             upCounts[category].count++;
  //             upCounts[category].profileIds.push(profileName);
  //           } else if (currentSequence < previousSequence) {
  //             downCounts[category].count++;
  //             downCounts[category].profileIds.push(profileName);
  //           }
  //          if (currentSequence !== previousSequence) {
  //             changeCounts[profileName].changed++;
  //           } else {
  //             changeCounts[profileName].unchanged++;
  //           }
  //         }
  //       });
  //     });

  //     this.processedData[month] = { upCounts, downCounts, changeCounts };
  //   });

  //   console.log("Counts of changed and unchanged areas per profile by month:", this.processedData);
  // }

  formatDate(date: Date): string {
    if (!date) return '';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short' };
    return date.toLocaleDateString('en-US', options).replace(',', '').toUpperCase();
  }

  profileNavigation(profileId: string) {
    const profileid = profileId;
    if (profileId.length < 10) {
      alert('No profile for this');
    } else {
      const navigationurl = 'user profile';
      const url = `${navigationurl}/${profileid}`;
      window.open(url, '_blank');
      // const navigationurl = 'UserProfile';
      // const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid }})
      // window.open(url.toString(),'_blank')
    }
  }

  participantDashboard() {
    const colRef = collection(this.firestoreDefault, 'participantdashboard');
    const q = query(colRef, where('customerstatus', '==', 'active'));
    getDocs(q).then(participant => {
      participant.docs.forEach(doc => {
        const element = doc.data();
        this.mapParticipant[element['profileid']] = element['name'];
      });
    });
  }

  getPreviousMetric(metricData: any, monthYear: string) {
    const keys = Object.keys(metricData);
    const [year, month] = monthYear.split('-').map(Number);
    const targetDate = new Date(year, month - 1);
    const previousData: { [key: string]: any } = {};
    keys.forEach(key => {
      const groupedArray = this.groupedData[key];
      // (Array.isArray(groupedArray))
      const availableDates = groupedArray.map((item: any) => {
        const dateString = Object.keys(item)[0];
        return new Date(dateString);
      }).sort((a: Date, b: Date) => b.getTime() - a.getTime());
      const previousDate = availableDates.find((date: Date) => date < targetDate);
      if (previousDate) {
        const previousMonth = previousDate.toLocaleString('default', { month: 'long' });
        const previousYear = previousDate.getFullYear();
        const previousDateString = previousDate.toString();
        const previousDataItem = groupedArray.find((item: any) => Object.keys(item)[0] === previousDateString);
        if (previousDataItem) {
          previousData[key] = {
            data: previousDataItem[previousDateString],
            month: previousMonth,
            year: previousYear
          };
        }
      }
    });
    return previousData;
  }

  openEcoDialog(element: any, head: any, subHead?: any, profileIdWiseCount?: any, metrics?: any, prevMetric?: any, metricsection?: any) {
    var dialogRef = this.dialog.open(EcoSystemNewDialogComponent, {
      data: {
        element: element,
        heading: head,
        subhead: subHead,
        profileIdWiseCountData: profileIdWiseCount,
        metricData: metrics,
        previoudMetricData: prevMetric,
        metricSection: metricsection
      },
      autoFocus: false,
      width: '90%',
      height: '95%',
    });
    dialogRef.afterClosed().toPromise().then(value => {
      if (value != null) {
      }
    });
  }

  async getAEL() {
    const today = new Date();
    const monthsfive = new Date(today.getFullYear(), today.getMonth() - 4, 1);
    // console.log("today", today);
    // console.log("Monthss", monthsfive);
    const startDate = this.filter.startdate
      ? Timestamp.fromDate(new Date(new Date(this.filter.startdate).setDate(1)))
      : Timestamp.fromDate(monthsfive);
    const endDate = this.filter.enddate
      ? Timestamp.fromDate(new Date(new Date(this.filter.enddate).setDate(1)))
      : Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));

    const aelQuery = await getDocs(collection(this.firestoreDefault, 'accelerated evolution level'));
    this.ael = {};
    aelQuery.docs.forEach(doc => {
      const element = doc.data();
      this.ael[element['sequence']] = {
        endpoint: element['endpoint'],
        startpoint: element['startpoint']
      };
    });

    const interimQuery = await getDocs(collection(this.firestoreDefault, 'interim crossover'));
    // const interimQuery = await getDocs(query(collection(this.firestoreDefault, 'interim crossover'),
    //   where('created', '>=', startDate),
    //   where('created', '<', endDate)
    // ));

    const groupedByProfileAndMonth: { [profileId: string]: { [monthYear: string]: any } } = {};

    interimQuery.forEach(doc => {
      const element = doc.data();
      const profileId = element['profileid'];
      if (!element['created']) return;
      const created = element['created'].toDate();
      const metric = element['metric'];

      if (profileId) {
        const monthYear = `${created.getFullYear()}-${created.getMonth() + 1}`;

        if (!groupedByProfileAndMonth[profileId]) {
          groupedByProfileAndMonth[profileId] = {};
        }

        if (!groupedByProfileAndMonth[profileId][monthYear] || created > groupedByProfileAndMonth[profileId][monthYear].created) {
          groupedByProfileAndMonth[profileId][monthYear] = { created, metric };
        }
      }
    });

    this.groupedData = {};
    for (const profileId in groupedByProfileAndMonth) {
      this.groupedData[profileId] = [];
      for (const monthYear in groupedByProfileAndMonth[profileId]) {
        const { created, metric } = groupedByProfileAndMonth[profileId][monthYear];
        this.groupedData[profileId].push({ [created]: metric });
      }
    }

    for (const profileId in this.groupedData) {
      this.groupedData[profileId].forEach((entry: any) => {
        const metrics = entry[Object.keys(entry)[0]];
        for (const mapKey in metrics) {
          const metric = metrics[mapKey];
          const sequenceEntry = Object.entries(this.ael).find(
            ([, aelEntry]) => (aelEntry as any)['endpoint'] === metric.endpoint
            // && aelEntry['startpoint'] === metric.startpoint
          );
          if (sequenceEntry) {
            metric['sequence'] = sequenceEntry[0];
          } else {
            // console.log(`No sequence found for profileId ${this.mapProfile[profileId]} with startpoint ${metric.startpoint} and endpoint ${metric.endpoint}`);
          }
        }
      });
      this.groupedData[profileId].sort((a: any, b: any) => a.created - b.created);
    }

    // console.log("data", this.groupedData);
    this.groupEntriesByMonthYear();
  }


  // async getAEL() {
  //   const today = new Date();
  //   const monthsfive = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  //   const startDate = this.filter.startdate
  //   ? firebase.default.firestore.Timestamp.fromDate(new Date(new Date(this.filter.startdate).setDate(1)))
  //   : firebase.default.firestore.Timestamp.fromDate(monthsfive);
  //   const endDate = this.filter.enddate
  //   ? firebase.default.firestore.Timestamp.fromDate(new Date(new Date(this.filter.enddate).setDate(1)))
  //   : firebase.default.firestore.Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth(), 1));
  //   // console.log("startDate (month-only)", startDate);
  //   // console.log("endDate (month-only)", endDate);
  //   const aelQuery = await this.firestoreDefault.collection('accelerated evolution level').get().toPromise();
  //   this.ael = {};
  //   aelQuery.docs.forEach((doc) => {
  //     const element = doc.data();
  //     this.ael[element['sequence']] = {
  //       endpoint: element['endpoint'],
  //       startpoint: element['startpoint']
  //     };
  //   });
  //   const interimQuery = await this.firestoreDefault.collection('interim crossover', ref =>
  //     ref
  //     .where('created', '>=', startDate)
  //     .where('created', '<', endDate)
  //   ).get().toPromise();

  //   this.groupedData = {};
  //   interimQuery.forEach((doc) => {
  //     const element = doc.data();
  //     const profileId = element['profileid'];
  //     const created = element['created'].toDate();
  //     const metric = element['metric'];
  //     if (profileId) {
  //       if (!this.groupedData[profileId]) {
  //         this.groupedData[profileId] = [];
  //       }
  //       this.groupedData[profileId].push({ [created]: metric });
  //     }
  //   });

  //   for (const profileId in this.groupedData) {
  //     this.groupedData[profileId].forEach(entry => {
  //       const metrics = entry[Object.keys(entry)[0]];
  //       for (const mapKey in metrics) {
  //         const metric = metrics[mapKey];
  //         const sequenceEntry = Object.values(this.ael).find(aelEntry =>
  //           aelEntry['endpoint'] === metric.endpoint && aelEntry['startpoint'] === metric.startpoint
  //         );
  //         if (sequenceEntry) {
  //           metric['sequence'] = Object.keys(this.ael).find(seq => this.ael[seq] === sequenceEntry);
  //         }
  //       }
  //     });
  //     this.groupedData[profileId].sort((a, b) => a.created - b.created);
  //   }
  //   console.log("groupedData", this.groupedData);
  //   this.groupEntriesByMonthYear();
  // }

  getUpgradesDowngrades() {
    const today = new Date();
    this.startDate = this.filter.startdate || new Date(today.getFullYear(), today.getMonth() - 5, today.getDate());
    this.endDate = this.filter.enddate || today;

    const colRef = collection(this.firestoreDefault, 'aggregate_participant_timeline');
    const q = query(colRef, where('activitylist', 'array-contains-any', ['saleupgraded', 'saledowngraded', 'salecancelled']));
    getDocs(q).then(updown => {
      this.saleUpgradedCounts = {};
      this.saleDowngradedCounts = {};

      updown.docs.forEach(doc => {
        const updowndata = doc.data();
        if (!updowndata['monthstart'] || !updowndata['monthend']) return;
        const monthStart = updowndata['monthstart'].toDate();
        const monthEnd = updowndata['monthend'].toDate();

        if (monthStart >= this.startDate && monthEnd <= this.endDate) {
          const monthYearKey = this.monthYearFormat(monthStart);
          const profileId = updowndata['profileid'];

          if (updowndata['activitylist'].includes('saledowngraded') || updowndata['activitylist'].includes('salecancelled')) {
            if (!this.saleDowngradedCounts[monthYearKey]) {
              this.saleDowngradedCounts[monthYearKey] = { key: monthYearKey, value: 0, profiles: [] };
            }
            this.saleDowngradedCounts[monthYearKey].value += 1;
            if (profileId && !this.saleDowngradedCounts[monthYearKey].profiles.includes(profileId)) {
              this.saleDowngradedCounts[monthYearKey].profiles.push(profileId);
            }
          }

          if (updowndata['activitylist'].includes('saleupgraded')) {
            if (!this.saleUpgradedCounts[monthYearKey]) {
              this.saleUpgradedCounts[monthYearKey] = { key: monthYearKey, value: 0, profiles: [] };
            }
            this.saleUpgradedCounts[monthYearKey].value += 1;
            if (profileId && !this.saleUpgradedCounts[monthYearKey].profiles.includes(profileId)) {
              this.saleUpgradedCounts[monthYearKey].profiles.push(profileId);
            }
          }
        }
      });

      // console.log("Sale Upgraded Counts:", this.saleUpgradedCounts);
      // console.log("Sale Downgraded Counts:", this.saleDowngradedCounts);
    });
  }

  compareMonthYear = (a: any, b: any) => {
    const dateA = new Date(Date.parse(`${a.key} 1`));
    const dateB = new Date(Date.parse(`${b.key} 1`));
    return dateA.getTime() - dateB.getTime();
  };

  monthYearFormat(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }

  compareByValueDesc(a: KeyValue<string, number>, b: KeyValue<string, number>): number {
    return b.value - a.value;
  }

  compareByValueLengthDesc(a: KeyValue<string, any>, b: KeyValue<string, any>): number {
    return b.value.length - a.value.length;
  }

  compareByKeyDesc(a: KeyValue<string, number>, b: KeyValue<string, number>): number {
    const order = ['100%', '75%', '50%', '25%', '0%'];
    return order.indexOf(a.key) - order.indexOf(b.key);
  }

  getAtcAlpha() {
    const today = new Date();
    const monthsfive = new Date(today.getFullYear(), today.getMonth() - 5, today.getDate());
    const startDate = this.filter.startdate ? Timestamp.fromDate(new Date(this.filter.startdate)) : monthsfive;
    const endDate = this.filter.enddate ? Timestamp.fromDate(new Date(this.filter.enddate)) : today;

    if (startDate && endDate) {
      const firestoreATC = getFirestore("firestore-atc")
      const colRef = collection(firestoreATC, 'atc_alpha');
      const q = query(
        colRef,
        where('isdelete', '==', false),
        where('prescription_date', '>=', startDate),
        where('prescription_date', '<=', endDate)
      );
      getDocs(q).then(getalpha => {
        this.totalAdjustmentsCompleted = 0;
        this.evolutionYearSaved = 0;
        this.evolutionYearWasted = 0;
        this.totalAdjustmentAware = 0;
        this.totalAdjustmentUnAware = 0;
        this.extendedLifeImpactTotal = 0;
        this.extendedLifeImpactMap = {};
        this.evolutionprogressCount = 0;
        this.evolutionprogressMap = {};
        this.productCountMap = {};
        this.totalATC = {};
        this.percentageCompleted = 0;
        this.percentageOngoing = 0;
        this.totalProductCount = 0;
        this.totalAdjustmentUnAwareMap = { count: 0, profileIds: [], profileIdWiseCount: {} };
        this.totalAdjustmentAwareMap = { count: 0, profileIds: [], profileIdWiseCount: {} };
        this.evolutionYearWastedMap = { count: 0, profileIds: [], profileIdWiseCount: {} };
        this.evolutionYearSavedMap = { count: 0, profileIds: [], profileIdWiseCount: {} };
        this.totalAdjustmentsCompletedMap = { count: 0, profileIds: [], profileIdWiseCount: {} };
        this.adjustmentCompletedMap = {
          '0%': { count: 0, profileIds: [] },
          '25%': { count: 0, profileIds: [] },
          '50%': { count: 0, profileIds: [] },
          '75%': { count: 0, profileIds: [] },
          '100%': { count: 0, profileIds: [] }
        };

        getalpha.docs.forEach(doc => {
          // console.log("runnn");
          const atcData = doc.data();
          if (atcData && atcData != null) {
            // this.totalATC = getalpha.docs.length;
            const docCount = getalpha.docs.length;
            this.totalATCKey = docCount;
            const profileId = atcData['profileid'];
            if (!this.totalATC[docCount]) {
              this.totalATC[docCount] = [];
            }
            if (profileId && !this.totalATC[docCount].includes(profileId)) {
              this.totalATC[docCount].push(profileId);
            }

            const totalAdjustments = atcData['totaladjustment'] || 0;
            const totalAdjustmentsCompleted = atcData['totaladjustmentcompleted'] || 0;
            const totalAdjustmentsPending = atcData['totaladjustmentpending'] || 0;
            const percentageCompleted = totalAdjustments > 0 ? (totalAdjustmentsCompleted / totalAdjustments) * 100 : 0;

            if (percentageCompleted >= 75) {
              this.percentageCompleted += 1;
            } else {
              this.percentageOngoing += 1;
            }

            if (percentageCompleted === 0) {
              // this.adjustmentCompletedMap['0%']++;
              this.adjustmentCompletedMap['0%'].count++;
              if (profileId && !this.adjustmentCompletedMap['0%'].profileIds.includes(profileId)) {
                this.adjustmentCompletedMap['0%'].profileIds.push(profileId);
              }
            } else if (percentageCompleted <= 25) {
              this.adjustmentCompletedMap['25%'].count++;
              if (profileId && !this.adjustmentCompletedMap['25%'].profileIds.includes(profileId)) {
                this.adjustmentCompletedMap['25%'].profileIds.push(profileId);
              }
            } else if (percentageCompleted <= 50) {
              this.adjustmentCompletedMap['50%'].count++;
              if (profileId && !this.adjustmentCompletedMap['50%'].profileIds.includes(profileId)) {
                this.adjustmentCompletedMap['50%'].profileIds.push(profileId);
              }
            } else if (percentageCompleted <= 75) {
              this.adjustmentCompletedMap['75%'].count++;
              if (profileId && !this.adjustmentCompletedMap['75%'].profileIds.includes(profileId)) {
                this.adjustmentCompletedMap['75%'].profileIds.push(profileId);
              }
            } else {
              this.adjustmentCompletedMap['100%'].count++;
              if (profileId && !this.adjustmentCompletedMap['100%'].profileIds.includes(profileId)) {
                this.adjustmentCompletedMap['100%'].profileIds.push(profileId);
              }
            }

            // if (percentageCompleted >= 75) {
            //   this.percentageCompleted += 1;
            //   // Ensure profileId is pushed to the correct percentage group (100%)
            //   if (!this.adjustmentCompletedMap['100%']) {
            //     this.adjustmentCompletedMap['100%'] = [];
            //   }
            //   if (profileId && !this.adjustmentCompletedMap['100%'].includes(profileId)) {
            //     this.adjustmentCompletedMap['100%'].push(profileId);
            //   }
            // } else {
            //   this.percentageOngoing += 1;
            //   if (percentageCompleted === 0) {
            //     if (!this.adjustmentCompletedMap['0%']) {
            //       this.adjustmentCompletedMap['0%'] = [];
            //     }
            //     this.adjustmentCompletedMap['0%'].push(profileId);
            //   } else if (percentageCompleted <= 25) {
            //     if (!this.adjustmentCompletedMap['25%']) {
            //       this.adjustmentCompletedMap['25%'] = [];
            //     }
            //     this.adjustmentCompletedMap['25%'].push(profileId);
            //   } else if (percentageCompleted <= 50) {
            //     if (!this.adjustmentCompletedMap['50%']) {
            //       this.adjustmentCompletedMap['50%'] = [];
            //     }
            //     this.adjustmentCompletedMap['50%'].push(profileId);
            //   } else if (percentageCompleted <= 75) {
            //     if (!this.adjustmentCompletedMap['75%']) {
            //       this.adjustmentCompletedMap['75%'] = [];
            //     }
            //     this.adjustmentCompletedMap['75%'].push(profileId);
            //   }
            // }
          }

          // if (atcData['totaladjustment'] && atcData['totaladjustment'] != null) {
          //   this.totalAdjustmentsCompleted += atcData['totaladjustment'];
          //   const profileId = atcData['profileid'];
          //   this.totalAdjustmentsCompletedMap['count'] = this.totalAdjustmentsCompleted;
          //   if (profileId && !this.totalAdjustmentsCompletedMap['profileIds'].includes(profileId)) {
          //     this.totalAdjustmentsCompletedMap['profileIds'].push(profileId);
          //   }
          // }
          if (atcData['totaladjustment'] && atcData['totaladjustment'] != null) {
            const adjSavedCount = atcData['totaladjustment'];
            const profileId = atcData['profileid'];
            this.totalAdjustmentsCompleted += adjSavedCount;
            this.totalAdjustmentsCompletedMap['count'] = this.totalAdjustmentsCompleted;
            if (profileId && !this.totalAdjustmentsCompletedMap['profileIds'].includes(profileId)) {
              this.totalAdjustmentsCompletedMap['profileIds'].push(profileId);
            }
            if (!this.totalAdjustmentsCompletedMap['profileIdWiseCount'][profileId]) {
              this.totalAdjustmentsCompletedMap['profileIdWiseCount'][profileId] = 0;
            }
            this.totalAdjustmentsCompletedMap['profileIdWiseCount'][profileId] += adjSavedCount;
          }

          // if (atcData['evolutionyearsaved'] && atcData['evolutionyearsaved']!=null) {
          //   this.evolutionYearSaved += atcData['evolutionyearsaved'];
          //   const profileId = atcData['profileid'];
          //   this.evolutionYearSavedMap['count'] = this.evolutionYearSaved;
          //   if (profileId && !this.evolutionYearSavedMap['profileIds'].includes(profileId)) {
          //     this.evolutionYearSavedMap['profileIds'].push(profileId);
          //   }
          // }
          if (atcData['evolutionyearsaved'] && atcData['evolutionyearsaved'] != null) {
            const savedAmount = atcData['evolutionyearsaved'];
            const profileId = atcData['profileid'];
            this.evolutionYearSaved += savedAmount;
            this.evolutionYearSavedMap['count'] = this.evolutionYearSaved;
            if (profileId && !this.evolutionYearSavedMap['profileIds'].includes(profileId)) {
              this.evolutionYearSavedMap['profileIds'].push(profileId);
            }
            if (!this.evolutionYearSavedMap['profileIdWiseCount'][profileId]) {
              this.evolutionYearSavedMap['profileIdWiseCount'][profileId] = 0;
            }
            this.evolutionYearSavedMap['profileIdWiseCount'][profileId] += savedAmount;
          }

          if (atcData['evolutionyearwasted'] && atcData['evolutionyearwasted'] != null) {
            const wastedAmount = atcData['evolutionyearwasted'];
            const profileId = atcData['profileid'];
            this.evolutionYearWasted += wastedAmount;
            this.evolutionYearWastedMap['count'] = this.evolutionYearWasted;
            if (profileId && !this.evolutionYearWastedMap['profileIds'].includes(profileId)) {
              this.evolutionYearWastedMap['profileIds'].push(profileId);
            }
            if (!this.evolutionYearWastedMap['profileIdWiseCount'][profileId]) {
              this.evolutionYearWastedMap['profileIdWiseCount'][profileId] = 0;
            }
            this.evolutionYearWastedMap['profileIdWiseCount'][profileId] += wastedAmount;
            // console.log(this.evolutionYearWastedMap,'evolutionYearWastedMapevolutionYearWastedMap');
          }

          // if (atcData['evolutionyearwasted'] && atcData['evolutionyearwasted']!=null) {
          //   this.evolutionYearWasted += atcData['evolutionyearwasted'];
          //   const profileId = atcData['profileid'];
          //   this.evolutionYearWastedMap['count'] = this.evolutionYearWasted;
          //   if (profileId && !this.evolutionYearWastedMap['profileIds'].includes(profileId)) {
          //     this.evolutionYearWastedMap['profileIds'].push(profileId);
          //   }
          //   console.log(this.evolutionYearWastedMap,'evolutionYearWastedMapevolutionYearWastedMap');
          // }

          // if (atcData['totaladjustmentaware'] && atcData['totaladjustmentaware']!=null) {
          //   this.totalAdjustmentAware += atcData['totaladjustmentaware'];
          //   const profileId = atcData['profileid'];
          //   this.totalAdjustmentAwareMap['count'] = this.totalAdjustmentAware;
          //   if (profileId && !this.totalAdjustmentAwareMap['profileIds'].includes(profileId)) {
          //     this.totalAdjustmentAwareMap['profileIds'].push(profileId);
          //   }
          // }
          if (atcData['totaladjustmentaware'] && atcData['totaladjustmentaware'] != null) {
            const awareCount = atcData['totaladjustmentaware'];
            const profileId = atcData['profileid'];
            this.totalAdjustmentAware += awareCount;
            this.totalAdjustmentAwareMap['count'] = this.totalAdjustmentAware;
            if (profileId && !this.totalAdjustmentAwareMap['profileIds'].includes(profileId)) {
              this.totalAdjustmentAwareMap['profileIds'].push(profileId);
            }
            if (!this.totalAdjustmentAwareMap['profileIdWiseCount'][profileId]) {
              this.totalAdjustmentAwareMap['profileIdWiseCount'][profileId] = 0;
            }
            this.totalAdjustmentAwareMap['profileIdWiseCount'][profileId] += awareCount;
          }

          // if (atcData['totaladjustmentunaware'] && atcData['totaladjustmentunaware']!=null) {
          //   this.totalAdjustmentUnAware += atcData['totaladjustmentunaware'];
          //   const profileId = atcData['profileid'];
          //   this.totalAdjustmentUnAwareMap['count'] = this.totalAdjustmentUnAware;
          //   if (profileId && !this.totalAdjustmentUnAwareMap['profileIds'].includes(profileId)) {
          //     this.totalAdjustmentUnAwareMap['profileIds'].push(profileId);
          //   }
          // }
          if (atcData['totaladjustmentunaware'] && atcData['totaladjustmentunaware'] != null) {
            const unAwareCount = atcData['totaladjustmentunaware'];
            const profileId = atcData['profileid'];
            this.totalAdjustmentUnAware += unAwareCount;
            this.totalAdjustmentUnAwareMap['count'] = this.totalAdjustmentUnAware;
            if (profileId && !this.totalAdjustmentUnAwareMap['profileIds'].includes(profileId)) {
              this.totalAdjustmentUnAwareMap['profileIds'].push(profileId);
            }
            if (!this.totalAdjustmentUnAwareMap['profileIdWiseCount'][profileId]) {
              this.totalAdjustmentUnAwareMap['profileIdWiseCount'][profileId] = 0;
            }
            this.totalAdjustmentUnAwareMap['profileIdWiseCount'][profileId] += unAwareCount;
          }

          if (atcData['product'] && atcData['product'] != null) {
            const product = atcData['product'];
            const profileId = atcData['profileid'];
            if (!this.productCountMap[product]) {
              this.productCountMap[product] = [];
            }
            if (profileId) {
              this.productCountMap[product].push(profileId);
            }
            this.totalProductCount += 1;
          }

          if (atcData['extendedlifeimpact'] && atcData['extendedlifeimpact'] != null) {
            Object.entries(atcData['extendedlifeimpact']).forEach(([key, value]) => {
              this.extendedLifeImpactTotal += value as number;
              this.extendedLifeImpactMap[key] = (this.extendedLifeImpactMap[key] || 0) + value;
            });
          }

          if (atcData['evolutionprogress'] && atcData['evolutionprogress'] != null) {
            Object.entries(atcData['evolutionprogress']).forEach(([key, value]) => {
              this.evolutionprogressCount += value as number;
              this.evolutionprogressMap[key] = (this.evolutionprogressMap[key] || 0) + value;
            });
          }
        });
      });
    }
  }

  scrollToExtendedLifeImpact() {
    const element = document.getElementById('extended-life-content');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('highlight2');
      setTimeout(() => {
        element.classList.remove('highlight2');
      }, 2000);
    }
  }

  onFilter() {
    this.getUpgradesDowngrades();
    this.getAtcAlpha();
    this.filterDataByDateRange();
  }

  getEvents() {
    this.loading = true;
    this.eventProfiles = {};
    this.eventNames = [];
    let allData: any[] = [];

    const colRef = collection(this.firestoreDefault, 'event collection');
    const q = query(colRef, where('atcmodel', '==', 'uP!'));
    getDocs(q).then(eventCollection => {
      eventCollection.docs.forEach(e => {
        let ele = e.data();
        ele['ref'] = e.ref;
        allData.push(ele);
      });

      allData.sort((a, b) => a['start_date'].toDate() - b['start_date'].toDate());
        let previousStartDates: any[] = [];
        let processedEvents = 0;
        let skippedEvents = 0;

        allData.forEach(arenaEventcol => {
        const EventCollc = arenaEventcol;

        if (!EventCollc['start_date']) {
            skippedEvents++;
            return;
        }

        const startDate = EventCollc['start_date'].toDate();
        const eventname = EventCollc['name'];

        if (eventname.startsWith('Mega')) {
            skippedEvents++;
            return;
        }

        if (!this.eventProfiles[eventname]) {
          this.eventProfiles[eventname] = {
            profileData: new Set(),
            startDate: startDate,
            previousStartDateCounts: {},
            previousStartDates: [...previousStartDates],
            totalOldCount: 0,
            newProfiles: [],
            oldProfiles: {}
          };
          this.eventNames.push(eventname);
        }

        const eventRefId = arenaEventcol['ref'];
        // this.firestoreDefault.collection('events_profiles', ref => ref.where('event_ref', '==', eventRefId)).get().toPromise().then(profileSnapshot => {
        const epColRef = collection(this.firestoreDefault, 'event participation request');
        const epQuery = query(epColRef, where('eventref', '==', eventRefId), where('status', '==', 'attended'));
        getDocs(epQuery).then(profileSnapshot => {
          profileSnapshot.docs.forEach(profileDoc => {
            const profileid = profileDoc.data()['profileid'];
            this.eventProfiles[eventname].profileData.add(profileid);
          });

          this.eventProfiles[eventname].profileData = Array.from(this.eventProfiles[eventname].profileData);
          let totalOldCount = 0;
          let excludedParticipants: any[] = [];

          previousStartDates.forEach((previousDate, previousIndex) => {
            const previousEventName = this.eventNames[previousIndex];
            if (previousEventName && this.eventProfiles[previousEventName]) {
              const previousProfiles = this.eventProfiles[previousEventName].profileData;
              const currentEventProfiles = this.eventProfiles[eventname].profileData.filter((participant: any) => !excludedParticipants.includes(participant));
              const commonProfiles = currentEventProfiles.filter((profile: any) => previousProfiles.includes(profile));
              const count = commonProfiles.length;
              this.eventProfiles[eventname].previousStartDateCounts[previousDate] = count;
              excludedParticipants.push(...commonProfiles);
              totalOldCount += count;
              // console.log(`Event: ${eventname}, Common Participants from ${previousEventName}:`, commonProfiles);
              if (!this.eventProfiles[eventname].oldProfiles[previousDate]) {
                this.eventProfiles[eventname].oldProfiles[previousDate] = [];
              }
              this.eventProfiles[eventname].oldProfiles[previousDate].push(...commonProfiles);
            }
          });

          this.eventProfiles[eventname].newProfiles = this.eventProfiles[eventname].profileData.filter((participant: any) =>
            !((Object.values(this.eventProfiles[eventname].oldProfiles) as string[][])
              .reduce((acc, val) => acc.concat(val), [])
              .includes(participant))
          );
          this.eventProfiles[eventname].totalOldCount = totalOldCount;
          this.eventProfiles[eventname].previousStartDates = [...previousStartDates];
          previousStartDates.push(this.formatDate(startDate));
          processedEvents++;
          if (processedEvents === allData.length - skippedEvents) {
          this.loading = false;
          this.calculateLeakRetainedData();
          }
        });
      });
      // this.loading = false;
    });
    // this.calculateLeakRetainedData();
  }

  calculateLeakRetainedData() {
    // console.log("consoled");
    // console.log("consoled leaked events",this.eventNames);
    // console.log("consoled leaked profiles",this.eventProfiles);
    this.leakRetained = {};

    for (let selectedIndex = 0; selectedIndex < this.eventNames.length; selectedIndex++) {
      const eventname = this.eventNames[selectedIndex];
      let selectedProfiles = [...this.eventProfiles[eventname]?.profileData || []];

      const retainedProfiles: { [key: string]: string[] } = {};
      const leakedProfiles = new Set<string>(selectedProfiles);

      for (let i = selectedIndex + 1; i < this.eventNames.length; i++) {
        const nextEvent = this.eventNames[i];
        const nextEventProfiles = this.eventProfiles[nextEvent]?.profileData || [];
        const commonProfiles = selectedProfiles.filter((profile: any) => nextEventProfiles.includes(profile));

        if (commonProfiles.length > 0) {
          retainedProfiles[nextEvent] = commonProfiles;
        }

        commonProfiles.forEach((profile: any) => leakedProfiles.delete(profile));
        selectedProfiles = selectedProfiles.filter((profile: any) => !commonProfiles.includes(profile));
      }

      this.leakRetained[eventname] = {
        retainedprofile: retainedProfiles,
        leakedprofile: Array.from(leakedProfiles)
      };
    }
  }

  onEventClick(eventname: string) {
    this.selectedEvent = eventname;
    const selectedIndex = this.eventNames.indexOf(eventname);
    let selectedProfiles = this.eventProfiles[eventname].profileData;

    const retainedProfiles: { [key: string]: string[] } = {};
    const leakedProfiles = new Set<string>(selectedProfiles);

    for (let i = selectedIndex + 1; i < this.eventNames.length; i++) {
      const nextEvent = this.eventNames[i];
      const nextEventProfiles = this.eventProfiles[nextEvent].profileData;
      const commonProfiles = selectedProfiles.filter((profile: any) => nextEventProfiles.includes(profile));

      if (commonProfiles.length > 0) {
        retainedProfiles[nextEvent] = commonProfiles;
      }

      commonProfiles.forEach((profile: any) => leakedProfiles.delete(profile));
      selectedProfiles = selectedProfiles.filter((profile: any) => !commonProfiles.includes(profile));
    }

    this.leakRetained[eventname] = {
      retainedprofile: retainedProfiles,
      leakedprofile: Array.from(leakedProfiles) as string[]
    };

    // console.log(this.leakRetained);
  }

  leaksPrint(selectedEvent: string) {
    const confirmDownload = confirm('Are you sure you want to download the leaked and retained content from the' + selectedEvent + '?');
    if (confirmDownload) {
      console.log('Selected event:', selectedEvent);
      const retainedData = this.leakRetained[selectedEvent]?.retainedprofile;
      const leakedData = this.leakRetained[selectedEvent]?.leakedprofile;

      let retainedHeaders = Object.keys(retainedData || {});
      let headerRow = [selectedEvent];
      if (retainedHeaders.length > 0) {
        headerRow.push(...retainedHeaders);
        headerRow.push('Leaked Participants');
      } else {
        headerRow.push('Leaked Participants');
      }

      let csvContent = headerRow.join(',') + '\n';
      const maxLength = Math.max(
        ...Object.values(retainedData || {}).map((profiles: any) => profiles.length),
        leakedData?.length || 0,
        this.eventProfiles[selectedEvent]?.profileData?.length || 0
      );

      for (let i = 0; i < maxLength; i++) {
        let row: any[] = [];
        const selectedEventProfiles = this.eventProfiles[selectedEvent]?.profileData || [];
        row.push(i < selectedEventProfiles.length ? this.mapProfile[selectedEventProfiles[i]] || selectedEventProfiles[i] : '');
        if (retainedHeaders.length > 0) {
          retainedHeaders.forEach(eventName => {
            const profiles = retainedData?.[eventName] || [];
            row.push(profiles[i] ? this.mapProfile[profiles[i]] || profiles[i] : '');
          });
        }
        row.push(leakedData && i < leakedData.length ?
          this.mapProfile[leakedData[i]] || leakedData[i] : '');
        csvContent += row.join(',') + '\n';
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${selectedEvent}_participants.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  //
  // onEventClick(eventname) {
  //   console.log("eventname",eventname);
  //   console.log("this.eventNames",this.eventNames);
  //   console.log("eventnameprofileData;",this.eventProfiles[eventname].profileData);

  //   this.selectedEvent = eventname;
  //   const eventIndex = this.eventNames.indexOf(eventname);
  //   let n = 0
  //   for (const key of this.eventNames) {
  //    if(n > eventIndex){
  //     const currentEventProfiles = this.eventProfiles[eventname].profileData;

  //     // Initialize retain and leak counts for the selected event
  //     let totalRetainCount = 0;
  //     let totalLeakCount = 0;

  //     // Iterate over all previous events
  //     // for (let i = 0; i < eventIndex; i++) {
  //       const previousEventName = key;
  //       const previousProfiles = this.eventProfiles[previousEventName].profileData;
  //       // console.log("previousEventName",previousEventName);
  //       // console.log("previousProfiles",previousProfiles);

  //       // Find retained profiles from each previous event in the current event
  //       const commonProfiles = currentEventProfiles.filter(profile => previousProfiles.includes(profile));
  //       this.eventProfiles[key]['retaincount'] = commonProfiles;
  //       // console.log(this.eventProfiles[key]['leakcount'] = commonProfiles,'Retained Console');

  //       // Find leaked profiles from each previous event in the current event
  //       const leakProfiles = previousProfiles.filter(profile => !currentEventProfiles.includes(profile));
  //       this.eventProfiles[key]['leakcount'] = leakProfiles;
  //       // console.log(this.eventProfiles[key]['leakcount'] = leakProfiles,'Leaked Console');
  //     // }
  //    }else{
  //        // If there is no previous event, initialize counts to zero
  //     this.eventProfiles[key]['retaincount'] = 0;
  //     this.eventProfiles[key]['leakcount'] = this.eventProfiles[key].profileData.length;
  //     console.log(this.eventProfiles[key]['retaincount'], 'retaincount');
  //     console.log(this.eventProfiles[key]['leakcount'], 'leakcount');
  //    }
  //    n++
  //   }
  //   console.log(eventIndex);

  //   // // Ensure there's a previous event to compare
  //   // if (eventIndex > 0) {
  //   //   const currentEventProfiles = this.eventProfiles[eventname].profileData;

  //   //   // Initialize retain and leak counts for the selected event
  //   //   let totalRetainCount = 0;
  //   //   let totalLeakCount = 0;

  //   //   // Iterate over all previous events
  //   //   for (let i = 0; i < eventIndex; i++) {
  //   //     const previousEventName = this.eventNames[i];
  //   //     const previousProfiles = this.eventProfiles[previousEventName].profileData;

  //   //     // Find retained profiles from each previous event in the current event
  //   //     const commonProfiles = currentEventProfiles.filter(profile => previousProfiles.includes(profile));
  //   //     this.eventProfiles[eventname]['retaincount'] = commonProfiles;

  //   //     // Find leaked profiles from each previous event in the current event
  //   //     const leakProfiles = previousProfiles.filter(profile => !currentEventProfiles.includes(profile));
  //   //     this.eventProfiles[eventname]['leakcount'] = leakProfiles;
  //   //     console.log(`Compared with ${previousEventName}:`);
  //   //   }

  //   // } else {
  //   //   // If there is no previous event, initialize counts to zero
  //   //   this.eventProfiles[eventname]['retaincount'] = 0;
  //   //   this.eventProfiles[eventname]['leakcount'] = this.eventProfiles[eventname].profileData.length;
  //   //   console.log(this.eventProfiles[eventname]['retaincount'], 'retaincount');
  //   //   console.log(this.eventProfiles[eventname]['leakcount'], 'leakcount');
  //   // }
  // }



  //   getEvents() {
  //     this.loading = true;
  //     let allData = [];
  //     this.eventProfiles = {};
  //     this.eventNames = [];

  //     // Define your attendance pattern here. Example: attend 1st, skip 2nd, attend 3rd.
  //     const attendancePattern = [1, -1, 1]; // 1 = attend, -1 = skip
  //     let patternIndex = 0;

  //     this.firestoreDefault.collection('event collection', ref => ref.where('atcmodel', '==', 'uP!'))
  //         .get().toPromise().then(eventCollection => {
  //             eventCollection.docs.forEach(e => {
  //                 let ele = e.data();
  //                 ele['ref'] = e.ref;
  //                 allData.push(ele);
  //             });

  //             // Sort events by start date
  //             allData.sort((a, b) => a['start_date'].toDate() - b['start_date'].toDate());
  //             let previousStartDates = [];

  //             allData.forEach((arenaEventcol, index) => {
  //                 const eventname = arenaEventcol['name'];
  //                 const startDate = arenaEventcol['start_date'].toDate();

  //                 // Skip Mega events
  //                 if (eventname.startsWith("Mega")) return;

  //                 if (!this.eventProfiles[eventname]) {
  //                     this.eventProfiles[eventname] = {
  //                         profileData: new Set(),
  //                         startDate,
  //                         attendancePatternCount: 0,
  //                         oldProfiles: {},
  //                     };
  //                     this.eventNames.push(eventname);
  //                 }

  //                 // Check if the event aligns with the attendance pattern
  //                 const shouldAttend = attendancePattern[patternIndex] === 1;
  //                 if (shouldAttend) {
  //                     // Fetch profiles attending this event
  //                     const eventRefId = arenaEventcol['ref'];
  //                     this.firestoreDefault.collection('events_profiles', ref => ref.where('event_ref', '==', eventRefId))
  //                         .get().toPromise().then(profileSnapshot => {
  //                             profileSnapshot.docs.forEach(profileDoc => {
  //                                 const profileId = profileDoc.data()['profile_ref'].id;
  //                                 this.eventProfiles[eventname].profileData.add(profileId);
  //                             });

  //                             this.eventProfiles[eventname].profileData = Array.from(this.eventProfiles[eventname].profileData);

  //                             // Count profiles attending according to the pattern
  //                             let excludedParticipants = [];
  //                             let totalCount = 0;

  //                             previousStartDates.forEach((previousDate, previousIndex) => {
  //                                 const previousEventName = this.eventNames[previousIndex];
  //                                 if (previousEventName && this.eventProfiles[previousEventName]) {
  //                                     const previousProfiles = this.eventProfiles[previousEventName].profileData;
  //                                     const currentEventProfiles = this.eventProfiles[eventname].profileData.filter(
  //                                         participant => !excludedParticipants.includes(participant)
  //                                     );
  //                                     const commonProfiles = currentEventProfiles.filter(profile => previousProfiles.includes(profile));
  //                                     const count = commonProfiles.length;

  //                                     this.eventProfiles[eventname].oldProfiles[previousDate] = commonProfiles;
  //                                     excludedParticipants.push(...commonProfiles);
  //                                     totalCount += count;
  //                                 }
  //                             });

  //                             // Store the pattern count
  //                             this.eventProfiles[eventname].attendancePatternCount = totalCount;
  //                             previousStartDates.push(this.formatDate(startDate));
  //                         });
  //                 }

  //                 // Move to the next step in the pattern
  //                 patternIndex = (patternIndex + 1) % attendancePattern.length;
  //             });

  //             this.loading = false;
  //         });
  // }
}