import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Firestore, getDocs, collection, query, where, collectionData, orderBy, doc, collectionSnapshots } from '@angular/fire/firestore';
import { combineLatest, forkJoin, take } from 'rxjs';
import { MatSelectModule } from '@angular/material/select';
import { FormGroup, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ProductModeConfigupdateComponent } from '../product-mode-config/product-mode-configupdate/product-mode-configupdate.component';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { environment } from '../../../environments/environment';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import * as XLSX from 'xlsx';


@Component({
  selector: 'app-mode-dashboard-new',
  imports: [
    CommonModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    MatDatepickerModule
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './mode-dashboard-new.component.html',
  styleUrl: './mode-dashboard-new.component.css'
})
export class ModeDashboardNewComponent {

  // Numeric declarations
  startDay: number = 0;
  endDay: number = 30;
  itemsToShow: number = 10;
  configuredItemsToShow: number = 10;
  notConfiguredItemsToShow: number = 10;

  notConfiguredModeHighlightIndex: number | null = null;
  configuredModeHighlightIndex: number | null = null;

  configuredModesProductsLength: number = 0;
  notConfiguredModesProductsLength: number = 0;


  // Array declarations 
  nextModeList: any = [];
  nextModeProductList: any = [];
  productList: any = [];
  modesList: any = [];
  notConfiguredModes: any = [];
  configuredModes: any = [];
  tempNotConfiguredModes: any = [];
  tempConfiguredModes: any = [];
  adsPlaylist: any = [];
  solarVoicePlaylist: any = [];
  eiflixPlaylist: any = [];
  generalcontentPlaylist: any = [];
  formtemplatelist: any = [];
  debugModeList: any = [];
  eventsList: any = [];
  queueList: any = [];

  // Object declarations
  modeProfile: { [key: string]: any[] } = {};
  productmodeConfig: any = {};
  mapProducts: any = {};
  mapReference: any = {};
  mapProfile: any = {};
  mapMetaData: any = {};
  mapEvents: any = {};
  mapEventData: { [key: string]: any[] } = {};
  mapModesProfiles: { [key: string]: any[] } = {};
  subscription: any = {};
  mapQueues: any = {};
  mapEventDataOriginal: { [key: string]: any[] } = {};

  // Per product+mode member stats for the config exports:
  // currentCount = members whose current mode == this mode (for this product)
  // comingDates  = nextmodedate of every member whose next mode == this mode (for this product);
  //                the export windows these by the range chosen in the export dialog.
  modeStatsByProductMode: { [key: string]: { currentCount: number, comingDates: Date[] } } = {};

  // Export dialog state (asks for the "coming to mode" window when Export is clicked)
  showExportDialog: boolean = false;
  exportTarget: 'configured' | 'notconfigured' = 'configured';
  exportRangeMode: 'months' | 'date' = 'months';
  exportMonths: number = 3;
  exportSpecificDate: string = '';

  // String declarations
  selectedMode: any = null;
  activeTab = 'participants';
  tableView: string = '';
  selectedEvent: string = '';
  activeMode: string = '';
  selectedQueue: string = '';

  // Configured date-range filter (filters "Review Configured" by configured-on date)
  configuredDateRange!: FormGroup;

  notConfiguredModeHighlight: { productid: string, configurations: any[] } | null = null;
  configuredModeHighlight: { productid: string, configurations: any[] } | null = null;

  // Boolean declarations
  showDialog: boolean = false;
  isLoading: boolean = true;
  viewMode: boolean = false;

  // FormGroups 
  notconfiguredform!: FormGroup;
  configuredform!: FormGroup;

  constructor(
    public firestore: Firestore,
    public dialog: MatDialog,
    public guard: AuthguardService,
    private formbuilder: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.notconfiguredform = this.formbuilder.group({
      product: ['',],
      mode: ['',]
    });

    this.configuredform = this.formbuilder.group({
      product: ['',],
      mode: ['',]
    });

    this.configuredDateRange = this.formbuilder.group({
      start: [null],
      end: [null]
    });

    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });

  }

  async ngOnInit() {
    this.fetchPlaylist();
    this.fetchProfileList();
    this.fetchModesConfig();
    this.debugMode();
    this.fetchEvents();
    this.fetchQueues();
    this.fetchModeMemberStats();
    // await this.getModes();

    setTimeout(() => {
      this.isLoading = false
    }, 3000);
  }

  ngOnDestroy() {
    for (const key in this.subscription) {
      if (this.subscription[key]) {
        this.subscription[key].unsubscribe();
      }
    }
  };

  showMoreConfigured() {
    this.configuredItemsToShow += this.itemsToShow;
  }

  showMoreNotConfigured() {
    this.notConfiguredItemsToShow += this.itemsToShow;
  }

  showLessConfigured(element: HTMLElement) {
    this.configuredItemsToShow = this.itemsToShow;
    setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  showLessNotConfigured(element: HTMLElement) {
    this.notConfiguredItemsToShow = this.itemsToShow;
    setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  getDisplayedConfigured() {
    return this.configuredModes.slice(0, this.configuredItemsToShow);
  }

  getDisplayedNotConfigured() {
    return this.notConfiguredModes.slice(0, this.notConfiguredItemsToShow);
  }

  hasMoreConfigured() {
    return this.configuredItemsToShow < this.configuredModesProductsLength;
  }

  hasMoreNotConfigured() {
    return this.notConfiguredItemsToShow < this.notConfiguredModesProductsLength;
  }

  isShowingMoreConfigured() {
    return this.configuredItemsToShow > this.itemsToShow;
  }

  isShowingMoreNotConfigured() {
    return this.notConfiguredItemsToShow > this.itemsToShow;
  }

  // Function fetch the list of events from event collection
  async fetchEvents() {
    this.subscription['events'] = collectionSnapshots(query(collection(this.firestore, "event collection"), orderBy("name", "asc"))).subscribe((snapshots) => {
      this.eventsList = [];
      this.mapEvents = {};

      snapshots.forEach((snap) => {
        const eventdata = snap.data();
        eventdata['docref'] = snap.ref;
        eventdata['docid'] = snap.id;

        this.eventsList.push(eventdata);
        this.mapEvents[snap.id] = eventdata;
      });
    });
  }

  async fetchQueues() {
    this.subscription['queues'] = collectionSnapshots(
      query(collection(this.firestore, "queue generation"), orderBy("queuename", "asc"))
    ).subscribe((snapshots) => {
      this.queueList = [];
      this.mapQueues = {};

      snapshots.forEach((snap) => {
        const queuedata = snap.data();
        queuedata['docref'] = snap.ref;
        queuedata['docid'] = snap.id;

        this.queueList.push(queuedata);
        this.mapQueues[snap.id] = queuedata;
      });
    });
  }

  async getModes() {
    const q = query(collection(this.firestore, 'modes'), orderBy('sequence', 'asc'));
    const modesSnapshot = await getDocs(q);
    this.modesList = [];
    modesSnapshot.forEach((doc) => {
      const element = doc.data();
      this.modesList.push(element['mode']);
    });
  }

  getEventOrQueueName(participant: any): string {
    if (!participant.eventref) {
      return 'N/A';
    }

    const refPath = participant.eventref.path;

    if (refPath.includes('event collection')) {
      const eventId = participant.eventref.id;
      return this.mapEvents[eventId]?.name || 'N/A';
    } else if (refPath.includes('queue generation')) {
      const queueId = participant.eventref.id;
      return this.mapQueues[queueId]?.queuename || 'N/A';
    }

    return 'N/A';
  }

  // Function to fetch playlists for mode config 
  async fetchPlaylist() {
    const [adsSnapshot, solarSnapshot, seriesSnapshot, contentSnapshot, formSnapshot] = await Promise.all([
      getDocs(query(collection(this.firestore, 'adsplaylist'), orderBy('adstitle'))),
      getDocs(query(collection(this.firestore, 'solar voice playlist'), orderBy('name'))),
      getDocs(query(collection(this.firestore, 'series'), orderBy('seriesName'))),
      getDocs(query(collection(this.firestore, 'content_urls'), orderBy('title'))),
      getDocs(query(collection(this.firestore, 'delivery forms'), orderBy('formname')))
    ]);

    // Process Ads Playlist
    adsSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['adstitle'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.adsPlaylist.push(data);
    });

    // Process Solar Voice Playlist
    solarSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['name'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.solarVoicePlaylist.push(data);
    });

    // Process EiFlix Playlist
    seriesSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['seriesName'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.eiflixPlaylist.push(data);
    });

    // Process General Content Playlist
    contentSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['title'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.generalcontentPlaylist.push(data);
    });

    // Process Form List
    formSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['formname'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.formtemplatelist.push(data);
    });
  }

  fetchProfileList() {
    const colRef = collection(this.firestore, "participant metadata");

    this.subscription['profile'] = collectionData(colRef).subscribe((metadata) => {
      const profile = metadata;
      this.modeProfile = profile.reduce((r, a) => {
        this.mapMetaData[a['profileid']] = a;
        if (![null, undefined].includes(a["profileid"])) {
          if (![null, undefined].includes(a['participantmode'])) {
            r[a['participantmode']] = r[a['participantmode']] || [];
            r[a['participantmode']].push(a["profileid"]);
          } else {
            r['No Mode'] = r['No Mode'] || [];
            r['No Mode'].push(a['profileid']);
          }
        }
        return r;
      }, {});

      if (Object.keys(this.modeProfile).length > 0) {
        this.nextModeChange();
      }
    });
  }

  // Build per product+mode member counts used by the config exports.
  // Loads participantsproduct once (real-time) and aggregates current-mode and
  // next-mode membership per product.
  fetchModeMemberStats() {
    this.subscription['modestats'] = collectionData(collection(this.firestore, "participantsproduct")).subscribe((list) => {
      const stats: { [key: string]: { currentCount: number, comingDates: Date[] } } = {};

      const ensure = (key: string) => {
        if (!stats[key]) {
          stats[key] = { currentCount: 0, comingDates: [] };
        }
        return stats[key];
      };

      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const productid = p['productref']?.id;
        if (!productid) continue;

        const mode = p['mode'];
        const nextmode = p['nextmode'];

        // Members currently in this mode for this product
        if (![null, undefined, ''].includes(mode)) {
          ensure(productid + mode).currentCount++;
        }

        // Members whose next mode is this mode for this product (keep the date; window at export time)
        if (![null, undefined, ''].includes(nextmode)) {
          const nextDate = p['nextmodedate']?.toDate ? p['nextmodedate'].toDate() : null;
          if (nextDate) {
            ensure(productid + nextmode).comingDates.push(nextDate);
          }
        }
      }

      this.modeStatsByProductMode = stats;
    });
  }

  fetchModes() {
    this.subscription['product4'] = collectionData(query(collection(this.firestore, "participantsproduct"), where("mode", "!=", null))).subscribe((products) => {

      var productMap = {}
      for (let i = 0; i < products.length; i++) {
        const element = products[i];
        const mode = element['mode'];

        if (!productMap[mode]) {
          productMap[mode] = [];
        }
        productMap[mode].push(element);
      }

      this.mapModesProfiles = productMap;
    })
  }

  fetchModesConfig() {
    const productModeConfigRef = collection(this.firestore, 'product mode config');
    const modesRef$ = collectionData(collection(this.firestore, 'modes'));
    const productModeConfig$ = collectionData(productModeConfigRef, { idField: 'id' });

    const productsRef = collection(this.firestore, 'products');
    const productsQuery = query(productsRef, orderBy('product'));
    const products$ = collectionData(productsQuery, { idField: 'id' });

    // Subscribe to real-time updates
    this.subscription['promisedata'] = combineLatest({
      config: productModeConfig$,
      products: products$,
      modes: modesRef$
    }).subscribe(({ config, products, modes }) => {
      // Clear existing data
      this.productmodeConfig = {};
      this.mapProducts = {};

      // Process config data
      config.forEach(element => {
        const product = element["productref"].id;
        const mode = element["mode"];
        this.productmodeConfig[product + mode] = element;
      });

      // Process products data
      this.productList = products;
      products.forEach(element => {
        this.mapProducts[element['id']] = element;
      });
      this.modesList = modes.map((doc)=>doc['mode']);

      // Update after data is loaded
      this.filterModesConfig();
      this.cdr.detectChanges();
    });

  }

  filterModesConfig() {
    let notconfigured = [];
    let configured = [];

    for (let i = 0; i < this.productList.length; i++) {
      const product = this.productList[i];

      for (let j = 0; j < product['modeflow']?.length; j++) {
        const mode = product['modeflow'][j];
        const configKey = product['id'] + mode;

        if (![null, undefined].includes(this.productmodeConfig[configKey])) {
          // Config EXISTS
          if (this.productmodeConfig[configKey]['widgets'].length == 0) {
            // Has config but no widgets
            notconfigured.push({
              productid: product['id'],
              mode: mode
            })

          } else {
            // Has config with widgets
            configured.push({
              productid: product['id'],
              mode: mode,
              lastupdate: this.productmodeConfig[configKey]['lastupdate']
            })

          }
        } else {
          // Config DOES NOT EXIST - ADD THIS ELSE BLOCK
          notconfigured.push({
            productid: product['id'],
            mode: mode
          })
        }
      }

      if (i + 1 == this.productList.length) {
        this.configuredModes = configured;
        this.tempConfiguredModes = configured;

        this.notConfiguredModes = notconfigured;
        this.tempNotConfiguredModes = notconfigured;
      }
    }
  }

  // Function to fetch the participant products whose next mode date falls under the selected days range 
  nextModeChange() {
    var startDate = this.returnDate(this.startDay, true);
    var endDate = this.returnDate(this.endDay, false);

    // Unsubscribe previous subscription to prevent multiple calls
    if (this.subscription['product1']) {
      this.subscription['product1'].unsubscribe();
    }

    const q = query(
      collection(this.firestore, 'participantsproduct'),
      where("nextmodedate", ">=", startDate),
      where("nextmodedate", "<=", endDate)
    );

    this.subscription['product1'] = collectionData(q).subscribe(list => {
      var productModeGroup = {};
      var modeGroup = {};
      var nextmodedata = [];
      var nextmode = [];

      // Group by product and mode
      for (let i = 0; i < list.length; i++) {
        var data = list[i];
        var key = data["productref"].id + "_" + data["mode"];

        if (!productModeGroup[key]) {
          productModeGroup[key] = [];
        }
        productModeGroup[key].push(data);
      }

      // Create grouped data for each product-mode combination
      for (const key in productModeGroup) {
        var splitKey = key.split("_");
        var productid = splitKey[0];
        var currentmode = splitKey[1];
        var firstProduct = productModeGroup[key][0];

        var groupData = {
          productid: productid,
          currentmode: currentmode,
          nextmode: firstProduct["nextmode"],
          hierarchyprofile: [],
          participantprofile: [],
          hierarchyproduct: productModeGroup[key].filter(e =>
            (this.modeProfile[currentmode] ?? []).includes(e["profileid"])
          ),
          participantproduct: productModeGroup[key]
        };

        groupData.hierarchyprofile = Array.from(
          new Set(groupData.hierarchyproduct.map(e => e["profileid"]))
        );
        groupData.participantprofile = Array.from(
          new Set(groupData.participantproduct.map(e => e["profileid"]))
        );

        nextmodedata.push(groupData);
      }

      // Group and merge objects with same currentmode-nextmode
      nextmodedata.forEach((e) => {
        const modeKey = e['currentmode'] + '-' + e['nextmode'];

        if (!modeGroup[modeKey]) {
          // First object with this mode combination
          modeGroup[modeKey] = {
            currentmode: e.currentmode,
            nextmode: e.nextmode,
            productids: [e.productid],
            hierarchyprofile: [...e.hierarchyprofile],
            participantprofile: [...e.participantprofile],
            hierarchyproduct: [...e.hierarchyproduct],
            participantproduct: [...e.participantproduct]
          };
        } else {
          // Merge with existing object
          modeGroup[modeKey].productids.push(e.productid);
          modeGroup[modeKey].hierarchyproduct.push(...e.hierarchyproduct);
          modeGroup[modeKey].participantproduct.push(...e.participantproduct);

          // Merge and remove duplicates for profile arrays
          const combinedHierarchyProfile = [
            ...modeGroup[modeKey].hierarchyprofile,
            ...e.hierarchyprofile
          ];
          const combinedParticipantProfile = [
            ...modeGroup[modeKey].participantprofile,
            ...e.participantprofile
          ];

          modeGroup[modeKey].hierarchyprofile = Array.from(new Set(combinedHierarchyProfile));
          modeGroup[modeKey].participantprofile = Array.from(new Set(combinedParticipantProfile));
        }
      });

      // Convert modeGroup object to array
      for (const key in modeGroup) {
        nextmode.push(modeGroup[key]);
      }

      // Update the component properties
      this.nextModeProductList = nextmodedata;
      this.nextModeList = nextmode;

      // Trigger change detection
      this.cdr.detectChanges();
    });
  }


  // Update the updateEventData method:
  updateEventData() {
    this.mapEventData = {};
    const eventRef = doc(this.firestore, "event collection", this.selectedEvent);

    this.subscription['product2'] = collectionData(query(collection(this.firestore, "participantsproduct"), where("eventref", "==", eventRef))).subscribe((events) => {
      if (events.length != 0) {
        let productDocs = events;
        var productMap: { [key: string]: any[] } = {};

        for (let i = 0; i < productDocs.length; i++) {
          const product = productDocs[i];
          const mode = product['mode'];

          if (!productMap[mode]) {
            productMap[mode] = [];
          }
          productMap[mode].push(product);
        }
        this.mapEventData = productMap;
        this.mapEventDataOriginal = JSON.parse(JSON.stringify(productMap));
        this.cdr.detectChanges();
      }
    })
  }

  // Update the updateQueueData method:
  updateQueueData() {
    this.mapEventData = {};
    const queueRef = doc(this.firestore, "queue generation", this.selectedQueue);

    this.subscription['product2'] = collectionData(
      query(collection(this.firestore, "participantsproduct"), where("eventref", "==", queueRef))
    ).subscribe((queues) => {
      if (queues.length != 0) {
        let productDocs = queues;
        var productMap: { [key: string]: any[] } = {};

        for (let i = 0; i < productDocs.length; i++) {
          const product = productDocs[i];
          const mode = product['mode'];

          if (!productMap[mode]) {
            productMap[mode] = [];
          }
          productMap[mode].push(product);
        }
        this.mapEventData = productMap;
        this.mapEventDataOriginal = JSON.parse(JSON.stringify(productMap)); // Store original
        this.cdr.detectChanges();
      }
    });
  }

  // Update the filterEventQueueByProduct method:
  filterEventQueueByProduct(productId: string) {
    if (!productId) {
      // Reset to original data instead of re-fetching
      this.mapEventData = JSON.parse(JSON.stringify(this.mapEventDataOriginal));
      this.cdr.detectChanges();
      return;
    }

    // Filter from ORIGINAL data, not the already-filtered data
    const filteredMap: { [key: string]: any[] } = {};

    for (const mode in this.mapEventDataOriginal) { // Use original data
      const filtered = this.mapEventDataOriginal[mode].filter(
        (participant) => participant.productref?.id === productId
      );
      if (filtered.length > 0) {
        filteredMap[mode] = filtered;
      }
    }

    this.mapEventData = filteredMap;
    this.cdr.detectChanges();
  }

  async openModeDialog(mode: any, view: any, activemode: any) {
    this.selectedMode = mode;
    this.tableView = view;

    if (['participants', 'event'].includes(view)) {
      this.activeMode = activemode
    }

    this.showDialog = true;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.classList.add('modal-open');
  }

  // Function to close dialog 
  closeDialog() {
    this.showDialog = false;
    this.selectedMode = null;
    this.tableView = '';
    const scrollY = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.classList.remove('modal-open');
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  openConfig() {
    if (window.location.port.includes('4200')) {
      window.open(`http://localhost:4200/productmodeconfig`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`https://starlabs-test-19.web.app/productmodeconfig`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`https://breakthroughs.app/productmodeconfig`, '_blank');
    }
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  getProductName(productId: string): string {
    return this.mapProducts[productId]?.product || 'Unknown Product';
  }

  // Function to format the date 
  returnDate(number, start) {
    var date = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + number, 0, 0, 0, 0)
    date = new Date(start ? date.setHours(0, 0, 0, 0) : date.setHours(23, 59, 59, 59))
    return date
  }

  notConfiguredFilter(value) {
    this.notConfiguredModes = this.tempNotConfiguredModes.filter((e) => {
      if ((value.product.length != 0 ? value.product.includes(e.productid) : true)
        && (value.mode.length != 0 ? value.mode.includes(e.mode) : true)) {
        return e;
      }
    })
    this.notConfiguredModeHighlight = null;
    this.notConfiguredModeHighlightIndex = null;
  }

  configuredFilter(value) {
    const startVal: Date | null = this.configuredDateRange?.value?.start ?? null;
    const endVal: Date | null = this.configuredDateRange?.value?.end ?? null;

    // Normalize the picked dates to start-of-day / end-of-day (local time)
    const start = startVal
      ? new Date(startVal.getFullYear(), startVal.getMonth(), startVal.getDate(), 0, 0, 0, 0)
      : null;
    const end = endVal
      ? new Date(endVal.getFullYear(), endVal.getMonth(), endVal.getDate(), 23, 59, 59, 999)
      : null;

    this.configuredModes = this.tempConfiguredModes.filter((e) => {
      const productMatch = value.product.length != 0 ? value.product.includes(e.productid) : true;
      const modeMatch = value.mode.length != 0 ? value.mode.includes(e.mode) : true;

      let dateMatch = true;
      if (start || end) {
        const configuredOn = e.lastupdate?.toDate ? e.lastupdate.toDate() : null;
        if (!configuredOn) {
          dateMatch = false;
        } else {
          if (start && configuredOn < start) dateMatch = false;
          if (end && configuredOn > end) dateMatch = false;
        }
      }

      return productMatch && modeMatch && dateMatch;
    })
    this.configuredModeHighlight = null;
    this.configuredModeHighlightIndex = null;
  }

  clearConfiguredDateRange() {
    this.configuredDateRange.reset();
    this.configuredFilter(this.configuredform.value);
  }

  debugMode() {
    const q = query(collection(this.firestore, 'participantsproduct'), where('nextmodedate', '<', new Date()));
    this.subscription['product3'] = collectionData(q).subscribe(product => {
      this.debugModeList = product;
    })
  }

  updateConfig(mode, product) {
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })

    setTimeout(() => {
      const productDocRef = doc(collection(this.firestore, 'products'), product);
      var data = this.productmodeConfig[product + mode] ?? {
        productref: productDocRef,
        mode: mode
      }
      console.log(mode, product, data)
      this.dialog.open(ProductModeConfigupdateComponent, {
        data: {
          config: data,
          product: product,
          mapProducts: this.mapProducts,
          reference: {
            adsplaylist: this.adsPlaylist,
            solarvoiceplaylist: this.solarVoicePlaylist,
            eiflixplaylist: this.eiflixPlaylist,
            generalcontentplaylist: this.generalcontentPlaylist,
            formlist: this.formtemplatelist
          }
        },
        maxHeight: "90vh",
        maxWidth: "90vw"
      })
    }, 0);
  }

  exportToExcel() {
    // Import XLSX at the top of your component file: import * as XLSX from 'xlsx';

    let data: any[] = [];
    let filename = '';
    let sheetName = 'Data';

    switch (this.tableView) {
      case 'transition':
        data = (this.selectedMode.participantproduct || []).map((participant, index) => ({
          'Serial No': index + 1,
          'Participant Name': this.mapProfile[participant.profileid] || 'N/A',
          'Email': this.mapMetaData[participant.profileid]?.email || 'N/A',
          'Product': this.mapProducts[participant?.productref?.id]?.product || 'N/A',
          'Current Mode': participant.mode || 'N/A',
          'Next Mode': participant.nextmode || 'N/A',
          'Next Mode Date': participant.nextmodedate ?
            new Date(participant.nextmodedate.toDate()).toLocaleDateString() : 'N/A'
        }));
        filename = `Mode_Transition_${this.selectedMode.currentmode}_to_${this.selectedMode.nextmode}`;
        sheetName = 'Mode Transition';
        break;

      case 'debug':
        data = (this.selectedMode || []).map((participant, index) => ({
          'Serial No': index + 1,
          'Participant Name': this.mapProfile[participant.profileid] || 'N/A',
          'Email': this.mapMetaData[participant.profileid]?.email || 'N/A',
          'Product': this.mapProducts[participant?.productref?.id]?.product || 'N/A',
          'Event/Queue': this.getEventOrQueueName(participant),
          'Current Mode': participant.mode || 'N/A',
          'Next Mode': participant.nextmode || 'N/A',
          'Next Mode Date': participant.nextmodedate ?
            new Date(participant.nextmodedate.toDate()).toLocaleDateString() : 'N/A'
        }));
        filename = 'Participants_Not_Moved';
        sheetName = 'Not Moved';
        break;

      case 'participants':
        data = (this.selectedMode || []).map((participant, index) => ({
          'Serial No': index + 1,
          'Participant Name': this.mapProfile[participant] || 'N/A',
          'Email': this.mapMetaData[participant]?.email || 'N/A'
        }));
        filename = `Participants_${this.activeMode?.replace(/\s+/g, '_')}`;
        sheetName = 'Participants';
        break;

      case 'event':
        data = (this.selectedMode || []).map((participant, index) => ({
          'Serial No': index + 1,
          'Participant Name': this.mapProfile[participant.profileid] || 'N/A',
          'Email': this.mapMetaData[participant.profileid]?.email || 'N/A'
        }));
        filename = `Event_Participants_${this.activeMode?.replace(/\s+/g, '_')}`;
        sheetName = 'Event Participants';
        break;

      default:
        console.error('Unknown table view:', this.tableView);
        return;
    }

    if (data.length === 0) {
      alert('No data available to export');
      return;
    }

    try {
      // Create worksheet from data
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Set column widths
      const columnWidths = [
        { wch: 10 }, // Serial No
        { wch: 25 }, // Name
        { wch: 20 }, // Product (if exists)
        { wch: 15 }, // Current Mode (if exists)
        { wch: 15 }, // Next Mode (if exists)
        { wch: 15 }  // Next Mode Date (if exists)
      ];
      worksheet['!cols'] = columnWidths;

      // Create workbook and add worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      // Add metadata
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const fullFilename = `${filename}.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, fullFilename);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export Excel file. Please try again.');
    }
  }

  // Open the export dialog (which asks for the "coming to mode" window) for a given list
  openExportDialog(target: 'configured' | 'notconfigured') {
    this.exportTarget = target;
    this.exportRangeMode = 'months';
    this.exportMonths = 3;
    this.exportSpecificDate = '';
    this.showExportDialog = true;
  }

  closeExportDialog() {
    this.showExportDialog = false;
  }

  // Confirm the dialog: compute the [today, cutoff] window and export.
  // Exports both lists as:
  // Product | Mode | Configured On | Members in Current Mode | Members Coming to Mode | Next Mode Date
  confirmExport() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let cutoff: Date;
    if (this.exportRangeMode === 'date') {
      if (!this.exportSpecificDate) {
        alert('Please pick a date.');
        return;
      }
      const [y, m, d] = this.exportSpecificDate.split('-').map(Number);
      cutoff = new Date(y, m - 1, d, 23, 59, 59, 999);
    } else {
      const months = Number(this.exportMonths);
      if (!months || months <= 0) {
        alert('Please enter a valid number of months.');
        return;
      }
      cutoff = new Date(today);
      cutoff.setMonth(cutoff.getMonth() + months);
      cutoff.setHours(23, 59, 59, 999);
    }

    const cutoffLabel = cutoff.toLocaleDateString();
    const source = this.exportTarget === 'configured' ? this.configuredModes : this.notConfiguredModes;
    const data = source.map((item, index) => this.buildModeExportRow(item, index, today, cutoff, cutoffLabel));

    const filename = this.exportTarget === 'configured' ? 'Review_Configured' : 'Configuration_Missing';
    const sheetName = this.exportTarget === 'configured' ? 'Configured' : 'Missing';

    this.downloadModeSheet(data, filename, sheetName);
    this.closeExportDialog();
  }

  // Build one export row (product-mode). "Members Coming to Mode" is limited to
  // members whose next mode date falls within [today, cutoff].
  private buildModeExportRow(item: any, index: number, today: Date, cutoff: Date, cutoffLabel: string) {
    const stats = this.modeStatsByProductMode[item.productid + item.mode]
      || { currentCount: 0, comingDates: [] };

    const inWindow = stats.comingDates.filter((dt) => dt >= today && dt <= cutoff);

    return {
      'Serial No': index + 1,
      'Product': this.mapProducts[item.productid]?.product || 'N/A',
      'Mode': item.mode || 'N/A',
      'Configured On': item.lastupdate?.toDate
        ? new Date(item.lastupdate.toDate()).toLocaleDateString()
        : 'NA',
      'Members in Current Mode': stats.currentCount,
      [`Members Coming to Mode (till ${cutoffLabel})`]: inWindow.length
    };
  }

  private downloadModeSheet(data: any[], filename: string, sheetName: string) {
    if (!data || data.length === 0) {
      alert('No data available to export');
      return;
    }
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [
        { wch: 10 }, // Serial No
        { wch: 30 }, // Product
        { wch: 20 }, // Mode
        { wch: 18 }, // Configured On
        { wch: 22 }, // Members in Current Mode
        { wch: 28 }  // Members Coming to Mode (till <date>)
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export Excel file. Please try again.');
    }
  }

  getConfiguredModesOfProduct() {
    if (this.configuredModeHighlight) {
      return this.configuredModeHighlight['configurations'];
    }
    return [];
  }

  highlightConfiguredMode(productId: string, configurations: any[], index: number) {
    if (this.configuredModeHighlight) {
      if (this.configuredModeHighlight.productid === productId) {
        this.configuredModeHighlightIndex = null;
        this.configuredModeHighlight = null;
      } else {
        this.configuredModeHighlightIndex = index;
        this.configuredModeHighlight = { productid: productId, configurations }
      }
    } else {
      this.configuredModeHighlightIndex = index;
      this.configuredModeHighlight = { productid: productId, configurations }
    }
  }

  isConfiguredCardActive(profileId: string) {
    if (this.configuredModeHighlight) {
      if (this.configuredModeHighlight.productid === profileId) {
        return true
      }
      return false
    }
    return false;
  }

  isConfiguredRowEnd(index: number, isLast: boolean): boolean {
    return index % 2 === 1 || isLast;
  }

  isExpandedConfiguredRow(index: number, isLast: boolean): boolean {
    return this.configuredModeHighlightIndex !== null &&
      Math.floor(this.configuredModeHighlightIndex / 2) === Math.floor(index / 2) &&
      this.isConfiguredRowEnd(index, isLast);
  }

  getConfiguredModesProductGroups(): {
    productId: string,
    configurations: any
  }[] {
    const productGroup = {};
    let products = [];
    for (let product of this.configuredModes) {
      const productId = product['productid'] ?? '';
      if (Object.hasOwn(productGroup, productId)) {
        productGroup[productId]?.push(product);
      } else {
        productGroup[productId] = [product];
      }
    }

    products = Object.entries(productGroup).map(
      ([productId, configurations]) => ({
        productId,
        configurations
      })
    );
    this.configuredModesProductsLength = products.length;

    return products.slice(0, this.configuredItemsToShow)
  }

  // not configured 

  getNotConfiguredModesOfProduct() {
    if (this.notConfiguredModeHighlight) {
      return this.notConfiguredModeHighlight['configurations'];
    }
    return [];
  }

  highlightNotConfiguredMode(productId: string, configurations: any[], index: number) {
    if (this.notConfiguredModeHighlight) {
      if (this.notConfiguredModeHighlight.productid === productId) {
        this.notConfiguredModeHighlightIndex = null;
        this.notConfiguredModeHighlight = null;
      } else {
        this.notConfiguredModeHighlightIndex = index;
        this.notConfiguredModeHighlight = { productid: productId, configurations }
      }
    } else {
      this.notConfiguredModeHighlightIndex = index;
      this.notConfiguredModeHighlight = { productid: productId, configurations }
    }
  }

  isNotConfiguredCardActive(profileId: string) {
    if (this.notConfiguredModeHighlight) {
      if (this.notConfiguredModeHighlight.productid === profileId) {
        return true
      }
      return false
    }
    return false;
  }

  isNotConfiguredRowEnd(index: number, isLast: boolean): boolean {
    return index % 2 === 1 || isLast;
  }

  isExpandedNotConfiguredRow(index: number, isLast: boolean): boolean {
    return this.notConfiguredModeHighlightIndex !== null &&
      Math.floor(this.notConfiguredModeHighlightIndex / 2) === Math.floor(index / 2) &&
      this.isConfiguredRowEnd(index, isLast);
  }

  getNotConfiguredModesProductGroups(): {
    productId: string,
    configurations: any
  }[] {
    const productGroup = {};
    let products = [];
    for (let product of this.notConfiguredModes) {
      const productId = product['productid'] ?? '';
      if (Object.hasOwn(productGroup, productId)) {
        productGroup[productId]?.push(product);
      } else {
        productGroup[productId] = [product];
      }
    }

    products = Object.entries(productGroup).map(
      ([productId, configurations]) => ({
        productId,
        configurations
      })
    );

    this.notConfiguredModesProductsLength = products.length;

    return products.slice(0,this.notConfiguredItemsToShow);
  }

}
