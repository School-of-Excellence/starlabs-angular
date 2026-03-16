import { Component, OnInit } from '@angular/core';
import { collection, Firestore, getDocs, setDoc , Timestamp } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Storage } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { Router } from '@angular/router';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';


@Component({
  selector: 'app-new-profile',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatProgressBarModule,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatDatepickerModule,
    MatRadioModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSelectModule,
    
  ],
  templateUrl: './new-profile.component.html',
  styleUrl: './new-profile.component.css'
})
export class NewProfileComponent {
  mapProfile = {};
  mapPhone = {};
  mapEmail = {}
  mapJourney = {}
  selectedSortOption: string;
  selectedEngagementCategory: string = 'ActiveOnly';
  loggedInProfileId:any = null
  selectedProfileIdsForMonth: string[] = [];
  originalEngagementProfileIds: string[] = [];
  selectedEngagement: string | null = null; 
  selectedEngagementProfileIds: string[] = [];
  selectedDate: Date = new Date(); 
  lastMonth: Date;
  loading = false;
  lastMonthCount: { count: number, profileIds: string[] } = { count: 0, profileIds: [] };
  currentMonthCount: { count: number, profileIds: string[] } = { count: 0, profileIds: [] };
  nextMonthCount: { count: number, profileIds: string[] } = { count: 0, profileIds: [] };  
  currentMonth: Date;
  nextMonth: Date;  
  participants = [];
  engagementLevel = {
    "average" : [],
    "minimal" : [],
    "optimal" : [],
    "disappear" : [],
    "superoptimal" : [],
  }
  formattedDate: string;
  searchTerm: string = '';
  filteredProfiles: { id: string; name: string }[] = []; 
  selectedMonthForSubscription;
  // selectedEngagement;
  selectedactivesubscriptionendProfile
  checkedValues: string[] = [];
  selectedJourneysProfileIds = [];
  subsEndMap: { [key: string]: string } = {};
  financialStatusMap: { [key: string]: string } = {};
  subscriptionEndMap: { [key: string]: Date } = {};
  customerStatusMap: { [key: string]: string } = {};
  activeJourneyMap: { [key: string]: string } = {};
  lastJourneyMap: { [key: string]: string } = {};
  hoveredProfileId: string | null = null;
  originalJourneyData: { [key: string]: any } = {};
  activesubscriptionendProfileIds = []
  originalJourneyCount: { [key: string]: { count: number, profileIds: string[] } } = {};
  originalActiveJourneyCount: { [key: string]: { count: number, profileIds: string[] } } = {};
  originalLastJourneyCount: { [key: string]: { count: number, profileIds: string[] } } = {};
  activesubscriptionend = false;
  selectedActiveJourneys: string[] = [];
  uniqueActiveJourneys: string[] = [];
  subscriptionData = [
    {
      type: "Active subscription",
      activeCount: [],
      // Regular: 0,
      // Defaulted: 0,
      // Locked: 0,
      // Banned : 0,
      // Late : 0,
      // Discontinued : 0,
      // Undefined : 0,
      Regular: [],
      Defaulted: [],
      Locked: [],
      Banned : [],
      Late : [],
      Discontinued : [],
      Undefined : [],
      profileIds:[],
      // journey:[],
      // journeyCount : {},
      activeJourney:[],
      lastJourney:[],
      lastJourneyCount : {},
      activeJourneyCount : {},
    },
    {
      type: "Non-Active Subscription End",
      activeCount: [],
      // Regular: 0,
      // Defaulted: 0,
      // Locked: 0,
      // Banned : 0,
      // Late : 0,
      // Discontinued : 0,
      // Undefined : 0,
      Regular: [],
      Defaulted: [],
      Locked: [],
      Banned : [],
      Late : [],
      Discontinued : [],
      Undefined : [],
      profileIds:[],
      // journey:[],
      // journeyCount : {},
      activeJourney:[],
      lastJourney:[],
      lastJourneyCount : {},
      activeJourneyCount : {},

    },
    {
      type: "Discontinued Participants",
      activeCount: [],
      // Regular: 0,
      // Defaulted: 0,
      // Locked: 0,
      // Banned : 0,
      // Late : 0,
      // Discontinued : 0,
      // Undefined : 0,
      Regular: [],
      Defaulted: [],
      Locked: [],
      Banned : [],
      Late : [],
      Discontinued : [],
      Undefined : [],
      profileIds:[],
      journey:[],
      journeyCount : {},
    },
   
    
    {
      type: "All Participant",
      activeCount: [],
      // Regular: 0,
      // Defaulted: 0,
      // Locked: 0,
      // Banned : 0,
      // Late : 0,
      // Discontinued : 0,
      // Undefined : 0,
      Regular: [],
      Defaulted: [],
      Locked: [],
      Banned : [],
      Late : [],
      Discontinued : [],
      Undefined : [],
      profileIds:[],
      journey:[],
      journeyCount : {},
      activeJourney:[],
      lastJourney:[],
      lastJourneyCount : {},
      activeJourneyCount : {},
    }
  ];
  selectedCard: any;
  selectedProfileIds: string[] = [];
  selectedProfileIdsDiscontinued: string[] = [];
  selectedProfileIdsactivesubEnd : string[] = [];
  selectedProfileIdsForEndSubs: string[] = [];

  onProfileIdChecked(event: MatCheckboxChange, profileId: string) {
    if (event.checked) {
      this.selectedProfileIds.push(profileId);
    } else {
      this.selectedProfileIds = this.selectedProfileIds.filter(id => id !== profileId);
    }
  }
  onProfileIdCheckedEndSubs(event: MatCheckboxChange, profileId: string) {
    if (event.checked) {
      this.selectedProfileIdsForEndSubs.push(profileId);
    } else {
      this.selectedProfileIdsForEndSubs = this.selectedProfileIdsForEndSubs.filter(id => id !== profileId);
    }
    // console.log(this.selectedProfileIdsForEndSubs);
    
  }
  onProfileIdCheckedDiscontinued(event: MatCheckboxChange, profileId: string) {
    if (event.checked) {
      this.selectedProfileIdsDiscontinued.push(profileId);
    } else {
      this.selectedProfileIdsDiscontinued = this.selectedProfileIdsDiscontinued.filter(id => id !== profileId);
    }    
  }

  onProfileIdCheckedactivesubEnd(event: MatCheckboxChange, profileId: string) {
    if (event.checked) {
      this.selectedProfileIdsactivesubEnd.push(profileId);
    } else {
      this.selectedProfileIdsactivesubEnd = this.selectedProfileIdsactivesubEnd.filter(id => id !== profileId);
    }    
  }
  selectAllProfileIds(event: MatCheckboxChange) {
    if (event.checked) {
      this.selectedProfileIds = [...this.selectedJourneysProfileIds];
    } else {
      this.selectedProfileIds = [];
    }
  }
  selectAllProfileIdsDiscontinued(event: MatCheckboxChange) {
    if (event.checked) {
      this.selectedProfileIdsDiscontinued = [...this.selectedCard.profileIds];
    } else {
      this.selectedProfileIdsDiscontinued = [];
    }
  }
  selectAllProfileIdsactivesubEnd(event: MatCheckboxChange) {
    if (event.checked) {
      this.selectedProfileIdsactivesubEnd = [...this.selectedCard.profileIds];
    } else {
      this.selectedProfileIdsactivesubEnd = [];
    }
  }
  selectAllProfileIdsEndSubs(event: MatCheckboxChange) {
    if (event.checked) {
      this.selectedProfileIdsForEndSubs = [...this.selectedProfileIdsForMonth];
    } else {
      this.selectedProfileIdsForEndSubs = [];
    }
    // console.log(this.selectedProfileIdsForEndSubs);
    
  }
  clearCheckedValues() {
    this.checkedValues = [];
  }

