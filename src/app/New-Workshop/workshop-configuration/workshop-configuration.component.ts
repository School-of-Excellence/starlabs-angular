import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, setDoc, updateDoc, docSnapshots, DocumentSnapshot, collection, query, where, collectionSnapshots, getDocs, orderBy, collectionData, limit } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule ,AbstractControl, FormControl} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { A, COMMA, ENTER } from '@angular/cdk/keycodes';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { UpdateDeliveryComponent } from '../../Product Designer/delivery-set/update-delivery/update-delivery.component';
import { QuizComponent } from '../quiz/quiz.component';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { AuthguardService } from '../../authguard.service';
import { WorkshopCategoryComponent } from '../workshop-category/workshop-category.component';

interface WorkshopConfig {
  detailpage?: {
    title: string;
    type: string;
    // category: string;
    shortdescription: string;
    day: string;
    price:string;
    enrollbuttonname:string;
    whyworkshop:string;
    pricestriked:string;
    enablebonus:boolean;
    bonussection:string;
    bonushead:string;
    bonus1:string;
    bonus2:string;
    bonusfooter:string;
    description: string;
    joinus: string; 
    selectedTaxonomies:string[];
    selectedTestimonials:string[];
    selectTemplate:string[];
    primarylyTaught: string[];
    thumbnailImage: string;
    titleVideo: string;
    registrationStartDate: string;
    registrationEndDate: string;
    workshopStartDate: string;
    workshopEndDate: string;
    testimonialmap?: { [key: string]: { profileid: string, uploaded: any,videourl: string, } };
  };
  // challengepage?: {
  //   title: string;
  // };
  challenges?: any[];
}
interface ChallengeDetail {
  type: 'video' | 'audio' | '';
  name: string;
  description: string;
  contentref?: any;
  quizref?: any[];
  thumbnail:string;
  assignmenttype:string;
  reviewassignemnt:string;
  previewvideo:string;
  submissionformat:string;
  uploadedresource:string;
  uploadedfilename:string;
  uploadedresourcetitle:string;
  assignmenttopic:string;
  assignmentdescription:string;
  assignmentdescriptionrich:string;
  uploadtype:string;
  zoomlinkchallenge:string;
  meetdate?:any;
  rewardhead:string;
  rewarddescription:string;
  evolutionmappingtitle:string;
  evolutionmappingdescription:string;
  finalevolution:string;
  finalevolutiontype:string;
  rewardlink:string;
  notehead:string;
  notedescription:string;
  notedescriptionrich:string;
  finalbeforeafter: boolean;
}

interface CurriculumItem {
  type: 'zoomcall' | 'challenge' | '';
  zoomlink?: string;
  completedzoomurl?: string;
  // status?: 'completed' | null; 
  status?: 'completed'; 
  hidezoom?:boolean;
  startlivecall?:string;
  headicon?: string;
  heading?: string;
  subheading?: string;
  description?: string;
  workshopcategory?:any[];
  facilitator?:any[];
  facilitatoronly?:boolean;
  duedate?: any;
  duetime?:any;
  startdate?:any;
  starttime?:any;
  challenges?: ChallengeDetail[];
}

@Component({
  selector: 'app-workshop-configuration',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatRadioModule,
    MatSelectModule,
    DragDropModule,
    NgxEditorModule,
    MatSlideToggleModule,
    MatTimepickerModule,
    MatChipsModule
],
  templateUrl: './workshop-configuration.component.html',
  styleUrls: ['./workshop-configuration.component.css']
})
export class WorkshopConfigurationComponent implements OnInit, OnDestroy {
  editors: { [key: string]: Editor } = {};
  noteeditors: { [key: string]: Editor } = {};
  assignmenteditors: { [key: string]: Editor } = {};
  noterichTextContents: { [key: string]: string } = {};
  assignmentrichTextContents: { [key: string]: string } = {};
  recentTemplates = [];
  workshopCategories: any[] = [];
  chatgroupslist: any[] = [];
  bigCohorts: any[] = [];
  workshopCategoriesMap: { [key: string]: string } = {};
  bigCohortsMap: { [key: string]: string } = {};
  richTextContents: { [key: string]: string } = {};
  private blurSubject = new Subject<void>();
  challengeExpanded: { [key: number]: boolean } = {};
  richTextFields = [
    {
      key: 'description',
      label: 'Workshop Description',
      placeholder: 'Enter detailed workshop description...',
      required: true,
      hint: 'Rich text editor - Format your workshop description with bold, italic, lists, and more'
    },
    {
      key: 'joinus',
      label: 'Join Us Section',
      placeholder: 'Enter join us content...',
      required: false,
      hint: 'Rich text editor - Format your join us section with styling options'
    },
  ];
  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    // ['code', 'blockquote'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link'],
    // ['link', 'image'],
    // ['text_color', 'background_color'],
    ['text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];
  workshopData: WorkshopConfig | null = null;
  iconData;
  thumbnailData;
  docid;
  detailPageForm!: FormGroup;
  settingsForm!: FormGroup;
  challengesPageForm!: FormGroup;
  separatorKeysCodes: number[] = [ENTER, COMMA];
  selectedMenu: 'detailpage' | 'challenges' | 'challengesettings' | 'payment' | null = 'detailpage'; 
  loading = false;
  isSaving = false;
  workshopId: string | null = null;
  documentsize;
  atcTaxonomyData: any[] = [];
  testimonialData: any[] = [];
  videoasktemplate: any[] = [];
  journeyData: any[] = [];
  tierData: any[] = [];
  fieldSections = [
    {
      key: 'learnings',
      title: 'What You’ll Learn',
      placeholder: 'Enter a learning objective',
      minMessage: 'At least 1 learning is required.',
      maxLength: null,
    },
    {
      key: 'prerequisites',
      title: 'Requirements',
      placeholder: 'Enter a prerequisite objective',
      minMessage: 'At least 1 prerequisite is required.',
      maxLength: null,
    },
    {
      key: 'workshopfor',
      title: 'Who is this workshop for?',
      placeholder: 'Enter a target audience objective',
      minMessage: 'At least 1 audience is required.',
      maxLength: null,
    }
  ];
  iconWithTextSections = [
    {
      key: 'sneakpeak',
      title: 'Workshop Sneak Peak',
      addButtonLabel: 'Add Icon and Description',
      maxItems: 9,
      fieldType: 'dropdown',
      iconLabel: 'Choose Icon',
      descriptionLabel: 'Overview Description',
      maxLength: 70
    },
    {
      key: 'workshopoverview',
      title: 'Workshop Overview',
      addButtonLabel: 'Add Icon and Description',
      maxItems: 9,
      fieldType: 'dropdown',
      iconLabel: 'Choose Icon',
      descriptionLabel: 'Overview Description',
      maxLength: 70
    },
    {
      key: 'knowinfo',
      title: 'Know Info',
      addButtonLabel: 'Add Icon and Description',
      maxItems: 9,
      fieldType: 'dropdown',
      iconLabel: 'Choose Icon',
      descriptionLabel: 'Overview Description',
      maxLength: 150
    },
    {
      key: 'faq',
      title: 'FAQ',
      addButtonLabel: 'Add FAQ',
      maxItems: 20,
      fieldType: 'inputfield',
      iconLabel: 'Enter FAQ Question',
      descriptionLabel: 'Enter FAQ Answer',
      maxLength: 500
    }
  ];
  //challenge type
  challengetype = [
    'video',
    'audio',
    'form',
    'videoask',
    'quiz',
    'assignment',
    'resource',
    // 'zoomcall',
    'offer',
    'note',
    'evolutionmapping'
  ]
  videocontent = []
  audiocontent = []
  deliveryforms = []
  videoAsk=[]
  quiz = []
  refTitleMap = {};
  mapProfile: any = {};
  mapProfileNew: any = {};
  names: { id: string, name: string }[] = [];
  selectedNames = new FormControl<string[]>([]);
  selectedTemplatesForFilter: string[] = [];
  allLoadedTestimonials: any[] = [];
  testimonialMap: { [key: string]: { profileid: string, uploaded: any, videourl:string } } = {};
  objectKeys = Object.keys;


  private subscription = new Subject<void>();
  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private router: Router,
    private fb: FormBuilder,
    private storage: Storage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private guard: AuthguardService,
  
  ) {
    // this.getWorkshopCategories()
    this.getbigCohorts()
    this.loadRecentTemplates();
    Promise.all([
      this.guard.getProfileMap(),
      this.guard.getProfileMapNewUser()
    ])
    .then(([e, f]) => {
      const mapProfile = e.map || {};
      const mapProfileNew = f.map || {};

      const namesFromProfile = Object.keys(mapProfile).map(key => ({
        id: key,
        name: mapProfile[key]
      }));

      const namesFromProfileNew = Object.keys(mapProfileNew).map(key => ({
        id: key,
        name: mapProfileNew[key]
      }));
      this.names = [...namesFromProfile, ...namesFromProfileNew];
      this.names = this.names.filter(
        (item, index, self) => index === self.findIndex(t => t.id === item.id)
      );
      this.names.sort((a, b) => a.name.localeCompare(b.name));
    })
    .catch(err => {
      console.error("Error loading profile maps:", err);
    });
    // this.guard.getProfileMap().then(e => {
    //   this.mapProfile = e.map;
    //   this.names = Object.keys(this.mapProfile).map(key => ({
    //     id: key,
    //     name: this.mapProfile[key]
    //   }));
    // });
    // this.guard.getProfileMapNewUser().then(f => {
    //   this.mapProfileNew = f.map;
    //   this.names = Object.keys(this.mapProfileNew).map(key => ({
    //     id: key,
    //     name: this.mapProfileNew[key]
    //   }));
    // });
    const atcCollection = collection(this.firestore, 'atc taxonomy');
    collectionSnapshots(atcCollection).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshots => {
      this.atcTaxonomyData = snapshots.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('ATC Taxonomy Data:', this.atcTaxonomyData);
    });
    //for testimonial
    const videoaskTemplateCollection = collection(this.firestore, 'arenavideoask');
    collectionSnapshots(videoaskTemplateCollection).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshots => {
      this.videoasktemplate = snapshots.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('videoasktemplate Data:', this.videoasktemplate);
    });
    // const participantvideoaskcollection = collection(this.firestore,'participantvideoask') 
    // getDocs(participantvideoaskcollection).then(snap => {
    //   this.testimonialData = snap.docs.map(e => {
    //     let element = e.data()
    //     return element
    //   })
    //   console.log(this.testimonialData, 'testimonialData console');
    // });
    //end testimonial
    const journeyCollection = collection(this.firestore, 'journey');
    collectionSnapshots(journeyCollection).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshots => {
      this.journeyData = snapshots.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Journey Data:', this.journeyData);
    });
    const tierCollection = collection(this.firestore, 'tier');
    collectionSnapshots(tierCollection).pipe(
      takeUntil(this.subscription)
    ).subscribe(snapshots => {
      this.tierData = snapshots.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('tierData:', this.tierData);
    });
    const episodesRef = collection(this.firestore,'episodes') 
    getDocs(episodesRef).then(snap => {
      this.videocontent = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.refTitleMap[element['ref'].path] = element['title']
        return element
      })
      console.log(this.refTitleMap, 'content console');
    });
    const solarvoiceaudioRef = collection(this.firestore,'solar voice audios') 
    getDocs(solarvoiceaudioRef).then(snap => {
      this.audiocontent = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.refTitleMap[element['ref'].path] = element['name']
        return element
      })
      console.log(this.refTitleMap, 'content console');
    });
    this.getForms()
    this.getVideoAsk()
    this.initializeForms();
    this.getQuiz();
    this.blurSubject.pipe(debounceTime(500)).subscribe(() => {
});

  }
  timeSlots: string[] = [
  '12:00 AM', '12:30 AM', '01:00 AM', '01:30 AM',
  '02:00 AM', '02:30 AM', '03:00 AM', '03:30 AM',
  '04:00 AM', '04:30 AM', '05:00 AM', '05:30 AM',
  '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM',
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM',
  '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'
];
previousValue: string[] = [];
previousValueCohorts: string[] = [];
uniqueWorkshopCategories: string[] = [];
loggedinProfile: string = null;
loggedinProfileUserRef: string = null;
loggedinProfileName: string = null;
onTestimonialSelect(selectedIds: string[]): void {
  const newMap: { [key: string]: { profileid: string, uploaded: any, videourl:string } } = { ...this.testimonialMap };
  const currentFormIds = selectedIds || [];
  currentFormIds.forEach(id => {
    if (!newMap[id]) {
      const testimonial = this.testimonialData.find(t => t.id === id);
      if (testimonial) {
        newMap[id] = {
          profileid: testimonial.profileid || '',
          uploaded: testimonial.uploaded || null,
          videourl: testimonial?.hls?.url_stream && testimonial.hls.url_stream.trim() !== ''
            ? testimonial.hls.url_stream
            : (testimonial.fileurl || null),
        };
      }
    }
  });
  
  const loadedTestimonialIds = this.testimonialData.map(t => t.id);
  Object.keys(newMap).forEach(id => {
    if (!currentFormIds.includes(id) && loadedTestimonialIds.includes(id)) {
      delete newMap[id];
    }
  });
  
  this.testimonialMap = newMap;
  
}