  // selectCard(card: any) {
  //   this.selectedMonthForSubscription = null
  //   this.selectedProfileIdsForEndSubs = []
  //   this.selectedCard = card;
  //   this.originalJourneyCount = JSON.parse(JSON.stringify(this.selectedCard.journeyCount));
  //   this.selectedJourneys = [];
  //   this.selectedJourneysProfileIds = [];
  //   this.clearCheckedValues(); 
  // }
  selectCard(card: any) {
    this.selectedSortOption = null
    // Clear previously selected values
    this.selectedEngagement = null;
    this.selectedEngagementProfileIds = [];
    this.selectedMonthForSubscription = null;
    this.selectedactivesubscriptionendProfile = null;
    this.selectedProfileIdsForEndSubs = [];
    this.selectedProfileIdsDiscontinued = [];
    this.checkedValues = [];  
    this.selectedJourneys = [];
    this.selectedJourneysProfileIds = [];
    this.selectedActiveJourneys= []

    this.selectedCard = card;
    if (card.type !== 'Discontinued Participants') {
      if (this.originalJourneyData[card.type]) {
        this.selectedCard.activeJourneyCount = JSON.parse(JSON.stringify(this.originalJourneyData[card.type].activeJourneyCount));
        this.selectedCard.lastJourneyCount = JSON.parse(JSON.stringify(this.originalJourneyData[card.type].lastJourneyCount));
        this.selectedCard.activeJourney = Object.keys(this.selectedCard.activeJourneyCount);
        this.selectedCard.lastJourney = Object.keys(this.selectedCard.lastJourneyCount);
      } else {
        this.originalJourneyData[card.type] = {
          activeJourneyCount: JSON.parse(JSON.stringify(card.activeJourneyCount)),
          lastJourneyCount: JSON.parse(JSON.stringify(card.lastJourneyCount))
        };
        this.selectedCard.activeJourneyCount = card.activeJourneyCount;
        this.selectedCard.lastJourneyCount = card.lastJourneyCount;
        this.selectedCard.activeJourney = Object.keys(card.activeJourneyCount);
        this.selectedCard.lastJourney = Object.keys(card.lastJourneyCount);
      }
    }  else {
      this.selectedProfileIdsDiscontinued = [...this.selectedCard.profileIds];

    }
  }
  updateMonthLabels(): void {
    this.currentMonth = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
    this.lastMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.nextMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.lastMonthCount = { count: 0, profileIds: [] };
    this.currentMonthCount = { count: 0, profileIds: [] };
    this.nextMonthCount = { count: 0, profileIds: [] };
    const currentMonth = this.currentMonth.getMonth();
    const currentYear = this.currentMonth.getFullYear();
  
    const lastMonth = this.lastMonth.getMonth();
    const lastMonthYear = this.lastMonth.getFullYear();
    
    const nextMonth = this.nextMonth.getMonth();
    const nextMonthYear = this.nextMonth.getFullYear();
    this.participants.forEach((endSubscription)=>{
      const subscriptionEnd = endSubscription.subscriptionend;
      const customerstatus = endSubscription.customerstatus;
      const profile = endSubscription.profileid
      // console.log(profile);
      if (subscriptionEnd !== null && customerstatus != 'discontinued') {
        const subscriptionEndDate = new Date(subscriptionEnd?.seconds * 1000);
        const subscriptionEndMonth = subscriptionEndDate.getMonth();
        const subscriptionEndYear = subscriptionEndDate.getFullYear();
        if (subscriptionEndMonth === currentMonth && subscriptionEndYear === currentYear) {
          // this.currentMonthCount.count++;
          this.currentMonthCount.profileIds.push(profile);
          this.currentMonthCount.count = this.currentMonthCount.profileIds.length
        } else if (subscriptionEndMonth === lastMonth && subscriptionEndYear === lastMonthYear) {
          // this.lastMonthCount.count++;
          this.lastMonthCount.profileIds.push(profile)
          this.lastMonthCount.count = this.lastMonthCount.profileIds.length;
        } else if (subscriptionEndMonth === nextMonth && subscriptionEndYear === nextMonthYear) {
          // this.nextMonthCount.count++;
          this.nextMonthCount.profileIds.push(profile);
          this.nextMonthCount.count = this.nextMonthCount.profileIds.length
        }
      }
    });
  }
  constructor(
    public firestore: Firestore,
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,
    public router: Router,
  ) { 
    
    this.guard.getRoles().then(async roles=>{
      // if(roles["admin"] || roles["ah"]){
      //   console.log("Good")
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
      this.loggedInProfileId = roles['profile_ref'].id
    })
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.mapPhone = e.phonenumber;
      this.mapEmail =  e.email;
    });
    this.guard.getJourneyMap().then(e => {
      this.mapJourney = e
    })
    this.selectedSortOption = '';
  }

  ngOnInit(): void {
    // console.log("selectedMonthForSubscriptionselectedMonthForSubscription",this.selectedMonthForSubscription);
    
    this.selectedJourneys = [];
    this.participantDashboard();
    this.updateMonthLabels();
    this.filteredProfiles = []; 
    // this.selectedCard = this.subscriptionData[0];
    this.selectedCard = null;
    
    // this.uniqueActiveJourneys = Array.from(new Set(Object.values(this.activeJourneyMap)));
  }
  ngAfterViewInit(): void {
    this.selectedCard = null;
  }

  selectedJourneys: any;

  onJourneyChecked(event, journey, section?: string) {
    this.selectedProfileIds = [];
    this.selectedProfileIdsDiscontinued = [];
    this.selectedProfileIds = []
    this.selectedProfileIdsDiscontinued = []
    this.selectedProfileIdsactivesubEnd = []
    this.selectedProfileIdsForEndSubs = [];
    this.selectedActiveJourneys = []

    if (event === null) {
      if (this.selectedJourneys.length > 0 && this.selectedJourneys[0] === journey) {
        this.selectedJourneys = [];
        this.selectedJourneysProfileIds = [];
      } else {
        this.selectedJourneys = [journey];
        const profileIds = this.getProfileIdsBySection(journey, section);
        this.selectedJourneysProfileIds = profileIds || [];
      }
    } else {
      if (event.target.checked) {
      this.selectedJourneys = [journey];

      const profileIds = this.getProfileIdsBySection(journey, section);
      this.selectedJourneysProfileIds = profileIds || [];
    } else {
      this.selectedJourneys = [];
      this.selectedJourneysProfileIds = [];
    }
  }
}
// engagementCategoryChange(event: MatRadioChange) {
//   this.selectedEngagementCategory = event.value;
//   console.log('Selected value:', event.value);
//   console.log("selectedCategoryselectedCategory",this.selectedEngagementCategory);
// }

sortByOption(){
  console.log(this.selectedSortOption);
  // console.log(this.selectedCard.type);
  if (this.selectedSortOption === 'journeyAtoZ') {
    if (this.selectedCard && this.selectedCard.type === 'All Participant') {
      this.selectedCard.journey.sort((a: string, b: string) => a.localeCompare(b));
    } else {
      this.selectedCard.activeJourney.sort((a: string, b: string) => a.localeCompare(b));
      this.selectedCard.lastJourney.sort((a: string, b: string) => a.localeCompare(b));  
    }
  } else if (this.selectedSortOption ==='participantHighToLow') {
    if (this.selectedCard && this.selectedCard.type === 'All Participant') {
      this.selectedCard.journey.sort((a: string, b: string) => {
        const countA = this.selectedCard.journeyCount[a]?.count || 0;
        const countB = this.selectedCard.journeyCount[b]?.count || 0;
        return countB - countA;
      });  
    } else {
      this.selectedCard.activeJourney.sort((a: string, b: string) => {
        const countA = this.selectedCard.activeJourneyCount[a]?.count || 0;
        const countB = this.selectedCard.activeJourneyCount[b]?.count || 0;
        return countB - countA;
      });
      this.selectedCard.lastJourney.sort((a: string, b: string) => {
        const countA = this.selectedCard.lastJourneyCount[a]?.count || 0;
        const countB = this.selectedCard.lastJourneyCount[b]?.count || 0;
        return countB - countA;
      });  
    }
  } else if (this.selectedSortOption ==='participantLowToHigh') {
    if (this.selectedCard && this.selectedCard.type === 'All Participant') {
      this.selectedCard.journey.sort((a: string, b: string) => {
        const countA = this.selectedCard.journeyCount[a]?.count || 0;
        const countB = this.selectedCard.journeyCount[b]?.count || 0;
        return countA - countB;
      });      
    } else {
      this.selectedCard.activeJourney.sort((a: string, b: string) => {
        const countA = this.selectedCard.activeJourneyCount[a]?.count || 0;
        const countB = this.selectedCard.activeJourneyCount[b]?.count || 0;
        return countA - countB;
      });
      this.selectedCard.lastJourney.sort((a: string, b: string) => {
        const countA = this.selectedCard.lastJourneyCount[a]?.count || 0;
        const countB = this.selectedCard.lastJourneyCount[b]?.count || 0;
        return countA - countB;
      });   
    }  
  } else if (this.selectedSortOption === 'nameAtoZ') {
    if ( this.selectedCard && this.selectedCard.type === 'Discontinued Participants') {
      this.selectedProfileIdsDiscontinued.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameA.localeCompare(nameB);
      });
    } else if (this.selectedMonthForSubscription !== null) {
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameA.localeCompare(nameB);
      });
    } else if (this.selectedEngagement !== null) {
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameA.localeCompare(nameB);
      });
    } else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameA.localeCompare(nameB);
      });
    }

  } else if (this.selectedSortOption === 'nameZtoA') {
    if (this.selectedCard && this.selectedCard.type === 'Discontinued Participants') {
      this.selectedProfileIdsDiscontinued.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameB.localeCompare(nameA);
      });
    } else if (this.selectedMonthForSubscription !== null) {
      console.log("inside the name sort");
      
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameB.localeCompare(nameA);
      });
    } else if (this.selectedEngagement !== null) {
      console.log("inside the name sort");
      
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameB.localeCompare(nameA);
      });
    }
    else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const nameA = this.mapProfile[a] || ''; 
        const nameB = this.mapProfile[b] || ''; 
        return nameB.localeCompare(nameA);
      });
    }
    
  } else if (this.selectedSortOption === 'subsEarliest') {
    if (this.selectedMonthForSubscription !== null) {
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateA.getTime() - dateB.getTime();
      });
    } else if (this.selectedEngagement !== null) {
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateA.getTime() - dateB.getTime();
      });
    }
    else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateA.getTime() - dateB.getTime();
      });
    }

  } else if (this.selectedSortOption === 'subsLatest') {
    if (this.selectedMonthForSubscription !== null) {
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateB.getTime() - dateA.getTime();
      });
    } else if (this.selectedEngagement !== null) {
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateB.getTime() - dateA.getTime();
      });
    }  
    else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const dateA = new Date(this.subscriptionEndMap[a]); 
        const dateB = new Date(this.subscriptionEndMap[b]); 
        return dateB.getTime() - dateA.getTime();
      });
    }
  } else if (this.selectedSortOption === 'activeFirst') {
    if (this.selectedMonthForSubscription !== null) {
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a];
        const statusB = this.customerStatusMap[b];
        return (statusA === 'active' ? 0 : 1) - (statusB === 'active' ? 0 : 1);
      });
      
    } else if (this.selectedEngagement !== null) {
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a];
        const statusB = this.customerStatusMap[b];
        return (statusA === 'active' ? 0 : 1) - (statusB === 'active' ? 0 : 1);
      });
    }
     else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a];
        const statusB = this.customerStatusMap[b];
        return (statusA === 'active' ? 0 : 1) - (statusB === 'active' ? 0 : 1);
      });
    }

  } else if (this.selectedSortOption === 'nonactiveFirst') {
    if (this.selectedMonthForSubscription !== null) {
      this.selectedProfileIdsForMonth.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a]; 
        const statusB = this.customerStatusMap[b];
        return (statusA === 'non active' ? 0 : 1) - (statusB === 'non active' ? 0 : 1);
      });
    } else if (this.selectedEngagement !== null) {
      this.selectedEngagementProfileIds.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a]; 
        const statusB = this.customerStatusMap[b];
        return (statusA === 'non active' ? 0 : 1) - (statusB === 'non active' ? 0 : 1);
      });
    } 
    else {
      this.selectedJourneysProfileIds.sort((a: string, b: string) => {
        const statusA = this.customerStatusMap[a]; 
        const statusB = this.customerStatusMap[b];
        return (statusA === 'non active' ? 0 : 1) - (statusB === 'non active' ? 0 : 1);
      });
    }
  }
}
getProfileIdsBySection(journey: string, section?: string) {
  if (!this.selectedCard) return [];
  let journeyCount;
  switch (this.selectedCard.type) {
    case 'Active subscription':
    case 'Non-Active Subscription End':
    case 'All Participant':
    if (section === 'active') {
      journeyCount = this.selectedCard.activeJourneyCount;
    } else if (section === 'last') {
      journeyCount = this.selectedCard.lastJourneyCount;
    } else if (section === 'all') {
      journeyCount = this.selectedCard.journeyCount;
    } 
    return journeyCount?.[journey]?.profileIds || [];
    default:
    return [];
  }
}
  selectedFinancialStatuses: string[] = [];
  isSelected(journey: string, section?: string) {
    if (!this.selectedCard || this.selectedJourneys.length === 0 || this.selectedJourneys[0] !== journey) {
        return false;
    }

    const profileIds = this.getProfileIdsBySection(journey, section);
    return this.selectedJourneysProfileIds.length > 0 && 
    this.selectedJourneysProfileIds.every(profileId => profileIds.includes(profileId));
}

  onCheckboxChange(event: MatCheckboxChange, value: string) {
    if (event.checked) {
      this.checkedValues.push(value);
      this.selectedJourneys = []; 
      // this.selectedActiveJourneys = []
      this.selectedJourneysProfileIds = [];
      this.selectedFinancialStatuses.push(value);
    } else {
      this.selectedFinancialStatuses = this.selectedFinancialStatuses.filter((v) => v !== value);
      this.checkedValues = this.checkedValues.filter((v) => v !== value);
    }
    console.log('Selected Financial Statuses:', this.selectedFinancialStatuses);
    this.filterJourneyCount()
  }

  filterJourneyCount() {
    console.log("consoled again");
    
    if (this.selectedCard) {
      this.selectedProfileIdsDiscontinued = [];
      console.log("inside filter");
      
      if (this.selectedCard.type !== 'Discontinued Participants' && this.selectedCard.type !== 'All Participant') {
        console.log("except discontinue and subs end");
        
        const filteredActiveJourneyCount = {};
        const filteredLastJourneyCount = {};
        
        if (this.checkedValues.length === 0) {
          this.selectedCard.activeJourneyCount = this.originalJourneyData[this.selectedCard.type].activeJourneyCount;
          this.selectedCard.activeJourney = Object.keys(this.selectedCard.activeJourneyCount);
          this.selectedCard.lastJourneyCount = this.originalJourneyData[this.selectedCard.type].lastJourneyCount;
          this.selectedCard.lastJourney = Object.keys(this.selectedCard.lastJourneyCount);
        } else {
          this.participants.forEach((participant) => {
            const financialStatus = participant.financialstatus;
            const activeJourney = participant.activejourney;
            const lastJourney = participant.lastcompletedjourney;
      
            if (
              this.checkedValues.includes(financialStatus) &&
              (
                (this.selectedCard.type === 'Active subscription' && participant.subscriptionend && participant.subscriptionend.seconds > Timestamp.fromDate(new Date()).seconds) || 
                (this.selectedCard.type === 'Non-Active Subscription End' && participant.subscriptionend && participant.subscriptionend.seconds <= Timestamp.fromDate(new Date()).seconds)
              )
            ) {
              if (
                activeJourney &&
                (
                  this.selectedCard.type !== 'Non-Active Subscription End' ||
                  (this.selectedCard.type === 'Non-Active Subscription End' && lastJourney === null)
                )
              ) {
                if (!filteredActiveJourneyCount[activeJourney]) {
                  filteredActiveJourneyCount[activeJourney] = { count: 0, profileIds: [] };
                }
                // filteredActiveJourneyCount[activeJourney].count++;
                filteredActiveJourneyCount[activeJourney].profileIds.push(participant.profileid);
                filteredActiveJourneyCount[activeJourney].count = filteredActiveJourneyCount[activeJourney].profileIds.length
              }      
              if (lastJourney && (
                this.selectedCard.type !== 'Active subscription' ||
                (this.selectedCard.type === 'Active subscription' && activeJourney === null)
              )) {
                if (!filteredLastJourneyCount[lastJourney]) {
                  filteredLastJourneyCount[lastJourney] = { count: 0, profileIds: [] };
                }
                // filteredLastJourneyCount[lastJourney].count++;
                filteredLastJourneyCount[lastJourney].profileIds.push(participant.profileid);
                filteredLastJourneyCount[lastJourney].count = filteredLastJourneyCount[lastJourney].profileIds.length
              }
            }
          });
      
          this.selectedCard.activeJourneyCount = filteredActiveJourneyCount;
          this.selectedCard.activeJourney = Object.keys(filteredActiveJourneyCount);
          this.selectedCard.lastJourneyCount = filteredLastJourneyCount;
          this.selectedCard.lastJourney = Object.keys(filteredLastJourneyCount);
        }
      } else if (this.selectedCard.type === 'All Participant') {
        const allJourneyCount = {};        
        if (this.checkedValues.length === 0) {
            this.participants.forEach((participant) => {
                const journey = participant.activejourney || participant.lastcompletedjourney;
    
                if (journey) {
                    if (!allJourneyCount[journey]) {
                        allJourneyCount[journey] = { count: 0, profileIds: [] };
                    }
                    allJourneyCount[journey].profileIds.push(participant.profileid);
                    allJourneyCount[journey].count = allJourneyCount[journey].profileIds.length;
                }
            });
        } else {
            this.participants.forEach((participant) => {
                const financialStatus = participant.financialstatus;
                const journey = participant.activejourney || participant.lastcompletedjourney;
    
                if (this.checkedValues.includes(financialStatus) && journey) {
                    if (!allJourneyCount[journey]) {
                        allJourneyCount[journey] = { count: 0, profileIds: [] };
                    }
                    allJourneyCount[journey].profileIds.push(participant.profileid);
                    allJourneyCount[journey].count = allJourneyCount[journey].profileIds.length;
                }
            });
        }    
        this.selectedCard.journeyCount = allJourneyCount;
        this.selectedCard.journey = Object.keys(allJourneyCount);
      }else {
        console.log("discontinue filter");
        if (this.checkedValues.length === 0) {
          this.selectedProfileIdsDiscontinued = [...this.selectedCard.profileIds];
      } else {
        this.participants.forEach((participant) => {
            const financialStatus = participant.financialstatus;
            const customerStatus = participant.customerstatus;

            if (this.checkedValues.includes(financialStatus) && customerStatus === 'discontinued') {
                const profileId = participant.profileid;
                if (!this.selectedProfileIdsDiscontinued.includes(profileId)) {
                    this.selectedProfileIdsDiscontinued.push(profileId);
                }
            }
        });
      }
    }
    } 
      if (this.selectedMonthForSubscription !== null) {
        console.log("consoling in the if ", this.selectedMonthForSubscription);
        // Filter based on selected financial statuses and active journeys
        this.selectedProfileIdsForMonth = this.getProfileIdsForMonth(this.selectedMonthForSubscription)
          .filter(profileId => {
            const financialStatus = this.financialStatusMap[profileId];
            const journey = this.activeJourneyMap[profileId] || this.lastJourneyMap[profileId];            
            const financialStatusMatch = this.selectedFinancialStatuses.length === 0 || this.selectedFinancialStatuses.includes(financialStatus);
            const journeyMatch = this.selectedActiveJourneys.length === 0 || this.selectedActiveJourneys.includes(journey);
      
            return financialStatusMatch && journeyMatch;
          });
      } 
      if (this.selectedEngagement !== null) {
        console.log("inside the if");
        
        if (this.selectedActiveJourneys.length === 0 && this.checkedValues.length===0) {
          console.log("in the if");
          
          this.selectedEngagementProfileIds = [...this.originalEngagementProfileIds];
      } else {
        console.log("in the else");
          const filteredProfileIds = this.originalEngagementProfileIds.filter(profileId => {
            const financialStatus = this.financialStatusMap[profileId];
            const journey = this.activeJourneyMap[profileId] || this.lastJourneyMap[profileId];        
            const financialStatusMatch = 
            this.selectedFinancialStatuses.length === 0 || 
            this.selectedFinancialStatuses.includes(financialStatus);
            const journeyMatch = this.selectedActiveJourneys.length === 0 || this.selectedActiveJourneys.includes(journey);
        
            return financialStatusMatch && journeyMatch;
        });        
        this.selectedEngagementProfileIds = filteredProfileIds;
      
      }
    }
    
  }
  userProfile(){
    if (this.selectedCard.type === 'Discontinued Participants') {
      if (this.selectedProfileIdsDiscontinued.length > 0) {
        const profileid = this.selectedProfileIdsDiscontinued[0];
        const navigationurl = 'user profile';
        const url = `${navigationurl}/${profileid}`;
        window.open(url, '_blank'); // Open in a new tab
        // const profileid = this.selectedProfileIdsDiscontinued[0];
        // const navigationurl = 'UserProfile';
        // const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid }})
        // window.open(url.toString(), '_blank')  
      } 
    } else {
      if (this.selectedProfileIds.length > 0) {
        const profileid = this.selectedProfileIds[0]; 
        const navigationurl = 'user profile';
        const url = `${navigationurl}/${profileid}`;
        window.open(url, '_blank');
        // const profileid = this.selectedProfileIds[0]; 
        // const navigationurl = 'UserProfile';
        // const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid }})
        // window.open(url.toString(), '_blank')     
      }
    }
  }
  onProfileIdClickedSubsEnd(profileId: string) {
    const profileid = profileId; 
    if (profileid) {
      const navigationurl = 'user profile'; 
      const url = `${navigationurl}/${profileid}`; // Construct the full URL
      // this.router.navigate([navigationurl, profileid]);
      window.open(url, '_blank'); // Open in a new tab
    } else {
      alert('Profile Name Not Available');
    }
    // if (profileid) {
    //   const navigationurl = 'user profile';
    //   const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid }})
    //   window.open(url.toString(), '_blank')  
    // } else {
    //     alert('Profile Name Not Available');
    // }
  }
  onMonthClick(month: string) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    this.selectedSortOption = null
    // console.log("selectedMonthForSubscriptionselectedMonthForSubscription",this.selectedMonthForSubscription);
    this.checkedValues = []; 
    this.selectedEngagement = null;
    this.selectedEngagementProfileIds = [];
    this.selectedFinancialStatuses = []
    this.selectedProfileIdsForEndSubs = [];
    this.selectedCard = null
    this.selectedMonthForSubscription = month;
    this.selectedActiveJourneys = []
    this.selectedProfileIdsForMonth = this.getProfileIdsForMonth(month);
    // console.log(this.selectedMonthForSubscription);
    // console.log("selectedmonth ", this.selectedMonthForSubscription);

  }
  engagementLevelClick(engagement: string, level: string[]) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
  });
    this.selectedSortOption = null
    this.checkedValues = []; 
    this.selectedFinancialStatuses = [];
    this.selectedCard = null;
    this.selectedMonthForSubscription = null;
    this.selectedActiveJourneys = [];
    this.selectedEngagement = engagement;
    this.selectedEngagementProfileIds = level;
    this.originalEngagementProfileIds = [...level];
    console.log("Engagement level:", engagement, "Profile IDs:", level);
}
  getProfileIdsForMonth(month: string): string[] {
    if (month === 'Last Month') {
      return this.lastMonthCount.profileIds;
    } else if (month === 'This Month') {
      return this.currentMonthCount.profileIds;
    } else if (month === 'Next Month') {
      return this.nextMonthCount.profileIds;
    } else {
      return [];
    }
  }
  filterData() {
    this.filteredProfiles = [];
    if (this.searchTerm) {
      for (const profileId in this.mapProfile) {
        if (this.mapProfile.hasOwnProperty(profileId)) {
          const profileName = this.mapProfile[profileId];
          if (profileName.toLowerCase().includes(this.searchTerm.toLowerCase())) {
            this.filteredProfiles.push({ id: profileId, name: profileName });
          }
        }
      }
    }
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredProfiles = []; 
  }
  printDataExcel(name): void {
    console.log("this.selectedJourneysProfileIds",this.selectedJourneysProfileIds);
    const csvData = this.selectedJourneysProfileIds.map(profileId => ({
      'Name': this.mapProfile[profileId] || 'No Profile Name',
      'Phone No': this.mapPhone[profileId] || '',
      'Subscription End Date': this.subsEndMap[profileId] || '',
      // 'Active Journey': this.activeJourneyMap[profileId] || '',
      // 'Last Journey': this.lastJourneyMap[profileId] || '',
      'Financial Status': this.financialStatusMap[profileId] || 'Undefined',
      'Customer Status': this.customerStatusMap[profileId] || 'Undefined',
    }));
    // Sort Date
    const sortedData = csvData.sort((a, b) => {
      const dateA = a['Subscription End Date'] ? new Date(a['Subscription End Date']).getTime() : 0;
      const dateB = b['Subscription End Date'] ? new Date(b['Subscription End Date']).getTime() : 0;
      return dateA - dateB;
    });
    const csvContent = this.convertToCSV(sortedData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadLink = document.createElement('a');
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.setAttribute('download', name);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
  downloadCSV(): void {
    console.log("selectedMonthForSubscription",this.selectedMonthForSubscription);
    
    const csvData = this.selectedProfileIdsForMonth.map(profileId => ({
      'Name': this.mapProfile[profileId] || 'No Profile Name',
      'Phone No': this.mapPhone[profileId] || '',
      'Subscription End Date': this.subsEndMap[profileId] || '',
      'Active Journey': this.activeJourneyMap[profileId] || '',
      'Last Journey': this.lastJourneyMap[profileId] || '',
      'Financial Status': this.financialStatusMap[profileId] || '',
      'Customer Status': this.customerStatusMap[profileId] || '',
    }));
  
    // Sort Date
    const sortedData = csvData.sort((a, b) => {
      const dateA = a['Subscription End Date'] ? new Date(a['Subscription End Date']).getTime() : 0;
      const dateB = b['Subscription End Date'] ? new Date(b['Subscription End Date']).getTime() : 0;
      return dateA - dateB;
    });
  
    const csvContent = this.convertToCSV(sortedData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadLink = document.createElement('a');
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    // downloadLink.setAttribute('download',this.selectedMonthForSubscription + ' Subscription End');
    downloadLink.setAttribute('download', 
      this.selectedMonthForSubscription === 'Next Month' ? this.nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' }) + ' Subscription End' :
      this.selectedMonthForSubscription === 'This Month' ? this.currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' }) + ' Subscription End' : 
      this.lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' }) + ' Subscription End'
  );
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
  downloadCSVEngagement(): void {
    console.log("this.selectedEngagement",this.selectedEngagement);
    const csvData = this.selectedEngagementProfileIds.map(profileId => ({
      'Name': this.mapProfile[profileId] || 'No Profile Name',
      'Phone No': this.mapPhone[profileId] || '',
      'Subscription End Date': this.subsEndMap[profileId] || '',
      'Active Journey': this.activeJourneyMap[profileId] || '',
      'Last Journey': this.lastJourneyMap[profileId] || '',
      'Financial Status': this.financialStatusMap[profileId] || 'Undefined',
      'Customer Status': this.customerStatusMap[profileId] || 'Undefined',
    }));
    // Sort Date
    const sortedData = csvData.sort((a, b) => {
      const dateA = a['Subscription End Date'] ? new Date(a['Subscription End Date']).getTime() : 0;
      const dateB = b['Subscription End Date'] ? new Date(b['Subscription End Date']).getTime() : 0;
      return dateA - dateB;
    });
    const csvContent = this.convertToCSV(sortedData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadLink = document.createElement('a');
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.setAttribute('download', "Engagement Level "+this.selectedEngagement);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  private convertToCSV(data: any[]): string {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    return [headers, ...rows].join('\n');
  }
  onEngagementCategoryChange(value: string) {
    this.selectedEngagementCategory = value;
    this.updateEngagementLevels();
  }

  updateEngagementLevels() {
    this.engagementLevel = {
      "average": [],
      "minimal": [],
      "optimal": [],
      "disappear": [],
      "superoptimal": [],
    };

    this.participants.forEach((participant) => {
      const subscriptionEnd = participant.subscriptionend;
      const engagementlevel = participant.engagementlevel;
      const profileid = participant.profileid;
      const customerStatus = participant.customerstatus;
      const activejourney = participant.activejourney;
      const lastjourney = participant.lastcompletedjourney;
      if (customerStatus !== 'discontinued') {
        if (this.selectedEngagementCategory === 'ActiveOnly') {
          // Logic for 'All'
          // if (customerStatus === 'active') {
            if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() > new Date()) {
              if (engagementlevel === null || engagementlevel === undefined) {
                this.engagementLevel.disappear.push(profileid);
              } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
                this.engagementLevel[engagementlevel].push(profileid);
              }
            }
          // }
        } else if (this.selectedEngagementCategory === 'CustomerActive') {
          // Logic for 'Active Only'
          // if (customerStatus === 'active') {
            if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() < new Date()) {
              // if (activejourney != undefined && activejourney != null && lastjourney ===null) {
                if (engagementlevel === null || engagementlevel === undefined) {
                  this.engagementLevel.disappear.push(profileid);
                } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
                  this.engagementLevel[engagementlevel].push(profileid);
                } 
              // }
            // }
          }
        } 
        // else if (this.selectedEngagementCategory === 'CustomerActive') {
        //   // Logic for 'Active Only'
        //   if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() < new Date()) {
        //     // if (activejourney != undefined && activejourney != null && lastjourney ===null) {
        //       if (engagementlevel === null || engagementlevel === undefined) {
        //         this.engagementLevel.disappear.push(profileid);
        //       } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
        //         this.engagementLevel[engagementlevel].push(profileid);
        //       } 
        //     // }
        //   }
        // } 
      }
      // if (customerStatus !== 'discontinued') {
      //   if (this.selectedEngagementCategory === 'ActiveOnly') {
      //     // Logic for 'All'
      //     if (engagementlevel === null || engagementlevel === undefined) {
      //       this.engagementLevel.disappear.push(profileid);
      //     } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
      //       this.engagementLevel[engagementlevel].push(profileid);
      //     }
      //   } else if (this.selectedEngagementCategory === 'CustomerActive') {
      //     // Logic for 'Active Only'
      //     if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() > new Date()) {
      //       if (engagementlevel === null || engagementlevel === undefined) {
      //         this.engagementLevel.disappear.push(profileid);
      //       } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
      //         this.engagementLevel[engagementlevel].push(profileid);
      //       }
      //     }
      //   } 
      //   // else if (this.selectedEngagementCategory === 'CustomerActive') {
      //   //   // Logic for 'Active Only'
      //   //   if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() < new Date()) {
      //   //     // if (activejourney != undefined && activejourney != null && lastjourney ===null) {
      //   //       if (engagementlevel === null || engagementlevel === undefined) {
      //   //         this.engagementLevel.disappear.push(profileid);
      //   //       } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
      //   //         this.engagementLevel[engagementlevel].push(profileid);
      //   //       } 
      //   //     // }
      //   //   }
      //   // } 
      // }
    });
  }
  participantDashboard() {
    this.loading = true;
    getDocs(collection(this.firestore,'participant metadata',
      // ref => ref.limit(100)
    ))
      
      .then((snap) => {
        snap.docs.forEach((snapdata) => {
          this.participants.push(snapdata.data());
        });
        // this.updateEngagementLevels();
        const currentDate = Timestamp.fromDate(new Date());
        // let beforeCurrentDateCount = 0;
        let beforeCurrentDateCount = [];
        // let afterCurrentDateCount = 0; 
        let afterCurrentDateCount = [];  
        // let activeRegularCount = 0;
        // let activeDefaultedCount = 0;
        // let activeLockedCount = 0;
        let activeRegularCount = [];
        let activeDefaultedCount = [];
        let activeLockedCount = [];
        let nonActiveButSubEndDateCount = 0;

        // let nonActiveRegularCount = 0;
        // let nonActiveDefaultedCount = 0;
        // let nonActiveLockedCount = 0;
        let nonActiveRegularCount = [];
        let nonActiveDefaultedCount = [];
        let nonActiveLockedCount = [];
  
        let activeProfileIds = [];
        let nonActiveProfileIds = [];
  
        let activeJourneys = [];
        let activeLastJourneys = [];
        let nonActiveJourneys = [];
        let nonActiveLastJourneys = [];
        

  
        let activeJourneysProfileIds = {};
        let activeLastJourneysProfileIds = {};
        let nonActiveJourneysProfileIds = {};
        let nonActiveLastJourneysProfileIds = {};
  
        let allParticipantCount = [];
        // let allParticipantRegularCount = 0;
        // let allParticipantDefaultedCount = 0;
        // let allParticipantLockedCount = 0;
        let allParticipantRegularCount = [];
        let allParticipantDefaultedCount = [];
        let allParticipantLockedCount = [];
        let allParticipantProfileIds = [];
        let allParticipantJourneys = [];
        let allParticipantJourneysProfileIds = {};

        //separate active and last for all participant
        let allParticipantActiveJourneys = [];
        let allParticipantLastJourneys = [];
        let allParticipantActiveJourneysProfileIds = {};
        let allParticipantLastJourneysProfileIds = {};

        let discontinuedParticipantCount = [];
        // let discontinuedParticipantRegularCount = 0;
        // let discontinuedParticipantDefaultedCount = 0;
        // let discontinuedParticipantLockedCount = 0;
        let discontinuedParticipantRegularCount = [];
        let discontinuedParticipantDefaultedCount = [];
        let discontinuedParticipantLockedCount = [];
        let discontinuedParticipantProfileIds = [];
        let discontinuedParticipantJourneys = [];
        let discontinuedParticipantJourneysProfileIds = {};

        //end but active
        let endButActiveParticipantProfileIds = [];

        //other counts
        // let activeLateCount = 0;
        // let activeBannedCount = 0;
        // let activeDiscontinuedCount = 0;
        // let activeUndefinedCount = 0;
        let activeLateCount = [];
        let activeBannedCount = [];
        let activeDiscontinuedCount = [];
        let activeUndefinedCount = [];

        // let nonActiveLateCount = 0;
        // let nonActiveBannedCount = 0;
        // let nonActiveDiscontinuedCount = 0;
        // let nonActiveUndefinedCount = 0;
        let nonActiveLateCount = [];
        let nonActiveBannedCount = [];
        let nonActiveDiscontinuedCount = [];
        let nonActiveUndefinedCount = [];
        
        // let allParticipantLateCount = 0;
        // let allParticipantBannedCount = 0;
        // let allParticipantDiscontinuedCount = 0;
        // let allParticipantUndefinedCount = 0;
        let allParticipantLateCount = [];
        let allParticipantBannedCount = [];
        let allParticipantDiscontinuedCount = [];
        let allParticipantUndefinedCount = [];

        // let discontinuedParticipantLateCount = 0;
        // let discontinuedParticipantBannedCount = 0;
        // let discontinuedParticipantDiscontinuedCount = 0;
        // let discontinuedParticipantUndefinedCount = 0;
        let discontinuedParticipantLateCount = [];
        let discontinuedParticipantBannedCount = [];
        let discontinuedParticipantDiscontinuedCount = [];
        let discontinuedParticipantUndefinedCount = [];
        this.engagementLevel = {
          "average": [],
          "minimal": [],  
          "optimal": [],
          "disappear": [],
          "superoptimal": [],
        };
        this.participants.forEach((participant) => {
          const subscriptionEnd = participant.subscriptionend;
          const financialstatus = participant.financialstatus;
          const activejourney = participant.activejourney;
          const lastjourney = participant.lastcompletedjourney;
          const profileid = participant.profileid;
          const customerStatus = participant.customerstatus;
          const engagementlevel = participant.engagementlevel
          if (subscriptionEnd && subscriptionEnd.toDate) {
            const subscriptionEndDateConv = subscriptionEnd.toDate();
            this.subscriptionEndMap[profileid] = subscriptionEndDateConv;
          } else {
            this.subscriptionEndMap[profileid] = null;
          }          
          // this.subscriptionEndMap[profileid] = subscriptionEndDateConv;
          this.financialStatusMap[profileid] = financialstatus;
          this.customerStatusMap[profileid] = customerStatus
          this.activeJourneyMap[profileid] = activejourney
          this.lastJourneyMap[profileid] = lastjourney
          this.subsEndMap[profileid] = subscriptionEnd != null ? subscriptionEnd.toDate() : ""
          // this.uniqueActiveJourneys = Array.from(new Set(Object.values(this.activeJourneyMap)));
          const activeJourneyValues = Object.values(this.activeJourneyMap);
          const lastJourneyValues = Object.values(this.lastJourneyMap);
        
          this.uniqueActiveJourneys = Array.from(new Set([...activeJourneyValues, ...lastJourneyValues].filter(value => value != null && value !== '')));                
          // if (![null,undefined].includes(engagementlevel)) {
          //   if (engagementlevel && this.engagementLevel.hasOwnProperty(engagementlevel)) {
          //     this.engagementLevel[engagementlevel].push(profileid);
          //   }
          // }
          // if (customerStatus !== 'discontinued' && customerStatus === 'active') {
          //   //for all 
          //   if (engagementlevel === null || engagementlevel === undefined) {
          //     this.engagementLevel.disappear.push(profileid);
          //   } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
          //     this.engagementLevel[engagementlevel].push(profileid);
          //   } 
          //   //for active
          //   if (this.selectedEngagementCategory === 'ActiveOnly') {
          //     if (subscriptionEnd && subscriptionEnd.seconds && subscriptionEnd.toDate() > new Date()) {
          //       if (engagementlevel === null || engagementlevel === undefined) {
          //         this.engagementLevel.disappear.push(profileid);
          //       } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
          //         this.engagementLevel[engagementlevel].push(profileid);
          //       } 
          //     }
          //   } else {
          //     if (engagementlevel === null || engagementlevel === undefined) {
          //       this.engagementLevel.disappear.push(profileid);
          //     } else if (this.engagementLevel.hasOwnProperty(engagementlevel)) {
          //       this.engagementLevel[engagementlevel].push(profileid);
          //     }
          //   }
          // }
          if (subscriptionEnd && subscriptionEnd.seconds) {
            if (customerStatus !== 'discontinued' && 
              subscriptionEnd.toDate() > new Date()
              //  && (subscriptionEnd.seconds > currentDate.seconds || 
              //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds >= currentDate.nanoseconds))
              ) {
                if ((lastjourney != undefined && lastjourney != null) || (activejourney != undefined && activejourney != null)) {
                // afterCurrentDateCount++;
              // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
              // }
              // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
                // afterCurrentDateCount++;
                afterCurrentDateCount.push(profileid);
                //active journey
                if (activejourney != undefined && activejourney != null 
                ) {                   
                  activeJourneys.push(activejourney);
                  if (!activeJourneysProfileIds[activejourney]) {
                    activeJourneysProfileIds[activejourney] = [];
                  }
                  activeJourneysProfileIds[activejourney].push(profileid);
                }
                //last journey
                if (lastjourney!=undefined && lastjourney!=null && activejourney === null) {
                  // console.log("consoling lastjourney journey for non active",lastjourney);
                  // console.log("consoling last journey for non active",lastjourney);

                  activeLastJourneys.push(lastjourney);
                  if (!activeLastJourneysProfileIds[lastjourney]) {
                    activeLastJourneysProfileIds[lastjourney] = [];
                  }
                  activeLastJourneysProfileIds[lastjourney].push(profileid);
                } 
                // activeProfileIds.push(profileid);
                // if (activejourney!=undefined && activejourney!=null) {
                //   activeJourneys.push(activejourney);
                //   if (!activeJourneysProfileIds[activejourney]) {
                //     activeJourneysProfileIds[activejourney] = [];
                //   }
                //   activeJourneysProfileIds[activejourney].push(profileid);
                // }
              // }
              // if (financialstatus === 'regular') activeRegularCount++;
              // else if (financialstatus === 'defaulted') activeDefaultedCount++;
              // else if (financialstatus === 'locked') activeLockedCount++;
              // else if (financialstatus === 'banned') activeBannedCount++;
              // else if (financialstatus === 'late') activeLateCount++;
              // else if (financialstatus === 'discontinued') activeDiscontinuedCount++;
              // else if (financialstatus === undefined) activeUndefinedCount++;
              // } else {
              //   console.log("proileid of null participant",profileid);
                
              // }
              if (financialstatus === 'regular') activeRegularCount.push(profileid);
              else if (financialstatus === 'defaulted') activeDefaultedCount.push(profileid);
              else if (financialstatus === 'locked') activeLockedCount.push(profileid);
              else if (financialstatus === 'banned') activeBannedCount.push(profileid);
              else if (financialstatus === 'late') activeLateCount.push(profileid);
              else if (financialstatus === 'discontinued') activeDiscontinuedCount.push(profileid);
              else if (financialstatus === undefined) activeUndefinedCount.push(profileid);
              } else {
                console.log("proileid of null participant",profileid);
                
              }
            } 
            // else if (customerStatus === 'active' && (subscriptionEnd.seconds < currentDate.seconds || 
            //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds <= currentDate.nanoseconds))) {
            //   // afterCurrentDateCount++;
            //   // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
            //   // }
            //   // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
            //     nonActiveButSubEndDateCount++;
            //     endButActiveParticipantProfileIds.push(profileid);
            //     // activeProfileIds.push(profileid);
            //     // if (activejourney!=undefined && activejourney!=null) {
            //     //   activeJourneys.push(activejourney);
            //     //   if (!activeJourneysProfileIds[activejourney]) {
            //     //     activeJourneysProfileIds[activejourney] = [];
            //     //   }
            //     //   activeJourneysProfileIds[activejourney].push(profileid);
            //     // }
            //   // }
            //   // if (financialstatus === 'regular') activeRegularCount++;
            //   // else if (financialstatus === 'defaulted') activeDefaultedCount++;
            //   // else if (financialstatus === 'locked') activeLockedCount++;
            //   // else if (financialstatus === 'banned') activeBannedCount++;
            //   // else if (financialstatus === 'late') activeLateCount++;
            //   // else if (financialstatus === 'discontinued') activeDiscontinuedCount++;
            //   // else if (financialstatus === undefined) activeUndefinedCount++;

            // } 
            if (customerStatus !== 'discontinued' && 
              subscriptionEnd.toDate() < new Date()
              // (subscriptionEnd.seconds < currentDate.seconds || 
              //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds <= currentDate.nanoseconds))
              ) {
                  // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
                // if ((lastjourney != undefined && lastjourney != null) || (activejourney!=undefined && activejourney!=null)) {
                  if ((lastjourney != undefined && lastjourney != null) || (activejourney != undefined && activejourney != null)) {
                    // beforeCurrentDateCount++;
                    beforeCurrentDateCount.push(profileid);
                    nonActiveProfileIds.push(profileid);
                  }
                  // console.log("activejourneyactivejourneyactivejourney",activejourney);
                  // console.log(subscriptionEnd.toDate());
                  // console.log(profileid);
                  
                  
                  //active journey
                  if (activejourney != undefined && activejourney != null && lastjourney ===null
                  ) {                   
                    nonActiveJourneys.push(activejourney);
                    if (!nonActiveJourneysProfileIds[activejourney]) {
                      nonActiveJourneysProfileIds[activejourney] = [];
                    }
                    nonActiveJourneysProfileIds[activejourney].push(profileid);
                  }
                  //last journey
                  if (lastjourney!=undefined && lastjourney!=null 
                  ) {
                    // console.log("consoling lastjourney journey for non active",lastjourney);
                    // console.log("consoling last journey for non active",lastjourney);

                    nonActiveLastJourneys.push(lastjourney);
                    if (!nonActiveLastJourneysProfileIds[lastjourney]) {
                      nonActiveLastJourneysProfileIds[lastjourney] = [];
                    }
                    nonActiveLastJourneysProfileIds[lastjourney].push(profileid);
                  } 
                  // nonActiveJourneys.push(lastjourney);
                  // if (!nonActiveJourneysProfileIds[lastjourney]) {
                  //   nonActiveJourneysProfileIds[lastjourney] = [];
                  // }
                  // nonActiveJourneysProfileIds[lastjourney].push(profileid);
                // } 
                  // }
                  // if ((lastjourney != undefined && lastjourney != null) || (activejourney != undefined && activejourney != null)) {
                  //   if (financialstatus === 'regular') nonActiveRegularCount++;
                  //   else if (financialstatus === 'defaulted') nonActiveDefaultedCount++;
                  //   else if (financialstatus === 'locked') nonActiveLockedCount++;
                  //   else if (financialstatus === 'banned') nonActiveBannedCount++;
                  //   else if (financialstatus === 'late') nonActiveLateCount++;
                  //   else if (financialstatus === 'discontinued') nonActiveDiscontinuedCount++;
                  //   else if (financialstatus === undefined) nonActiveUndefinedCount++;
                         
                  // }
                  if ((lastjourney != undefined && lastjourney != null) || (activejourney != undefined && activejourney != null)) {
                    if (financialstatus === 'regular') nonActiveRegularCount.push(profileid);
                    else if (financialstatus === 'defaulted') nonActiveDefaultedCount.push(profileid);
                    else if (financialstatus === 'locked') nonActiveLockedCount.push(profileid);
                    else if (financialstatus === 'banned') nonActiveBannedCount.push(profileid);
                    else if (financialstatus === 'late') nonActiveLateCount.push(profileid);
                    else if (financialstatus === 'discontinued') nonActiveDiscontinuedCount.push(profileid);
                    else if (financialstatus === undefined) nonActiveUndefinedCount.push(profileid);
                         
                  }
             } 
            // else if (customerStatus === 'non active' && (subscriptionEnd.seconds > currentDate.seconds || 
            //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds >= currentDate.nanoseconds))) {
            //     if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
            //       discontinuedParticipantCount++;
            //       discontinuedParticipantProfileIds.push(profileid);
            //       if (lastjourney != undefined && lastjourney != null) {
            //         discontinuedParticipantJourneys.push(lastjourney);
            //         if (!discontinuedParticipantJourneysProfileIds[lastjourney]) {
            //           discontinuedParticipantJourneysProfileIds[lastjourney] = [];
            //         }
            //         discontinuedParticipantJourneysProfileIds[lastjourney].push(profileid);
            //       }
            //     }
            //   if (financialstatus === 'regular') discontinuedParticipantRegularCount++;
            //   else if (financialstatus === 'defaulted') discontinuedParticipantDefaultedCount++;
            //   else if (financialstatus === 'locked') discontinuedParticipantLockedCount++;
            //   else if (financialstatus === 'banned') discontinuedParticipantBannedCount++;
            //   else if (financialstatus === 'late') discontinuedParticipantLateCount++;
            //   else if (financialstatus === 'discontinued') discontinuedParticipantDiscontinuedCount++;
            //   else if (financialstatus === undefined) discontinuedParticipantUndefinedCount++;
            // }
          }
         
          if (customerStatus === 'discontinued') {
            // if (financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') {
              // discontinuedParticipantCount++;
              discontinuedParticipantCount.push(profileid);
              discontinuedParticipantProfileIds.push(profileid);
              if (lastjourney != undefined && lastjourney != null) {
                discontinuedParticipantJourneys.push(lastjourney);
                if (!discontinuedParticipantJourneysProfileIds[lastjourney]) {
                  discontinuedParticipantJourneysProfileIds[lastjourney] = [];
                }
                discontinuedParticipantJourneysProfileIds[lastjourney].push(profileid);
              }
              
            // }
            // if (financialstatus === 'regular') discontinuedParticipantRegularCount++;
            // else if (financialstatus === 'defaulted') discontinuedParticipantDefaultedCount++;
            // else if (financialstatus === 'locked') discontinuedParticipantLockedCount++;
            // else if (financialstatus === 'banned') discontinuedParticipantBannedCount++;
            // else if (financialstatus === 'late') discontinuedParticipantLateCount++;
            // else if (financialstatus === 'discontinued') discontinuedParticipantDiscontinuedCount++;
            // else if (financialstatus === undefined) discontinuedParticipantUndefinedCount++;
            if (financialstatus === 'regular') discontinuedParticipantRegularCount.push(profileid);
            else if (financialstatus === 'defaulted') discontinuedParticipantDefaultedCount.push(profileid);
            else if (financialstatus === 'locked') discontinuedParticipantLockedCount.push(profileid);
            else if (financialstatus === 'banned') discontinuedParticipantBannedCount.push(profileid);
            else if (financialstatus === 'late') discontinuedParticipantLateCount.push(profileid);
            else if (financialstatus === 'discontinued') discontinuedParticipantDiscontinuedCount.push(profileid);
            else if (financialstatus === undefined) discontinuedParticipantUndefinedCount.push(profileid);
          }
          // if ((financialstatus === 'regular' || financialstatus === 'locked' || financialstatus === 'defaulted') && ((activejourney!=undefined && activejourney!=null) || (lastjourney!=undefined && lastjourney!=null))) {
          if ((subscriptionEnd && subscriptionEnd.seconds) && ((activejourney!=undefined && activejourney!=null) || (lastjourney!=undefined && lastjourney!=null))) {
            // allParticipantCount++;
            allParticipantCount.push(profileid)
            allParticipantProfileIds.push(profileid);
            // allParticipantJourneys
            if (activejourney!=undefined && activejourney!=null && subscriptionEnd.seconds > currentDate.seconds || 
              (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds >= currentDate.nanoseconds)) {
                allParticipantJourneys.push(activejourney);
              if (!allParticipantJourneysProfileIds[activejourney]) {
                allParticipantJourneysProfileIds[activejourney] = [];
              }
              allParticipantJourneysProfileIds[activejourney].push(profileid);
            }
            if (lastjourney!=undefined && lastjourney!=null && subscriptionEnd.seconds < currentDate.seconds || 
              (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds <= currentDate.nanoseconds)) {
                allParticipantJourneys.push(lastjourney);
              if (!allParticipantJourneysProfileIds[lastjourney]) {
                allParticipantJourneysProfileIds[lastjourney] = [];
              }
              allParticipantJourneysProfileIds[lastjourney].push(profileid);
            }
            // if (activejourney!=undefined && activejourney!=null && subscriptionEnd.seconds > currentDate.seconds || 
            //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds >= currentDate.nanoseconds)) {
            //   allParticipantActiveJourneys.push(activejourney);
            //   if (!allParticipantActiveJourneysProfileIds[activejourney]) {
            //     allParticipantActiveJourneysProfileIds[activejourney] = [];
            //   }
            //   allParticipantActiveJourneysProfileIds[activejourney].push(profileid);
            // }
            // if (lastjourney!=undefined && lastjourney!=null && subscriptionEnd.seconds < currentDate.seconds || 
            //   (subscriptionEnd.seconds === currentDate.seconds && subscriptionEnd.nanoseconds <= currentDate.nanoseconds)) {
            //   allParticipantLastJourneys.push(lastjourney);
            //   if (!allParticipantLastJourneysProfileIds[lastjourney]) {
            //     allParticipantLastJourneysProfileIds[lastjourney] = [];
            //   }
            //   allParticipantLastJourneysProfileIds[lastjourney].push(profileid);
            // } 
            // if (financialstatus === 'regular') allParticipantRegularCount++;
            // else if (financialstatus === 'defaulted') allParticipantDefaultedCount++;
            // else if (financialstatus === 'locked') allParticipantLockedCount++;  
            // else if (financialstatus === 'banned') allParticipantBannedCount++;
            // else if (financialstatus === 'late') allParticipantLateCount++;
            // else if (financialstatus === 'discontinued') allParticipantDiscontinuedCount++;
            // else if (financialstatus === undefined) allParticipantUndefinedCount++;
            if (financialstatus === 'regular') allParticipantRegularCount.push(profileid);
            else if (financialstatus === 'defaulted') allParticipantDefaultedCount.push(profileid);
            else if (financialstatus === 'locked') allParticipantLockedCount.push(profileid);
            else if (financialstatus === 'banned') allParticipantBannedCount.push(profileid);
            else if (financialstatus === 'late') allParticipantLateCount.push(profileid);
            else if (financialstatus === 'discontinued') allParticipantDiscontinuedCount.push(profileid);
            else if (financialstatus === undefined) allParticipantUndefinedCount.push(profileid);
  
          }
        });
  
        let activeJourneysCount = {};
        let nonActiveJourneysCount = {};
        let allParticipantJourneysCount = {};
        let discontinuedParticipantJourneysCount = {};
        let allParticipantActiveJourneysCount = {};
        let allParticipantLastJourneysCount = {};
        // for non active active journey
        let nonActiveActiveJourneysCount = {};
        // for non active last journey
        let nonActiveLastJourneysCount = {};
        // for non active active journey
        let activeActiveJourneysCount = {};
        // for non active last journey
        let activeLastJourneysCount = {};


  
        // Object.keys(activeJourneysProfileIds).forEach((journey) => {
        //   activeJourneysCount[journey] = {
        //     count: activeJourneysProfileIds[journey].length,
        //     profileIds: activeJourneysProfileIds[journey]
        //   };
        // });
  
        // Object.keys(nonActiveJourneysProfileIds).forEach((journey) => {
        //   nonActiveJourneysCount[journey] = {
        //     count: nonActiveJourneysProfileIds[journey].length,
        //     profileIds: nonActiveJourneysProfileIds[journey]
        //   };
        // });
        Object.keys(discontinuedParticipantJourneysProfileIds).forEach((journey) => {
          discontinuedParticipantJourneysCount[journey] = {
            count: discontinuedParticipantJourneysProfileIds[journey].length,
            profileIds: discontinuedParticipantJourneysProfileIds[journey]
          };
        });
  
        Object.keys(allParticipantJourneysProfileIds).forEach((journey) => {
          allParticipantJourneysCount[journey] = {
            count: allParticipantJourneysProfileIds[journey].length,
            profileIds: allParticipantJourneysProfileIds[journey]
          };
        });
        Object.keys(allParticipantActiveJourneysProfileIds).forEach((journey) => {
          allParticipantActiveJourneysCount[journey] = {
            count: allParticipantActiveJourneysProfileIds[journey].length,
            profileIds: allParticipantActiveJourneysProfileIds[journey]
          };
        });
        
        Object.keys(allParticipantLastJourneysProfileIds).forEach((journey) => {
          allParticipantLastJourneysCount[journey] = {
            count: allParticipantLastJourneysProfileIds[journey].length,
            profileIds: allParticipantLastJourneysProfileIds[journey]
          };
        });

        // for active journey
        Object.keys(activeJourneysProfileIds).forEach((journey) => {
          activeActiveJourneysCount[journey] = {
            count: activeJourneysProfileIds[journey].length,
            profileIds: activeJourneysProfileIds[journey]
          };
        });

        //for active last journey
        Object.keys(activeLastJourneysProfileIds).forEach((journey) => {
          activeLastJourneysCount[journey] = {
            count: activeLastJourneysProfileIds[journey].length,
            profileIds: activeLastJourneysProfileIds[journey]
          };
        });

        // for non active journey
        Object.keys(nonActiveJourneysProfileIds).forEach((journey) => {
          nonActiveActiveJourneysCount[journey] = {
            count: nonActiveJourneysProfileIds[journey].length,
            profileIds: nonActiveJourneysProfileIds[journey]
          };
        });

        //for non active last journey
        Object.keys(nonActiveLastJourneysProfileIds).forEach((journey) => {
          nonActiveLastJourneysCount[journey] = {
            count: nonActiveLastJourneysProfileIds[journey].length,
            profileIds: nonActiveLastJourneysProfileIds[journey]
          };
        });

        this.subscriptionData[0].activeCount = afterCurrentDateCount; 
        this.subscriptionData[1].activeCount = beforeCurrentDateCount;  
        this.subscriptionData[2].activeCount = discontinuedParticipantCount;  
        
        this.subscriptionData[0].Regular = activeRegularCount;
        this.subscriptionData[0].Defaulted = activeDefaultedCount;
        this.subscriptionData[0].Locked = activeLockedCount;
  
        this.subscriptionData[1].Regular = nonActiveRegularCount;
        this.subscriptionData[1].Defaulted = nonActiveDefaultedCount;
        this.subscriptionData[1].Locked = nonActiveLockedCount;

        this.subscriptionData[2].Regular = discontinuedParticipantRegularCount;
        this.subscriptionData[2].Defaulted = discontinuedParticipantDefaultedCount;
        this.subscriptionData[2].Locked = discontinuedParticipantLockedCount;
  
        this.subscriptionData[0].profileIds = activeProfileIds;
        this.subscriptionData[1].profileIds = nonActiveProfileIds;
        this.subscriptionData[2].profileIds = discontinuedParticipantProfileIds;


  
        // this.subscriptionData[0].journey = Object.keys(activeJourneysCount);
        // this.subscriptionData[1].journey = Object.keys(nonActiveJourneysCount);
        this.subscriptionData[2].journey = Object.keys(discontinuedParticipantJourneysCount);

  
        // this.subscriptionData[0].journeyCount = activeJourneysCount;
        // this.subscriptionData[1].journeyCount = nonActiveJourneysCount;
        this.subscriptionData[2].journeyCount = discontinuedParticipantJourneysCount;

        //others count
        this.subscriptionData[0].Banned = activeBannedCount;
        this.subscriptionData[0].Late = activeLateCount;
        this.subscriptionData[0].Discontinued = activeDiscontinuedCount;
        this.subscriptionData[0].Undefined = activeUndefinedCount;

        this.subscriptionData[1].Banned = nonActiveBannedCount;
        this.subscriptionData[1].Late = nonActiveLateCount;
        this.subscriptionData[1].Discontinued = nonActiveDiscontinuedCount;
        this.subscriptionData[1].Undefined = nonActiveUndefinedCount;

        this.subscriptionData[2].Banned = discontinuedParticipantBannedCount;
        this.subscriptionData[2].Late = discontinuedParticipantLateCount;
        this.subscriptionData[2].Discontinued = discontinuedParticipantDiscontinuedCount;
        this.subscriptionData[2].Undefined = discontinuedParticipantUndefinedCount;

        this.subscriptionData[3].Banned = allParticipantBannedCount;
        this.subscriptionData[3].Late = allParticipantLateCount;
        this.subscriptionData[3].Discontinued = allParticipantDiscontinuedCount;
        this.subscriptionData[3].Undefined = allParticipantUndefinedCount;

        //other count end

  
        this.subscriptionData[3].activeCount = allParticipantCount; 
        this.subscriptionData[3].Regular = allParticipantRegularCount;
        this.subscriptionData[3].Defaulted = allParticipantDefaultedCount;
        this.subscriptionData[3].Locked = allParticipantLockedCount;
        this.subscriptionData[3].profileIds = allParticipantProfileIds;
        this.subscriptionData[3].journey = Object.keys(allParticipantJourneysCount);
        this.subscriptionData[3].journeyCount = allParticipantJourneysCount;
        // this.subscriptionData[3].activeJourney = Object.keys(allParticipantActiveJourneysCount);
        // this.subscriptionData[3].activeJourneyCount = allParticipantActiveJourneysCount;
        // this.subscriptionData[3].lastJourney = Object.keys(allParticipantLastJourneysCount);
        // this.subscriptionData[3].lastJourneyCount = allParticipantLastJourneysCount;
        //for active 
        this.subscriptionData[0].activeJourney = Object.keys(activeActiveJourneysCount);
        this.subscriptionData[0].activeJourneyCount = activeActiveJourneysCount;
        this.subscriptionData[0].lastJourney = Object.keys(activeLastJourneysCount);
        this.subscriptionData[0].lastJourneyCount = activeLastJourneysCount;        
        //for non active 
        this.subscriptionData[1].activeJourney = Object.keys(nonActiveActiveJourneysCount);
        this.subscriptionData[1].activeJourneyCount = nonActiveActiveJourneysCount;
        this.subscriptionData[1].lastJourney = Object.keys(nonActiveLastJourneysCount);
        this.subscriptionData[1].lastJourneyCount = nonActiveLastJourneysCount;

        // this.originalJourneyCount = JSON.parse(JSON.stringify(this.selectedCard.journeyCount));
        this.updateMonthLabels();
        this.updateEngagementLevels(); 
        this.loading = false;
      });
  }

  clickactivesubscriptionend(){
    this.activesubscriptionend = !this.activesubscriptionend
  }
  selectOption(doc:any,engagementCategory,option: string) {
    console.log('Selected option:', option);
    // Add your logic here based on the selected option
  }
  async navigatetoTimeline(doc:any,engagementCategory,option: string){
      // const userResponse = confirm("Click 'Yes' if you want to view the Absolute timeline, or click 'Cancel' if you want to view the Relative timeline.");
        this.currentMonth = new Date(); 
        console.log("currentMonth", this.currentMonth);
        const fiveMonthsBefore = new Date(this.currentMonth);
        fiveMonthsBefore.setMonth(this.currentMonth.getMonth() - 5);
        console.log("Date 5 months before currentMonth", fiveMonthsBefore);
        console.log("currentMonthcurrentMonth",this.currentMonth);
        let listofprofileid = []
        let listofparticipants = doc
        let category = engagementCategory
        const docData = {
          profileid: this.loggedInProfileId,
          listofprofileid: listofprofileid,
          engagement:category,
          absolutedate:fiveMonthsBefore,
          timelinetype:option
        };
        const docSizeInBytes = new Blob([JSON.stringify(docData)]).size;
        console.log("Document size:", docSizeInBytes);
    
        // Check if size exceeds Firestore limit (1 MB = 1,048,576 bytes)
        if (docSizeInBytes > 1048576) {
          console.error("Document size exceeds Firestore limit of 1 MB.");
          alert("The document is too large to save to Firestore. Please reduce the data size.");
          return; 
        }
        // if (listofprofileid.length <= 1000 ) {
          var docid = doc(collection(this.firestore,'filteredtimeline profile')).id;
          await setDoc(doc(this.firestore,'filteredtimeline profile',docid),{
            profileid: this.loggedInProfileId,
            listofprofileid : listofparticipants,
            engagement:category,
            absolutedate:fiveMonthsBefore,
            timelinetype:option
          });
          console.log("console doc id",docid);
          
          const navigationurl = 'usertimeline'
          const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { docid }})
          window.open(url.toString(), '_blank')   
          // console.log("User  clicked Cancel");
    // this.currentMonth = new Date(); 
    // console.log("currentMonth", this.currentMonth);
    // const fiveMonthsBefore = new Date(this.currentMonth);
    // fiveMonthsBefore.setMonth(this.currentMonth.getMonth() - 5);
    // console.log("Date 5 months before currentMonth", fiveMonthsBefore);
    // console.log("currentMonthcurrentMonth",this.currentMonth);
    // let listofprofileid = []
    // let listofparticipants = doc
    // let category = engagementCategory
    // const docData = {
    //   profileid: this.loggedInProfileId,
    //   listofprofileid: listofprofileid,
    //   engagement:category,
    //   absolutedate:fiveMonthsBefore
    // };
    // const docSizeInBytes = new Blob([JSON.stringify(docData)]).size;
    // console.log("Document size (bytes):", docSizeInBytes);

    // // Check if size exceeds Firestore limit (1 MB = 1,048,576 bytes)
    // if (docSizeInBytes > 1048576) {
    //   console.error("Document size exceeds Firestore limit of 1 MB.");
    //   alert("The document is too large to save to Firestore. Please reduce the data size.");
    //   return; 
    // }
    // // if (listofprofileid.length <= 1000 ) {
    //   var docid = this.firestore.createId();
    //   await this.firestore.collection('filteredtimeline profile').doc(docid).set({
    //     profileid: this.loggedInProfileId,
    //     listofprofileid : listofparticipants,
    //     engagement:category,
    //     absolutedate:fiveMonthsBefore
    //   });
    //   console.log("console doc id",docid);
      
    //   const navigationurl = 'usertimeline'
    //   const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { docid }})
    //   window.open(url.toString(), '_blank')      
  }
}