formatUploadedDate(timestamp: any): string {
  if (!timestamp) return '';
  
  let date: Date;
  if (timestamp.seconds) {

    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Helper method to get testimonials array from map for chips display
getTestimonialsFromMap(): Array<{ id: string, profileid: string, uploaded: any, videourl : string }> {
  return Object.keys(this.testimonialMap).map(id => ({
    id: id,
    profileid: this.testimonialMap[id].profileid,
    uploaded: this.testimonialMap[id].uploaded,
    videourl: this.testimonialMap[id].videourl
    
  }));
}

// Modified remove method
removeTestimonialFromMap(testimonialId: string): void {
  delete this.testimonialMap[testimonialId];
  const currentTestimonials = this.detailPageForm.get('selectedTestimonials')?.value || [];
  const updatedTestimonials = currentTestimonials.filter((id: string) => id !== testimonialId);
  this.detailPageForm.get('selectedTestimonials')?.setValue(updatedTestimonials, { emitEvent: false });
}

trackByTestimonialId(index: number, item: any): string {
  return item.id;
}

async loadTestimonialsForTemplates(templateIds: string[]): Promise<void> {
  if (!templateIds || templateIds.length === 0) {
    this.testimonialData = [];
    this.allLoadedTestimonials = [];
    return;
  }

  try {
    // Split into batches of 10 for Firestore 'in' query limit
    const batches = [];
    for (let i = 0; i < templateIds.length; i += 10) {
      batches.push(templateIds.slice(i, i + 10));
    }

    const allTestimonials = [];
    
    for (const batch of batches) {
      const participantvideoaskcollection = collection(this.firestore, 'participantvideoask');
      const q = query(
        participantvideoaskcollection,
        where('videoaskid', 'in', batch)
      );
      
      const snap = await getDocs(q);
      const batchTestimonials = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      allTestimonials.push(...batchTestimonials);
    }

    // Remove duplicates based on id
    const uniqueTestimonials = Array.from(
      new Map(allTestimonials.map(item => [item.id, item])).values()
    );

    this.allLoadedTestimonials = uniqueTestimonials;
    this.testimonialData = uniqueTestimonials;
    
    console.log('Accumulated testimonialData:', this.testimonialData);
  } catch (error) {
    console.error('Error loading testimonials:', error);
  }
}

// Modified method - keeps previous selections
onTemplateFilterChange(selectedIds: string[]): void {
  // Check limit
  if (selectedIds.length > 10) {
    selectedIds = selectedIds.slice(0, 10);
    this.selectedTemplatesForFilter = selectedIds;
    this.snackBar.open('You can select a maximum of 10 templates only!', 'Close', { 
      duration: 3000 
    });
    return;
  }
  
  this.selectedTemplatesForFilter = selectedIds;
  if (selectedIds.length > 0) {
    this.loadTestimonialsForTemplates(selectedIds);
  } else {
    this.testimonialData = [];
  }
}
async ngOnInit() {
  try {
    const roles = await this.guard.getRoles();
    this.loggedinProfile = roles["profile_ref"].id;
    const chatgroupsRef = collection(this.firestore, 'supportchat');
    const q = query(chatgroupsRef, where('type', '==', 'group'));
    const querySnapshot = await getDocs(q);
    const chatgroups = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    this.chatgroupslist = chatgroups.sort((a: any, b: any) => {
      const aTime = a.created_on?.seconds || a.created_on || 0;
      const bTime = b.created_on?.seconds || b.created_on || 0;
      return bTime - aTime;
    });

    console.log('Chat groups:', this.chatgroupslist);
  } catch (error) {
    console.error('Error loading chat groups:', error);
  }
  this.settingsForm.get('categoriesforthisworkshop')?.valueChanges.subscribe((newValue: string[]) => {
    if (this.previousValue && this.previousValue.length > 0) {
      const removedIds = this.previousValue.filter(id => !newValue?.includes(id));
      
      for (const categoryId of removedIds) {
        const isUsed = this.workshopData?.challenges?.some((challenge: any) =>
          challenge.workshopcategory?.includes(categoryId)
        );
        if (isUsed) {
          // Revert to previous value without triggering valueChanges
          this.settingsForm.get('categoriesforthisworkshop')?.setValue(this.previousValue, { emitEvent: false });
          alert('This category is already used in one or more challenges. Cannot remove.');
          return;
        }
      }
    }
    this.previousValue = [...(newValue || [])];
  });

  this.previousValue = [...(this.settingsForm.get('categoriesforthisworkshop')?.value || [])];

  this.settingsForm.get('evergreenWorkshop')?.valueChanges.subscribe(value => {
    const meta = this.settingsForm.get('evergreenWorkshopMeta') as FormGroup;
    if (value) {
      meta.get('workshopDays')?.enable();
      meta.get('workshopDays')?.setValidators([Validators.required, Validators.min(1)]);
      meta.get('lastChallengeMessage')?.enable();
      this.getDailyCommunicationArray().controls.forEach(c => c.enable());
    } else {
      meta.get('workshopDays')?.disable();
      meta.get('workshopDays')?.clearValidators();
      meta.get('lastChallengeMessage')?.disable();
      this.getDailyCommunicationArray().controls.forEach(c => c.disable());
    }
    meta.get('workshopDays')?.updateValueAndValidity();
    meta.get('lastChallengeMessage')?.updateValueAndValidity();
  });

  this.settingsForm.get('cohortcategoriesforthisworkshop')?.valueChanges.subscribe((newValue: string[]) => {
    if (this.previousValueCohorts && this.previousValueCohorts.length > 0) {
      const removedIds = this.previousValueCohorts.filter(id => !newValue?.includes(id));
      
      for (const categoryId of removedIds) {
        const isUsed = this.workshopData?.challenges?.some((challenge: any) =>
          challenge.workshopcategory?.includes(categoryId)
        );
        if (isUsed) {
          // Revert to previous value without triggering valueChanges
          this.settingsForm.get('cohortcategoriesforthisworkshop')?.setValue(this.previousValueCohorts, { emitEvent: false });
          alert('This category is already used in one or more challenges. Cannot remove.');
          return;
        }
      }
    }
    // Store current value as previous for next comparison
    this.previousValueCohorts = [...(newValue || [])];
  });

  // Initialize previous value
  this.previousValueCohorts = [...(this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [])];

    this.richTextFields.forEach(field => {
      this.editors[field.key] = new Editor();
      this.richTextContents[field.key] = '';
    });
    this.workshopId = this.route.snapshot.paramMap.get('id');
    if (this.workshopId) {
      this.loadWorkshopData();
      this.loadIconData()
      this.getWorkshopCategories()
    }
  }
  getDailyCommunicationArray(): FormArray{
    return this.settingsForm.get('evergreenWorkshopMeta.dailyCommunication') as FormArray;
  }
  addDailyCommunication(): void{
    const isEnabled = this.settingsForm.get('evergreenWorkshop')?.value;
    this.getDailyCommunicationArray().push(
      this.fb.control({
        value:'', disabled:!isEnabled
      })
    )
  }
  removeDailyCommunication(index: number):void{
    const arr = this.getDailyCommunicationArray();
    if (arr.length > 1) {
      arr.removeAt(index);
    }
  }
  async getWorkshopCategories() {
    console.log('get categoryconsole',this.workshopId);
    try {
      const workshopCategoryRef = query(collection(this.firestore, 'workshopcategory'),where('workshopid','==',this.workshopId));
      const querySnapshot = await getDocs(workshopCategoryRef);

      this.workshopCategories = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Build map { id: name }
      this.workshopCategoriesMap = this.workshopCategories.reduce((acc, cat) => {
        acc[cat.id] = cat.name;
        return acc;
      }, {} as { [key: string]: string });

    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  async getbigCohorts(){
    try {
      const bigCohortsRef = collection(this.firestore, 'big cohorts');
      const q = query(bigCohortsRef, orderBy('createddate', 'desc'));
      const querySnapshot = await getDocs(q);

      this.bigCohorts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      this.bigCohortsMap = this.bigCohorts.reduce((acc, cat) => {
        acc[cat.id] = cat.name;
        return acc;
      }, {} as { [key: string]: string });

    } catch (error) {
      console.error('Error fetching cohorts:', error);
    }
  }
  getForms(){
    const deliveryforms = query(collection(this.firestore,'delivery forms'),where("formfor",'==','workshop'),orderBy("formname")) 
    getDocs(deliveryforms).then(snap => {
      this.deliveryforms = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.refTitleMap[element['ref'].path] = element['formname']
        return element
      })
      console.log(this.refTitleMap, 'content console');
    });
  }
  getVideoAsk() {
    const videoAskRef = collection(this.firestore, 'arenavideoask');
    collectionSnapshots(videoAskRef).pipe(
      takeUntil(this.subscription)
    ).subscribe(snap => {
      this.videoAsk = snap.map(e => {
        let element = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['title'];
        return element;
      }).filter(e => e['title'] !== undefined);
      
      console.log(this.refTitleMap, 'content console');
    });
  }
  getQuiz() {
    const quizRef = collection(this.firestore, 'quiz');
    collectionSnapshots(quizRef).pipe(
      takeUntil(this.subscription)
    ).subscribe(snap => {
      this.quiz = snap.map(e => {
        let element = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['question'];
        return element;
      })
      
      console.log(this.refTitleMap, 'content console');
    });
  }

  dropActivity(event: CdkDragDrop<FormGroup[]>, curriculum: FormGroup): void {
  const formArray = this.getChallengeArray(curriculum);
  if (event.previousIndex === event.currentIndex) return;

  const prev = formArray.at(event.previousIndex);
  formArray.removeAt(event.previousIndex);
  formArray.insert(event.currentIndex, prev);
}

dropChallenge(curriculum: FormGroup, event: CdkDragDrop<FormGroup[]>) {
  const formArray = curriculum.get('challenges') as FormArray;
  const movingControl = formArray.at(event.previousIndex);
  formArray.removeAt(event.previousIndex);
  formArray.insert(event.currentIndex, movingControl);
  this.rebuildActivityIds();
}

dropChallengeOuter(event: CdkDragDrop<AbstractControl[]>) {
  const challenges = this.challengesPageForm.get('challenges') as FormArray;

  if (event.previousIndex === event.currentIndex) return;

  const moved = challenges.at(event.previousIndex);
  challenges.removeAt(event.previousIndex);
  challenges.insert(event.currentIndex, moved);

  challenges.markAsDirty();
}



  ngOnDestroy(): void {
    Object.values(this.editors).forEach(editor => editor?.destroy());
    Object.values(this.noteeditors).forEach(editor => editor?.destroy());
    Object.values(this.assignmenteditors).forEach(editor => editor?.destroy());
    this.subscription.next();
    this.subscription.complete();
  }

  private initializeForms(): void {
    const richTextControls = {};
    this.richTextFields.forEach(field => {
      richTextControls[field.key] = [
        '', 
        field.required ? Validators.required : null
      ].filter(Boolean);
    });
    const noterichTextControls = {};
    this.settingsForm = this.fb.group({
      active: [false],
      qanda: [false],
      breakdown: [false],
      enableshare: [false],
      triggerFunction:[false],
      activeparticipants: [false],
      evergreenWorkshop:[false],
      evergreenWorkshopMeta: this.fb.group({
        workshopDays: [{ value: null, disabled: true }, [Validators.min(1)]],
        lastChallengeMessage: [{ value: '', disabled: true }],
        dailyCommunication: this.fb.array([
          this.fb.control({value:'',disabled:true})
        ])
      }),
      newusersonly:[false],
      journeybased: [false],
      tierbased:[false],
      categorybased:[false],
      testmode:[false],
      facilitator:[false],
      hero:[false],
      heroHeading: [''],
      heroDescription: [''],
      heroshowtype: [''],
      heroImage: [''], 
      heroVideo:[''],
      testusers: [[],],
      facilitatorprofiles:[[],],
      selectedgroup: [''],
      enrollwattimessage: [''],
      selectedjourneys: [[],],
      selectedtiers: [[],],
      categoriesforthisworkshop:[[],],
      cohortcategoriesforthisworkshop:[[],],
      cohortsforthisworkshop:[[],],
      categorythumbnail :[''],
      categoryVideo :[''],
      mailTemplate: this.fb.group({
        subject: [''],
        description: [''],
        liveCallText: ['']
      })
    });
    this.detailPageForm = this.fb.group({
      title: ['',],
      type: ['',],
      // category: ['',],
      shortdescription: ['',],
      day:['',],
      price:[''],
      enrollbuttonname:['',],
      whyworkshop:['',],
      pricestriked:[''],
      bonussection:[''],
      enablebonus: [false],
      bonushead:[''],
      bonus1:[''],
      bonus2:[''],
      bonusfooter:[''],
      selectedTaxonomies: [[],],
      selectedTestimonials:[[],],
      // selectTemplate:[[],],
      ...richTextControls,
      primarylyTaught: this.fb.array([]),
      thumbnailImage: [''],
      titleVideo: [''],
      // registrationStartDate: ['',],
      // registrationEndDate: ['',],
      // workshopStartDate: ['',],
      // workshopEndDate: ['',],
      registrationStartDate: [''],
      registrationStartTime: [null],
      registrationEndDate:   [''],
      registrationEndTime:   [null],
      workshopStartDate:     [''],
      workshopStartTime:     [null],
      workshopEndDate:       [''],
      workshopEndTime:       [null],
      learnings: this.fb.array([
        this.fb.control('',),
      ]),
      prerequisites:this.fb.array([
        this.fb.control('',),
      ]),
      workshopfor:this.fb.array([
        this.fb.control('',),
      ]),
      workshopoverview: this.fb.array([]),
      sneakpeak: this.fb.array([]),
      knowinfo: this.fb.array([]),
      faq: this.fb.array([]),
    });
  this.detailPageForm.get('selectedTestimonials')?.valueChanges
    .pipe(takeUntil(this.subscription))
    .subscribe((selectedIds: string[]) => {
      this.onTestimonialSelect(selectedIds || []);
    });
    this.challengesPageForm = this.fb.group({
      challenges: this.fb.array([])
    });
  }
  debugFormErrors(): void {
    console.log('=== FORM VALIDATION DEBUG ===');
    console.log('Form valid:', this.detailPageForm.valid);
    console.log('Form invalid:', this.detailPageForm.invalid);
    console.log('Form errors:', this.detailPageForm.errors);
    
    Object.keys(this.detailPageForm.controls).forEach(key => {
      const control = this.detailPageForm.get(key);
      if (control && control.invalid) {
        console.log(`❌ ${key}:`, {
          value: control.value,
          errors: control.errors,
          invalid: control.invalid,
          touched: control.touched,
          dirty: control.dirty
        });
      }
    });

    this.checkFormArrayErrors('learnings');
    this.checkFormArrayErrors('prerequisites');
    this.checkFormArrayErrors('workshopfor');
    this.checkFormArrayErrors('workshopoverview');
    this.checkFormArrayErrors('sneakpeak');
    this.checkFormArrayErrors('knowinfo');
    this.checkFormArrayErrors('faq');
    this.checkFormArrayErrors('primarylyTaught');
  }

  checkFormArrayErrors(arrayName: string): void {
    const formArray = this.detailPageForm.get(arrayName) as FormArray;
    if (formArray && formArray.invalid) {
      console.log(`❌ FormArray ${arrayName}:`, {
        invalid: formArray.invalid,
        errors: formArray.errors
      });
      
      formArray.controls.forEach((control, index) => {
        if (control.invalid) {
          console.log(`  ❌ ${arrayName}[${index}]:`, {
            value: control.value,
            errors: control.errors,
            invalid: control.invalid
          });
        }
      });
    }
  }

  private loadWorkshopData(): void {
    if (!this.workshopId) return;
    const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
    docSnapshots(ref).pipe(
      takeUntil(this.subscription)
    ).subscribe({
      next: (snapshot: DocumentSnapshot<WorkshopConfig>) => {
        if (snapshot.exists()) {
          this.workshopData = snapshot.data() as WorkshopConfig;
          this.patchDetailPageData(this.workshopData);
          this.patchChallengeData(this.workshopData);
          this.patchSettingsData(this.workshopData);
          const jsonString = JSON.stringify(snapshot.data());
          const bytes = new TextEncoder().encode(jsonString).length;
          const kb = bytes / 1024;
          const mb = kb / 1024;
          this.documentsize = `${kb.toFixed(2)} KB / ${mb.toFixed(2)} MB`;
          console.log('Document size:', this.documentsize);
          console.log('workshop docid....',this.workshopData['docid']);
          const workshopCategories: string[] = this.workshopData['categoriesforthisworkshop'] || [];
          const cohortCategories: string[] = this.workshopData['cohortcategoriesforthisworkshop'] || [];

          // this.uniqueWorkshopCategories = Array.from(new Set([...workshopCategories, ...cohortCategories]));
          this.uniqueWorkshopCategories = Array.from(new Set([...workshopCategories]));
          console.log('Unique categories:', this.uniqueWorkshopCategories);

        } else {
          console.error('No such document!');
          this.workshopData = null;
        }
      },
      error: (error) => {
        console.error('Error fetching workshop data:', error);
      }
    });
  }
  private loadIconData(): void {
    collectionSnapshots(
      collection(this.firestore, 'workshop images')
    ).pipe(
      takeUntil(this.subscription)
    ).subscribe(docs => {
      this.iconData = [];
      this.thumbnailData = [];
      docs.forEach(doc => {
        const data = doc.data();
        const docWithId = { id: doc.id, ...data };
        if (data['type'] === 'icon') {
          this.iconData.push(docWithId);
        } else if (data['type'] === 'thumbnail') {
          this.thumbnailData.push(docWithId);
        }
      });
      console.log('Icons:', this.iconData);
      console.log('Thumbnails:', this.thumbnailData);
    });
  }


  private patchDetailPageData(data: WorkshopConfig): void {
    if (!data.detailpage) return;
    const richTextPatches = {};
    this.richTextFields.forEach(field => {
      const content = data.detailpage[field.key] || '';
      richTextPatches[field.key] = content;
      this.richTextContents[field.key] = content;
    });
    if (data.detailpage['testimonialmap']) {
      this.testimonialMap = data.detailpage['testimonialmap'];
    }
    
    this.detailPageForm.patchValue({
      title: data.detailpage.title || '',
      type: data.detailpage.type || '',
      // category: data.detailpage.category || '',
      shortdescription: data.detailpage.shortdescription || '',
      day: data.detailpage.day || '',
      enrollbuttonname: data.detailpage.enrollbuttonname || '',
      price: data.detailpage.price || '',
      pricestriked: data.detailpage.pricestriked || '',
      enablebonus: data.detailpage.enablebonus || false,
      bonussection: data.detailpage.bonussection || '',
      bonushead: data.detailpage.bonushead || '',
      bonus1: data.detailpage.bonus1 || '',
      bonus2: data.detailpage.bonus2 || '',
      bonusfooter: data.detailpage.bonusfooter || '',
      selectedTaxonomies: data.detailpage.selectedTaxonomies || [],
      selectedTestimonials: data.detailpage['testimonialmap'] ? Object.keys(data.detailpage['testimonialmap']) : [],
      selectTemplate: data.detailpage.selectTemplate || [],
      whyworkshop: data.detailpage.whyworkshop || '',
      ...richTextPatches,
      thumbnailImage: data.detailpage.thumbnailImage || '',
      titleVideo: data.detailpage.titleVideo || '',
      registrationStartDate: this.convertTimestamp(data.detailpage.registrationStartDate),
      registrationEndDate: this.convertTimestamp(data.detailpage.registrationEndDate),
      workshopStartDate: this.convertTimestamp(data.detailpage.workshopStartDate),
      workshopEndDate: this.convertTimestamp(data.detailpage.workshopEndDate),
      registrationStartTime: this.convertTimestamp(data.detailpage.registrationStartDate),
      registrationEndTime:   this.convertTimestamp(data.detailpage.registrationEndDate),
      workshopStartTime:     this.convertTimestamp(data.detailpage.workshopStartDate),
      workshopEndTime:       this.convertTimestamp(data.detailpage.workshopEndDate),
    });

    const primarylyTaughtArray = this.getFormArray('primarylyTaught');
    primarylyTaughtArray.clear();
    data.detailpage.primarylyTaught?.forEach(skill => {
      primarylyTaughtArray.push(this.fb.control(skill));
    });

    this.fieldSections.forEach(section => {
      const array = this.getFormArray(section.key);
      array.clear();
      (data.detailpage[section.key] || []).forEach((value: string) => {
        array.push(this.fb.control(value));
      });
    });

    this.iconWithTextSections.forEach(section => {
      const array = this.getFormArray(section.key);
      array.clear();
      (data.detailpage[section.key] || []).forEach((item: any) => {
        const group = this.fb.group({
          question: [item.question || '',],
          answer: [item.answer || '',]
        });
        array.push(group);
      });
    });
  }

  onEditorContentChange(content: string, fieldKey: string): void {
    if (this.richTextContents[fieldKey] !== content) {
      this.richTextContents[fieldKey] = content;
      this.detailPageForm.patchValue({ [fieldKey]: content });
    }
  }
  

  getRichTextField(key: string) {
    return this.richTextFields.find(field => field.key === key);
  }


  addChip(event: MatChipInputEvent): void {
    const input = event.input;
    const value = event.value?.trim();
    const exists = this.primarylyTaughtArray.value.includes(value);
    if (value && !exists) {
      this.primarylyTaughtArray.push(this.fb.control(value));
    }

    if (input) {
      input.value = '';
    }
  }

  removeChip(index: number): void {
    if (index >= 0) {
      this.primarylyTaughtArray.removeAt(index);
    }
  }

  private convertTimestamp(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) {
      return value.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return value;
  }

    getFormArray(key: string): FormArray {
      return this.detailPageForm.get(key) as FormArray;
    }

    addIconWithText(key: string, maxItems: number): void {
      const formArray = this.getFormArray(key);
      if (formArray.length >= maxItems) {
        this.snackBar.open('Limit exceeded.', 'Close', { duration: 3000 });
        return;
      }
      const group = this.fb.group({
        question: ['',],
        answer: ['',]
      });
      formArray.push(group);
    }

    removeIconWithText(key: string, index: number): void {
      const formArray = this.getFormArray(key);
      if (index >= 0) formArray.removeAt(index);
    }

  addField(key: string): void {
    const formArray = this.detailPageForm.get(key) as FormArray;
    const allFilled = formArray.controls.every(control => control.value && control.valid);

    if (allFilled) {
      formArray.push(this.fb.control('',));
    } else {
      this.snackBar.open('Please fill all existing fields before adding more.', 'Close', { duration: 3000 });
    }
  }

  removeField(key: string, index: number, minMessage: string): void {
    const formArray = this.detailPageForm.get(key) as FormArray;
    formArray.removeAt(index);
  }

  isAllFilled(key: string): boolean {
    const formArray = this.detailPageForm.get(key) as FormArray;
    return formArray.controls.every(control => control.value && control.valid);
  }

  get primarylyTaughtArray(): FormArray {
    return this.detailPageForm.get('primarylyTaught') as FormArray;
  }

  addSkill(): void {
    this.primarylyTaughtArray.push(this.fb.control(''));
  }

  removeSkill(index: number): void {
    this.primarylyTaughtArray.removeAt(index);
  }

  onMenuChange(menu: 'detailpage' | 'challenges'  | 'challengesettings' |'payment'): void {
    this.selectedMenu = menu;
  }
  drop(event: CdkDragDrop<FormArray>, key: string): void {
    if (event.previousIndex === event.currentIndex) return;

    const formArray = this.detailPageForm.get(key) as FormArray;
    if (!formArray) return;

    const item = formArray.at(event.previousIndex);
    formArray.removeAt(event.previousIndex);
    formArray.insert(event.currentIndex, item);
  }

  // private buildDetailPageData(): any {
  //   const formValue = this.detailPageForm.value;
  //   const data = { ...formValue };
  //   this.richTextFields.forEach(field => {
  //     data[field.key] = this.richTextContents[field.key];
  //   });
  //   this.iconWithTextSections.forEach(section => {
  //     data[section.key] = this.getFormArray(section.key).value.map(item => ({
  //       question: item.question,
  //       answer: item.answer
  //     }));
  //   });

  //   return data;
  // }

  private mergeDateTime(date: Date, time: Date): Date | null {
    if (!date) return null;
    const merged = new Date(date);
    if (time) {
      merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
    }
    return merged;
  }
  // private buildDetailPageData(): any {
  //   const formValue = this.detailPageForm.value;
  //   const data = { ...formValue };
    
  //   this.richTextFields.forEach(field => {
  //     data[field.key] = this.richTextContents[field.key];
  //   });
    
  //   this.iconWithTextSections.forEach(section => {
  //     data[section.key] = this.getFormArray(section.key).value.map(item => ({
  //       question: item.question,
  //       answer: item.answer
  //     }));
  //   });

    
  //   delete data.selectedTestimonials;
  //   data.testimonialmap = this.testimonialMap;

  //   return data;
  // }
  private buildDetailPageData(): any {
    const formValue = this.detailPageForm.value;
    const data = { ...formValue };

    this.richTextFields.forEach(field => {
      data[field.key] = this.richTextContents[field.key];
    });

    this.iconWithTextSections.forEach(section => {
      data[section.key] = this.getFormArray(section.key).value.map(item => ({
        question: item.question,
        answer: item.answer
      }));
    });

    delete data.selectedTestimonials;
    data.testimonialmap = this.testimonialMap;
    const merge = (date: Date, time: Date) => {
      const d = this.mergeDateTime(date, time);
      return d ? Timestamp.fromDate(d) : null;
    };

    data.registrationStartDate = merge(data.registrationStartDate, data.registrationStartTime);
    data.registrationEndDate   = merge(data.registrationEndDate,   data.registrationEndTime);
    data.workshopStartDate     = merge(data.workshopStartDate,     data.workshopStartTime);
    data.workshopEndDate       = merge(data.workshopEndDate,       data.workshopEndTime);
    delete data.registrationStartTime;
    delete data.registrationEndTime;
    delete data.workshopStartTime;
    delete data.workshopEndTime;
    return data;
  }
  
  uploadThumbnail(): void {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*'; // Accept only images
      fileInput.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
              const fileRef = ref(this.storage, `workshop/thumbnail/${file.name}`);
              try {
                  await uploadBytes(fileRef, file);
                  const downloadURL = await getDownloadURL(fileRef);
                  this.detailPageForm.patchValue({ thumbnailImage: downloadURL });
                  this.snackBar.open('Thumbnail uploaded successfully!', 'Close', { duration: 2000 });
              } catch (error) {
                  console.error('Error uploading thumbnail:', error);
                  this.snackBar.open('Error uploading thumbnail. Please try again.', 'Close', { duration: 2000 });
              }
          }
      };
      fileInput.click();
  }
  uploadcategoryThumbnail(): void {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*'; // Accept only images
      fileInput.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
              const fileRef = ref(this.storage, `workshop/thumbnail/${file.name}`);
              try {
                  await uploadBytes(fileRef, file);
                  const downloadURL = await getDownloadURL(fileRef);
                  this.settingsForm.patchValue({ categorythumbnail: downloadURL });
                  this.snackBar.open('Thumbnail uploaded successfully!', 'Close', { duration: 2000 });
              } catch (error) {
                  console.error('Error uploading thumbnail:', error);
                  this.snackBar.open('Error uploading thumbnail. Please try again.', 'Close', { duration: 2000 });
              }
          }
      };
      fileInput.click();
  }
  uploadVideo(): void {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'video/*'; // Accept only videos
      fileInput.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
              const fileRef = ref(this.storage, `workshop/video/${file.name}`);
              try {
                  await uploadBytes(fileRef, file);
                  const downloadURL = await getDownloadURL(fileRef);
                  this.detailPageForm.patchValue({ titleVideo: downloadURL });
                  this.snackBar.open('Video uploaded successfully!', 'Close', { duration: 2000 });
              } catch (error) {
                  console.error('Error uploading video:', error);
                  this.snackBar.open('Error uploading video. Please try again.', 'Close', { duration: 2000 });
              }
          }
      };
      fileInput.click();
  }
  
    uploadcategoryVideo(): void {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'video/*';
      fileInput.onchange = async (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
              const fileRef = ref(this.storage, `workshop/video/${file.name}`);
              try {
                  await uploadBytes(fileRef, file);
                  const downloadURL = await getDownloadURL(fileRef);
                  this.settingsForm.patchValue({ categoryVideo: downloadURL });
                  this.snackBar.open('Video uploaded successfully!', 'Close', { duration: 2000 });
              } catch (error) {
                  console.error('Error uploading video:', error);
                  this.snackBar.open('Error uploading video. Please try again.', 'Close', { duration: 2000 });
              }
          }
      };
      fileInput.click();
  }
  


  async saveDetailPage(refresh: boolean = true): Promise<void> {
  if (!this.workshopId) return;
  console.log(this.detailPageForm.value, "submitting");
  if (this.detailPageForm.invalid) {
    console.log('⚠️ Form is invalid, debugging...');
    this.debugFormErrors();
  }

  if (this.detailPageForm.valid) {
    this.loading = true;
    this.isSaving = true;
    try {
      const detailPageData = this.buildDetailPageData();
      const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      await updateDoc(ref, { detailpage: detailPageData });

      if (refresh) {
        // this.snackBar.open('Detail page configuration saved successfully!', 'Close', { duration: 1000 });
        // this.refetchWorkshop(); // optional
      }

    } catch (error) {
      console.error('Error saving detail page:', error);
      this.snackBar.open('Error saving configuration. Please try again.', 'Close', {
        duration: 1000
      });
    } finally {
      this.isSaving = false;
      this.loading = false;
    }
  } else {
    this.snackBar.open('Please fill in all required fields.', 'Close', {
      duration: 1000
    });
  }
}

  get challengesArray(): FormArray {
    return this.challengesPageForm.get('challenges') as FormArray;
  }

  addCurriculum(): void {
    const curriculumGroup = this.fb.group({
      type: ['', Validators.required],
      challengeid: [this.generateId()],
      zoomlink: [''],
      status: [undefined],
      hidezoom: [null],
      completedzoomurl:[''],
      headicon:[''],
      heading: [''],
      subheading: [''],
      workshopcategory:[[]],
      facilitator:[[]],
      facilitatoronly:[null],
      description: [''],
      duedate: [''],
      duetime:[''],
      startdate: [''],       
      starttime: [''], 
      startlivecall:[''],
      challenges: this.fb.array([]) 
    });
    
    // this.challengesArray.push(curriculumGroup);

    const newIndex = this.challengesArray.length;
    this.challengesArray.push(curriculumGroup);
    
    this.challengeExpanded[newIndex] = true; 
 }
  removeCurriculum(index: number): void {
    const confirmDelete = confirm("Are you sure you want to delete this entire curriculum?");
    if (!confirmDelete) return;

    this.challengesArray.removeAt(index);
  }


  getCurriculumControls(): any[] {
    return this.challengesArray.controls;
  }
  getChallengeArray(curriculumGroup) {
    return (curriculumGroup.get('challenges'));
  }

  addSubChallenge(curriculumGroup) {
    const challengeIndex = this.challengesArray.controls.indexOf(curriculumGroup);
    const activityIndex = this.getChallengeArray(curriculumGroup).length;
    const challengeGroup = this.fb.group({
      challengeid: [this.generateId()], 
      zoomattend: [[]], 
      name: ['',],
      description: ['',],
      type:['',],
      startdate: [''],
      starttime: [''],
      contentref: [null], 
      quizref: [[]],
      thumbnail:['',],
      assignmenttype:['',],
      reviewassignemnt:[null,],
      previewvideo:[null,],
      uploadedresource:['',],
      uploadedresourcetitle:[''],
      uploadedfilename: [''],
      submissionformat:['',],
      assignmenttopic:['',],
      rewardhead:['',],
      rewarddescription:[''],
      evolutionmappingtitle:['',],
      evolutionmappingdescription:['',],
      finalevolution:[null,],
      finalevolutiontype:['',],
      rewardlink:[''],
      notehead:['',],
      notedescription:[''],
      notedescriptionrich: [''],
      assignmentdescriptionrich: [''],
      assignmentdescription:['',],
      uploadtype:['',],
      zoomlinkchallenge:['',],
      meetdate:['',],
      finalbeforeafter: [false]
      
    });

    this.getChallengeArray(curriculumGroup).push(challengeGroup);
    this.initializeNoteEditor(challengeIndex, activityIndex);
  }
  // removeSubChallenge(curriculumGroup, index) {
  //   const confirmDelete = confirm("Are you sure you want to delete this sub-challenge?");
  //   if (confirmDelete) {
  //   console.log("delete sub");
  //   const challengeArray = this.getChallengeArray(curriculumGroup);
  //   const challengeToRemove = challengeArray.at(index);
  //   const challengeIndex = this.challengesArray.controls.indexOf(curriculumGroup);
    
  //   if (challengeToRemove && challengeIndex !== -1) {
  //     const activityId = this.generateActivityId(challengeIndex, index);
  //     const hadEvolutionMapping = challengeToRemove.get('finalevolution')?.value;
  //     const evolutionType = challengeToRemove.get('finalevolutiontype')?.value;
  //     if (hadEvolutionMapping) {
  //       this.evolutionMappingCount = Math.max(0, this.evolutionMappingCount - 1);
  //       this.evolutionMappingActivities = this.evolutionMappingActivities.filter(id => id !== activityId);
  //       delete this.selectedEvolutionTypes[activityId];
  //     }
  //     this.destroyNoteEditor(challengeIndex, index);
  //   }
  //   challengeArray.removeAt(index);
  //   this.rebuildActivityIds(); 
  //   }
  // }
  generateId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
removeSubChallenge(curriculumGroup, index) {
  const confirmDelete = confirm("Are you sure you want to delete this sub-challenge?");
  if (!confirmDelete) return;

  console.log("delete sub");
  const challengeArray = this.getChallengeArray(curriculumGroup);
  const challengeToRemove = challengeArray.at(index);
  const challengeIndex = this.challengesArray.controls.indexOf(curriculumGroup);

  if (challengeToRemove && challengeIndex !== -1) {
    const activityId = this.generateActivityId(challengeIndex, index);
    const hadEvolutionMapping = challengeToRemove.get('finalevolution')?.value;
    const evolutionType = challengeToRemove.get('finalevolutiontype')?.value;

    if (hadEvolutionMapping) {
      this.evolutionMappingCount = Math.max(0, this.evolutionMappingCount - 1);
      this.evolutionMappingActivities = this.evolutionMappingActivities.filter(id => id !== activityId);
      delete this.selectedEvolutionTypes[activityId];
    }
    this.destroyNoteEditor(challengeIndex, index);
    this.destroyAssignmentEditor(challengeIndex, index);
  }
  this.reindexNoteEditorsAfterRemoval(challengeIndex);
  this.reindexAssignmentEditorsAfterRemoval(challengeIndex);
  challengeArray.removeAt(index);
  this.rebuildActivityIds();
}
private reindexAssignmentEditorsAfterRemoval(challengeIndex: number): void {
  const curriculumGroup = this.challengesArray.at(challengeIndex);
  const challengeArray = this.getChallengeArray(curriculumGroup);
  const tempEditors: { [key: number]: { editor: Editor, content: string } } = {};
  
  for (let i = 0; i < challengeArray.length + 1; i++) {
    const oldKey = this.getAssignmentEditorKey(challengeIndex, i);
    if (this.assignmenteditors[oldKey]) {
      tempEditors[i] = {
        editor: this.assignmenteditors[oldKey],
        content: this.assignmentrichTextContents[oldKey]
      };
    }
  }

  Object.keys(this.assignmenteditors).forEach(key => {
    if (key.startsWith(`assignment_editor_${challengeIndex}_`)) {
      delete this.assignmenteditors[key];
      delete this.assignmentrichTextContents[key];
    }
  });
  
  // Re-assign editors with correct indices
  Object.keys(tempEditors).forEach(oldIndexStr => {
    const oldIndex = parseInt(oldIndexStr);
    if (tempEditors[oldIndex]) {
      const newKey = this.getAssignmentEditorKey(challengeIndex, oldIndex);
      this.assignmenteditors[newKey] = tempEditors[oldIndex].editor;
      this.assignmentrichTextContents[newKey] = tempEditors[oldIndex].content;
    }
  });
}
private reindexNoteEditorsAfterRemoval(challengeIndex: number): void {
  const curriculumGroup = this.challengesArray.at(challengeIndex);
  const challengeArray = this.getChallengeArray(curriculumGroup);
  const tempEditors: { [key: number]: { editor: Editor, content: string } } = {};
  
  for (let i = 0; i < challengeArray.length + 1; i++) {
    const oldKey = this.getNoteEditorKey(challengeIndex, i);
    if (this.noteeditors[oldKey]) {
      tempEditors[i] = {
        editor: this.noteeditors[oldKey],
        content: this.noterichTextContents[oldKey]
      };
    }
  }

  Object.keys(this.noteeditors).forEach(key => {
    if (key.startsWith(`note_editor_${challengeIndex}_`)) {
      delete this.noteeditors[key];
      delete this.noterichTextContents[key];
    }
  });
  
  // Re-assign editors with correct indices
  Object.keys(tempEditors).forEach(oldIndexStr => {
    const oldIndex = parseInt(oldIndexStr);
    if (tempEditors[oldIndex]) {
      const newKey = this.getNoteEditorKey(challengeIndex, oldIndex);
      this.noteeditors[newKey] = tempEditors[oldIndex].editor;
      this.noterichTextContents[newKey] = tempEditors[oldIndex].content;
    }
  });
}
private rebuildActivityIds(): void {
  const newSelectedTypes = {};
  const newEvolutionMappingActivities = [];
  
  this.challengesArray.controls.forEach((curriculumGroup, challengeIndex) => {
    const challengeArray = this.getChallengeArray(curriculumGroup);
    
    challengeArray.controls.forEach((subChallenge, activityIndex) => {
      const oldActivityPattern = new RegExp(`challenge_${challengeIndex}_activity_\\d+`);
      const newActivityId = this.generateActivityId(challengeIndex, activityIndex);
      
      if (subChallenge.get('finalevolution')?.value) {
        newEvolutionMappingActivities.push(newActivityId);
        
        const evolutionType = subChallenge.get('finalevolutiontype')?.value;
        if (evolutionType) {
          newSelectedTypes[newActivityId] = evolutionType;
        }
      }
    });
  });
  
  this.selectedEvolutionTypes = newSelectedTypes;
  this.evolutionMappingActivities = newEvolutionMappingActivities;
}

  removeQuizFromSelection(subChallengeGroup: FormGroup, index: number): void {
    const quizrefArray = subChallengeGroup.get('quizref')?.value || [];
    quizrefArray.splice(index, 1);
    subChallengeGroup.get('quizref')?.setValue(quizrefArray);
  }
  onTypeChange(challengeGroup) {
    challengeGroup.get('contentref')?.setValue(null);
    challengeGroup.get('quizref')?.setValue([]); 
    challengeGroup.get('thumbnail')?.setValue(null);
    challengeGroup.get('zoomlinkchallenge')?.setValue(null);
    challengeGroup.get('meetdate')?.setValue(null);
    challengeGroup.get('assignmenttype')?.setValue(null);
    challengeGroup.get('reviewassignemnt')?.setValue(null);
    challengeGroup.get('previewvideo')?.setValue(null);
    challengeGroup.get('uploadedresource')?.setValue(null);
    challengeGroup.get('uploadedresourcetitle')?.setValue(null);
    challengeGroup.get('uploadedfilename')?.setValue(null);
    challengeGroup.get('rewardhead')?.setValue(null);
    challengeGroup.get('rewarddescription')?.setValue(null);
    challengeGroup.get('evolutionmappingtitle')?.setValue(null);
    challengeGroup.get('evolutionmappingdescription')?.setValue(null);
    challengeGroup.get('finalevolution')?.setValue(null);
    challengeGroup.get('finalevolutiontype')?.setValue(null);
    challengeGroup.get('rewardlink')?.setValue(null);
    challengeGroup.get('notehead')?.setValue(null);
    challengeGroup.get('notedescription')?.setValue(null);
    challengeGroup.get('assignmenttopic')?.setValue(null);
    challengeGroup.get('assignmentdescription')?.setValue(null);
    challengeGroup.get('submissionformat')?.setValue(null);
    challengeGroup.get('uploadtype')?.setValue(null);
    challengeGroup.get('meetdate')?.setValue(null);
  }
  private patchChallengeData(data: WorkshopConfig): void {
  if (!data.challenges) return;    
  const challengesArray = this.challengesArray;
  challengesArray.clear();
  
  // Reset tracking variables
  this.evolutionMappingCount = 0;
  this.selectedEvolutionTypes = {};
  this.evolutionMappingActivities = [];
  
  data.challenges.forEach((challenge: CurriculumItem, challengeIndex: number) => {
    const curriculumGroup = this.fb.group({
      type: [challenge.type || ''],
      challengeid: [challenge['challengeid'] || this.generateId()],
      zoomattend: [challenge['zoomattend'] || []],
      zoomlink: [challenge.zoomlink || ''],
      completedzoomurl: [challenge.completedzoomurl || ''],
      // status: [challenge.status ?? null],
      status: [challenge.status || undefined],
      hidezoom: [challenge.hidezoom ?? false],
      startlivecall: [challenge.startlivecall || ''],
      headicon:[challenge.headicon || ''],
      heading: [challenge.heading || ''],
      subheading: [challenge.subheading || ''],
      workshopcategory: [challenge.workshopcategory || []],
      facilitator: [challenge.facilitator || []],
      facilitatoronly: [challenge.facilitatoronly ?? false],
      description: [challenge.description || ''],
      duedate: [this.convertTimestamp(challenge.duedate)],
      duetime: [this.convertTimestamp(challenge.duetime)],
      startdate: [this.convertTimestamp(challenge.startdate) || ''],
      starttime: [this.convertTimestamp(challenge.starttime) || ''], 
      challenges: this.fb.array([]),
    });
    
    const subChallengeArray = curriculumGroup.get('challenges') as FormArray;
    (challenge.challenges || []).forEach((c, activityIndex: number) => {
      if (c.finalevolution) {
        const activityId = this.generateActivityId(challengeIndex, activityIndex);
        this.evolutionMappingCount++;
        this.evolutionMappingActivities.push(activityId);
        if (c.finalevolutiontype) {
          this.selectedEvolutionTypes[activityId] = c.finalevolutiontype;
        }
      }
      this.initializeNoteEditor(challengeIndex, activityIndex);
      const editorKey = this.getNoteEditorKey(challengeIndex, activityIndex);
      if (c.notedescriptionrich) {
        this.noterichTextContents[editorKey] = c.notedescriptionrich;
      }
      const editorKeyAssignment = this.getAssignmentEditorKey(challengeIndex, activityIndex);
      if (c.assignmentdescriptionrich) {
        this.assignmentrichTextContents[editorKeyAssignment] = c.assignmentdescriptionrich;
      }
      subChallengeArray.push(
        this.fb.group({
          name: [c.name || ''],
          challengeid: [c['challengeid'] || this.generateId()],
          zoomattend: [c['zoomattend']], 
          description: [c.description || ''],
          type:[c.type || ''],
          contentref: [c.contentref ||''],
          quizref: [c.quizref || []], 
          thumbnail:[c.thumbnail || ''],
          assignmenttype:[c.assignmenttype || ''],
          reviewassignemnt:[c.reviewassignemnt || null],
          previewvideo:[c.previewvideo || null],
          uploadedresource:[c.uploadedresource || ''],
          uploadedresourcetitle:[c.uploadedresourcetitle || ''],
          uploadedfilename:[c.uploadedfilename || ''],
          submissionformat:[c.submissionformat || ''],
          assignmenttopic:[c.assignmenttopic || ''],
          rewardhead:[c.rewardhead || ''],
          rewarddescription : [c.rewarddescription || ''],
          evolutionmappingtitle:[c.evolutionmappingtitle || ''],
          evolutionmappingdescription : [c.evolutionmappingdescription || ''],
          finalevolution:[c.finalevolution || null],
          finalevolutiontype : [c.finalevolutiontype || ''],
          rewardlink : [c.rewardlink || ''],
          notehead:[c.notehead || ''],
          notedescription : [c.notedescription || ''],
          notedescriptionrich: [c.notedescriptionrich || ''],
          assignmentdescriptionrich: [c.assignmentdescriptionrich || ''],
          assignmentdescription:[c.assignmentdescription || ''],
          uploadtype:[c.uploadtype || ''],
          zoomlinkchallenge:[c.zoomlinkchallenge || ''],
          meetdate:[this.convertTimestamp(c.meetdate) || ''],
          finalbeforeafter: [c.finalbeforeafter || false]
        })
      );
    });
    challengesArray.push(curriculumGroup);
  });
}

  uploadResource(subChallengeGroup: FormGroup): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '*/*';

    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const fileRef = ref(this.storage, `workshop/resource/${file.name}`);
        try {
          await uploadBytes(fileRef, file);
          const downloadURL = await getDownloadURL(fileRef);
          subChallengeGroup.get('uploadedresource')?.setValue(downloadURL);
          subChallengeGroup.get('uploadedfilename')?.setValue(file.name);

          this.snackBar.open('Uploaded successfully!', 'Close', { duration: 2000 });
        } catch (error) {
          console.error('Error uploading:', error);
          this.snackBar.open('Error uploading. Please try again.', 'Close', { duration: 2000 });
        }
      }
    };

    fileInput.click();
  }
  openResourceLink(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  async saveChallengesPage(refresh: boolean = true): Promise<void> {
  if (!this.workshopId) return;

  if (this.challengesPageForm.valid) {
    this.loading = true;
    this.isSaving = true;
    try {
      const challengesData = this.challengesPageForm.value.challenges.map((challenge: any) => {
        const cleaned = { ...challenge };
        if (!cleaned.status) {
          delete cleaned.status;
        }
        return cleaned;
      });

      const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      await updateDoc(ref, { challenges: challengesData });
      // const challengesData = this.challengesPageForm.value.challenges;
      // const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      // await updateDoc(ref, { challenges: challengesData });

      // if (refresh) {
      //   // this.snackBar.open('Challenges configuration saved successfully!', 'Close', { duration: 2000 });
      //   // this.refetchWorkshop(); // (example only)
      // }

    } catch (error) {
      console.error('Error saving challenges:', error);
      this.snackBar.open('Error saving configuration. Please try again.', 'Close', {
        duration: 2000
      });
    } finally {
      this.isSaving = false;
      this.loading = false;
    }
  } else {
    this.snackBar.open('Please fill in all required fields.', 'Close', {
      duration: 2000
    });
  }
}


  routing(routeto,id) {
    if (routeto === 'addimage') {
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/workshop_image_upload'])
      );
      window.open(url, '_blank');
    } else if(routeto === 'dashboard'){
      window.open(`/workshop_dashboard/${this.workshopId}`, '_blank');
      // const url = this.router.serializeUrl(
      //   this.router.createUrlTree(['/workshop_dashboard'], {
      //     queryParams: { workshopId: this.workshopId }
      //   })
      // );
      // window.open(url, '_blank');
    }

  }

  compareFn(a,b){
    return a && b ? a.id === b.id : false
  }
  open(type){
    if (type ==='form') {
      const dialogRef = this.dialog.open(UpdateDeliveryComponent, {
        data: null,
        disableClose: true,
        maxWidth: '100%',
        maxHeight: '100%',
        height: '90%',
        width: '90%',
        panelClass: 'full-screen-modal',
      })
      dialogRef.afterClosed().subscribe(result => {
        this.getForms();
      }); 
    } else if(type === 'videoask'){
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/createarenavideoasktemplate'])
      );
      window.open(url, '_blank');
    } else if (type ==='quiz') {
      const dialogRef = this.dialog.open(QuizComponent, {
        data: null,
        disableClose: true,
        height: '90vh',
        width: '90vw',
        maxWidth: '1200px',
        maxHeight: '800px'
      });
      dialogRef.afterClosed().subscribe(result => {
        this.getQuiz();
      }); 
    }
  }
  patchSettingsData(data: WorkshopConfig): void {
    if (data && typeof data === 'object') {
      this.settingsForm.patchValue({
        active: data['active'] || false,
        qanda: data['qanda'] || false,
        breakdown: data['breakdown'] || false,
        enableshare: data['enableshare'] || false,
        triggerFunction: data['triggerFunction'] || false,
        activeparticipants: data['activeparticipants'] || false,
        evergreenWorkshop: data['evergreenWorkshop'] || false,
        evergreenWorkshopMeta: {
          workshopDays: data['evergreenWorkshopMeta']?.workshopDays ?? null,
          lastChallengeMessage: data['evergreenWorkshopMeta']?.lastChallengeMessage ?? '',
        },
        newusersonly: data['newusersonly'] || false,
        journeybased: data['journeybased'] || false,
        tierbased: data['tierbased'] || false,
        categorybased: data['categorybased'] || false,
        testmode: data['testmode'] || false,
        facilitator: data['facilitator'] || false,
        testusers: data['testusers'] || [],
        facilitatorprofiles: data['facilitatorprofiles'] || [],
        selectedgroup: data['selectedgroup'] || null,
        enrollwattimessage: data['enrollwattimessage'] || null,
        mailTemplate: data['mailTemplate'] || null,
        selectedjourneys: data['selectedjourneys'] || [],
        selectedtiers: data['selectedtiers'] || [],
        categoriesforthisworkshop: data['categoriesforthisworkshop'] || [],
        cohortcategoriesforthisworkshop: data['cohortcategoriesforthisworkshop'] || [],
        cohortsforthisworkshop: data['cohortsforthisworkshop'] || [],
        categorythumbnail: data['categorythumbnail'] || '',
        categoryVideo: data['categoryVideo'] || '',
        hero: data['hero'] || false,
        heroHeading: data['heroHeading'] || '',
        heroDescription: data['heroDescription'] || '',
        heroshowtype: data['heroshowtype'] || '',
        heroImage: data['heroImage'] || '',
        heroVideo: data['heroVideo'] || '',
      });
      const isEvergreenEnabled = !!data['evergreenWorkshop'];
      const dailyComms: string[] = data['evergreenWorkshopMeta']?.dailyCommunication?.length
        ? data['evergreenWorkshopMeta'].dailyCommunication
        : [''];
      const dailyArray = this.getDailyCommunicationArray();
      dailyArray.clear();
      dailyComms.forEach(msg => {
        dailyArray.push(this.fb.control({ value: msg, disabled: !isEvergreenEnabled }));
      });

      if (isEvergreenEnabled) {
        const meta = this.settingsForm.get('evergreenWorkshopMeta') as FormGroup;
        meta.get('workshopDays')?.enable();
        meta.get('lastChallengeMessage')?.enable();
        dailyArray.controls.forEach(c => c.enable());
      }
    }
  }
  // patchSettingsData(data: WorkshopConfig): void {
  //   if (data && typeof data === 'object') {
  //     this.settingsForm.patchValue({
  //       active: data['active'] || false,
  //       qanda: data['qanda'] || false,
  //       breakdown : data['breakdown'] || false,
  //       enableshare: data['enableshare'] || false,
  //       triggerFunction: data['triggerFunction'] || false,
  //       activeparticipants : data['activeparticipants'] || false,
  //       evergreenWorkshop : data['evergreenWorkshop'] || false, 
  //       evergreenWorkshopMeta: {
  //         workshopDays: data['evergreenWorkshopMeta']?.workshopDays ?? null,
  //         lastChallengeMessage: data['evergreenWorkshopMeta']?.lastChallengeMessage ?? '',
  //       },
  //       newusersonly : data['newusersonly'] || false,
  //       journeybased: data['journeybased'] || false,
  //       tierbased: data['tierbased'] || false,
  //       categorybased: data['categorybased'] || false,
  //       testmode: data['testmode'] || false,
  //       facilitator: data['facilitator'] || false,
  //       testusers: data['testusers'] || [],
  //       facilitatorprofiles: data['facilitatorprofiles'] || [],
  //       selectedgroup : data['selectedgroup'] || null,
  //       enrollwattimessage: data['enrollwattimessage'] || null,
  //       mailTemplate :data['mailTemplate'] || null,
  //       selectedjourneys:data['selectedjourneys'] || [],
  //       selectedtiers:data['selectedtiers'] || [],
  //       categoriesforthisworkshop:data['categoriesforthisworkshop'] || [],
  //       cohortcategoriesforthisworkshop:data['cohortcategoriesforthisworkshop'] || [],
  //       cohortsforthisworkshop:data['cohortsforthisworkshop'] || [],
  //       categorythumbnail : data['categorythumbnail'] || '',
  //       categoryVideo : data['categoryVideo'] || '',
  //       hero: data['hero'] || false,
  //       heroHeading: data['heroHeading'] || '',
  //       heroDescription: data['heroDescription'] || '',
  //       heroshowtype: data['heroshowtype'] || '',
  //       heroImage: data['heroImage'] || '',
  //       heroVideo:  data['heroVideo'] || '',
  //     });
  //     if (data['evergreenWorkshop']) {
  //       const meta = this.settingsForm.get('evergreenWorkshopMeta') as FormGroup;
  //       meta.get('workshopDays')?.enable();
  //       meta.get('lastChallengeMessage')?.enable();
  //     }
  //   }
  // }

  async saveSettings(): Promise<void> {
    if (!this.workshopId) return;

    try {
      this.loading = true;
      const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      await updateDoc(ref, { 
        active: this.settingsForm.get('active')?.value || false,
        qanda: this.settingsForm.get('qanda')?.value || false,
        breakdown: this.settingsForm.get('breakdown')?.value || false,
        enableshare: this.settingsForm.get('enableshare')?.value || false,
        triggerFunction: this.settingsForm.get('triggerFunction')?.value || false,
        activeparticipants: this.settingsForm.get('activeparticipants')?.value || false,
        evergreenWorkshop: this.settingsForm.get('evergreenWorkshop')?.value || false,
        evergreenWorkshopMeta: this.settingsForm.get('evergreenWorkshopMeta')?.value ?? null,
        newusersonly: this.settingsForm.get('newusersonly')?.value || false,
        journeybased: this.settingsForm.get('journeybased')?.value || false,
        tierbased: this.settingsForm.get('tierbased')?.value || false,
        categorybased: this.settingsForm.get('categorybased')?.value || false,
        testmode: this.settingsForm.get('testmode')?.value || false,
        facilitator: this.settingsForm.get('facilitator')?.value || false,
        facilitatorprofiles: this.settingsForm.get('facilitatorprofiles')?.value || [],
        selectedgroup: this.settingsForm.get('selectedgroup')?.value || null,
        enrollwattimessage: this.settingsForm.get('enrollwattimessage')?.value || null,
        mailTemplate: this.settingsForm.get('mailTemplate')?.value || null,
        testusers: this.settingsForm.get('testusers')?.value || [],
        selectedjourneys: this.settingsForm.get('selectedjourneys')?.value || [],
        selectedtiers: this.settingsForm.get('selectedtiers')?.value || [],
        categoriesforthisworkshop: this.settingsForm.get('categoriesforthisworkshop')?.value || [],
        cohortcategoriesforthisworkshop: this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [],
        cohortsforthisworkshop: this.settingsForm.get('cohortsforthisworkshop')?.value || [],
        categorythumbnail : this.settingsForm.get('categorythumbnail')?.value || '',
        categoryVideo : this.settingsForm.get('categoryVideo')?.value || '',
        hero: this.settingsForm.get('hero')?.value || false,
        heroHeading: this.settingsForm.get('heroHeading')?.value || '',
        heroDescription: this.settingsForm.get('heroDescription')?.value || '',
        heroshowtype: this.settingsForm.get('heroshowtype')?.value || '',
        heroImage: this.settingsForm.get('heroImage')?.value || '',
        heroVideo: this.settingsForm.get('heroVideo')?.value || '',
      });
      
      this.snackBar.open('Settings saved successfully!', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Error saving settings:', error);
      this.snackBar.open('Error saving settings. Please try again.', 'Close', { duration: 2000 });
    } finally {
      this.loading = false;
    }
  }

  async onHeroImageUpload(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    const filePath = `workshops/${this.workshopId}/hero_${Date.now()}`;
    const fileRef = ref(this.storage, filePath);

    try {
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      this.settingsForm.get('heroImage')?.setValue(downloadURL);
    } catch (error) {
      console.error('Image upload failed:', error);
      this.snackBar.open('Image upload failed', 'Close', { duration: 2000 });
    }
  }
  async onHeroVideoUpload(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    const filePath = `workshops/${this.workshopId}/hero_${Date.now()}`;
    const fileRef = ref(this.storage, filePath);

    try {
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      this.settingsForm.get('heroVideo')?.setValue(downloadURL);
    } catch (error) {
      console.error('Video upload failed:', error);
      this.snackBar.open('Video upload failed', 'Close', { duration: 2000 });
    }
  }
  onToggleChange(field: 'active' | 'qanda' | 'hero' | 'testmode' | 'breakdown' | 'enableshare' | 'activeparticipants' | 'newusersonly' | 'journeybased' | 'categorybased' | 'facilitator' | 'tierbased' |'triggerFunction' | 'evergreenWorkshop', event: any): void {
    const isChecked = event.checked;
    this.settingsForm.get(field)?.setValue(isChecked);
  }
evolutionMappingCount = 0;
selectedEvolutionTypes: { [key: string]: string } = {};
evolutionMappingActivities: string[] = [];

generateActivityId(challengeIndex: number, activityIndex: number): string {
  return `challenge_${challengeIndex}_activity_${activityIndex}`;
}

getAvailableEvolutionTypes(challengeIndex: number, activityIndex: number): string[] {
  const activityId = this.generateActivityId(challengeIndex, activityIndex);
  const currentSelection = this.selectedEvolutionTypes[activityId];
  
  const availableTypes = ['before', 'after'];
  const usedTypes = Object.values(this.selectedEvolutionTypes);
  
  return availableTypes.filter(type => 
    type === currentSelection || !usedTypes.includes(type)
  );
}

canEnableEvolutionMapping(challengeIndex: number, activityIndex: number): boolean {
  const activityId = this.generateActivityId(challengeIndex, activityIndex);
  return this.evolutionMappingCount < 2 || this.evolutionMappingActivities.includes(activityId);
}

onEvolutionMappingToggle(event: any, challengeIndex: number, activityIndex: number, subChallengeGroup: FormGroup): void {
  const activityId = this.generateActivityId(challengeIndex, activityIndex);
  const isEnabled = event.checked;

  if (isEnabled) {
    if (this.evolutionMappingCount >= 2) {
      subChallengeGroup.get('finalevolution')?.setValue(false);
      this.snackBar.open('Only 2 activities can have Final Evolution Mapping enabled', 'Close', { duration: 3000 });
      return;
    }
    
    this.evolutionMappingCount++;
    this.evolutionMappingActivities.push(activityId);
    
    const availableTypes = this.getAvailableEvolutionTypes(challengeIndex, activityIndex);
    if (availableTypes.length > 0) {
      const selectedType = availableTypes[0];
      subChallengeGroup.get('finalevolutiontype')?.setValue(selectedType);
      this.selectedEvolutionTypes[activityId] = selectedType;
    }
  } else {
    this.evolutionMappingCount--;
    this.evolutionMappingActivities = this.evolutionMappingActivities.filter(id => id !== activityId);
    delete this.selectedEvolutionTypes[activityId];
    subChallengeGroup.get('finalevolutiontype')?.setValue('');
  }

}

onEvolutionTypeChange(selectedType: string, challengeIndex: number, activityIndex: number): void {
  const activityId = this.generateActivityId(challengeIndex, activityIndex);
  
  if (selectedType) {
    this.selectedEvolutionTypes[activityId] = selectedType;
  } else {
    delete this.selectedEvolutionTypes[activityId];
  }

}
canEnableFinalBeforeAfter(): boolean {
  const selectedTypes = Object.values(this.selectedEvolutionTypes);
  return selectedTypes.includes('before') && selectedTypes.includes('after');
}

onFinalBeforeAfterToggle(event: any, subChallengeGroup: FormGroup): void {
  const isEnabled = event.checked;
  
  if (isEnabled) {
    if (!this.canEnableFinalBeforeAfter()) {
      subChallengeGroup.get('finalbeforeafter')?.setValue(false);
      this.snackBar.open('Both "before" and "after" types must be selected in VideoAsk activities first', 'Close', { duration: 3000 });
      return;
    }
  }
  
}
removeTestimonials(userId: string): void {
    const currentTestimonial = this.detailPageForm.get('selectedTestimonials')?.value || [];
    const updatedcurrentTestimonial = currentTestimonial.filter((id: string) => id !== userId);
    this.detailPageForm.get('selectedTestimonials')?.setValue(updatedcurrentTestimonial);
}

removeUser(userId: string): void {
    const currentUsers = this.settingsForm.get('testusers')?.value || [];
    const updatedUsers = currentUsers.filter((id: string) => id !== userId);
    this.settingsForm.get('testusers')?.setValue(updatedUsers);
}
removeFacilitator(userId: string): void {
    const currentUsers = this.settingsForm.get('facilitatorprofiles')?.value || [];
    const updatedUsers = currentUsers.filter((id: string) => id !== userId);
    this.settingsForm.get('facilitatorprofiles')?.setValue(updatedUsers);
}
removeJourney(userId: string): void {
    const currentUsers = this.settingsForm.get('selectedjourneys')?.value || [];
    const updatedUsers = currentUsers.filter((id: string) => id !== userId);
    this.settingsForm.get('selectedjourneys')?.setValue(updatedUsers);
}
removeTier(userId: string): void {
    const currentUsers = this.settingsForm.get('selectedtiers')?.value || [];
    const updatedUsers = currentUsers.filter((id: string) => id !== userId);
    this.settingsForm.get('selectedtiers')?.setValue(updatedUsers);
}
removecategoriesforthisworkshop(categoryId: string): void {
  const isUsed = this.workshopData?.challenges?.some((challenge: any) =>
    challenge.workshopcategory?.includes(categoryId)
  );
  if (isUsed) {
    alert('This category is already used in one or more challenges. Cannot remove.');
    return;
  }
  const currentCategories = this.settingsForm.get('categoriesforthisworkshop')?.value || [];
  const updatedCategories = currentCategories.filter((id: string) => id !== categoryId);
  this.settingsForm.get('categoriesforthisworkshop')?.setValue(updatedCategories);
}
removeCohortcategoriesforthisworkshop(categoryId: string): void {
  const isUsed = this.workshopData?.challenges?.some((challenge: any) =>
    challenge.workshopcategory?.includes(categoryId)
  );
  if (isUsed) {
    alert('This category is already used in one or more challenges. Cannot remove.');
    return;
  }
  const currentCategories = this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [];
  const updatedCategories = currentCategories.filter((id: string) => id !== categoryId);
  this.settingsForm.get('cohortcategoriesforthisworkshop')?.setValue(updatedCategories);
}


toggleChallenge(index: number): void {
  this.challengeExpanded[index] = !this.challengeExpanded[index];
}
createCategory(){
  const dialogRef = this.dialog.open(WorkshopCategoryComponent, {
    width: '400px',
    data: { 
      mode: 'create',
      workshopid:this.workshopId
    }
  });
  
  dialogRef.afterClosed().subscribe(result => {
    this.getWorkshopCategories()
    if (result) {
      console.log('Category created:', result);
    }
  }); 
}

editCategory(category: any) {
  const dialogRef = this.dialog.open(WorkshopCategoryComponent, {
    width: '400px',
    data: { 
      mode: 'edit', 
      category: category 
    }
  });
  
  dialogRef.afterClosed().subscribe(result => {
    this.getWorkshopCategories()
    if (result) {
      console.log('Category updated:', result);
    }
  });
}
onCohortSelectionChange(event: any) {
  const selected = this.settingsForm.get('cohortsforthisworkshop')?.value || [];
  
  if (selected.length > 2) {
    // Remove the last selected item
    selected.pop();
    this.settingsForm.get('cohortsforthisworkshop')?.setValue(selected);
    alert('You can select a maximum of 2 cohorts only!');
  }
}

isCohortDisabled(cohortId: string): boolean {
  const selected = this.settingsForm.get('cohortsforthisworkshop')?.value || [];
  return selected.length >= 2 && !selected.includes(cohortId);
}

onCohortCategorySelectionChange(event: any) {
  const selected = this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [];
  
  if (selected.length > 1) {
    selected.pop();
    this.settingsForm.get('cohortcategoriesforthisworkshop')?.setValue(selected);
    alert('You can select a maximum of 1 cohorts only!');
  }
}

onCohortCategoryDisabled(cohortId: string): boolean {
  const selected = this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [];
  // Disable unselected options if already 2 are selected
  return selected.length >= 1 && !selected.includes(cohortId);
}
async loadRecentTemplates() {
  try {
    const collRef = collection(this.firestore, "wati archive");
    const q = query(
      collRef, 
      orderBy("date", "desc"),
      limit(15)
    );
    const recentDocs = await getDocs(q);
    this.recentTemplates = recentDocs.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error loading recent templates:', error);
  }
}
// get selectedProfiles(): string[] {
//   const selectedIds: string[] = this.settingsForm.get('testusers')?.value || [];
//   return this.names
//     .filter(profile => selectedIds.includes(profile.id))
//     .map(profile => profile.name);
// }
getChallengeTypeDisplay(type: string): string {
  const typeMap: { [key: string]: string } = {
    'challenge': 'Activity',
    'zoomcall': 'Zoom Call'
  };
  return typeMap[type] || type;
}
private getNoteEditorKey(challengeIndex: number, activityIndex: number): string {
  return `note_editor_${challengeIndex}_${activityIndex}`;
}

private initializeNoteEditor(challengeIndex: number, activityIndex: number): void {
  const editorKey = this.getNoteEditorKey(challengeIndex, activityIndex);
  
  if (!this.noteeditors[editorKey]) {
    this.noteeditors[editorKey] = new Editor();
    this.noterichTextContents[editorKey] = '';
  }
}

getNoteEditor(challengeIndex: number, activityIndex: number): Editor {
  const editorKey = this.getNoteEditorKey(challengeIndex, activityIndex);
  
  if (!this.noteeditors[editorKey]) {
    this.initializeNoteEditor(challengeIndex, activityIndex);
  }
  
  return this.noteeditors[editorKey];
}
onNoteEditorContentChange(content: string, challengeIndex: number, activityIndex: number, subChallengeGroup: FormGroup): void {
  const editorKey = this.getNoteEditorKey(challengeIndex, activityIndex);
  this.noterichTextContents[editorKey] = content;
  subChallengeGroup.get('notedescriptionrich')?.setValue(content, { emitEvent: false });
}
private destroyNoteEditor(challengeIndex: number, activityIndex: number): void {
  const editorKey = this.getNoteEditorKey(challengeIndex, activityIndex);
  
  if (this.noteeditors[editorKey]) {
    this.noteeditors[editorKey].destroy();
    delete this.noteeditors[editorKey];
    delete this.noterichTextContents[editorKey];
  }
}





private getAssignmentEditorKey(challengeIndex: number, activityIndex: number): string {
  return `assignment_editor_${challengeIndex}_${activityIndex}`;
}

private initializeAssignmentEditor(challengeIndex: number, activityIndex: number): void {
  const editorKey = this.getAssignmentEditorKey(challengeIndex, activityIndex);
  
  if (!this.assignmenteditors[editorKey]) {
    this.assignmenteditors[editorKey] = new Editor();
    this.assignmentrichTextContents[editorKey] = '';
  }
}

getAssignmentEditor(challengeIndex: number, activityIndex: number): Editor {
  const editorKey = this.getAssignmentEditorKey(challengeIndex, activityIndex);
  
  if (!this.assignmenteditors[editorKey]) {
    this.initializeAssignmentEditor(challengeIndex, activityIndex);
  }
  
  return this.assignmenteditors[editorKey];
}
onAssignmentEditorContentChange(content: string, challengeIndex: number, activityIndex: number, subChallengeGroup: FormGroup): void {
  const editorKey = this.getAssignmentEditorKey(challengeIndex, activityIndex);
  this.assignmentrichTextContents[editorKey] = content;
  subChallengeGroup.get('assignmentdescriptionrich')?.setValue(content, { emitEvent: false });
}
private destroyAssignmentEditor(challengeIndex: number, activityIndex: number): void {
  const editorKey = this.getAssignmentEditorKey(challengeIndex, activityIndex);
  
  if (this.assignmenteditors[editorKey]) {
    this.assignmenteditors[editorKey].destroy();
    delete this.assignmenteditors[editorKey];
    delete this.assignmentrichTextContents[editorKey];
  }
}
dropCategory(event: CdkDragDrop<string[]>): void {
  const currentOrder: string[] = [
    ...(this.settingsForm.get('categoriesforthisworkshop')?.value || [])
  ];
  moveItemInArray(currentOrder, event.previousIndex, event.currentIndex);
  this.settingsForm.get('categoriesforthisworkshop')?.setValue(currentOrder);
}
}