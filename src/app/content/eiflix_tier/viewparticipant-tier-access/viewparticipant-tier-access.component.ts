import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { collection, collectionSnapshots, DocumentReference, Firestore, getDoc, getDocs, orderBy, query } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AddTierComponent } from '../../access-screen/add-tier/add-tier.component';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { AssignSeriesComponent } from '../../access-screen/assign-series/assign-series.component';
import { FormsModule } from '@angular/forms';
import { deleteDoc, doc } from '@angular/fire/firestore';
import { ConfigNewTierComponent } from '../../tier-access-config/config-new-tier/config-new-tier.component';
@Component({
  selector: 'app-viewparticipant-tier-access',
  imports: [
    CommonModule,
    MatIconModule,
    MatTabsModule,
    FormsModule
  ],
  templateUrl: './viewparticipant-tier-access.component.html',
  // styleUrl: './viewparticipant-tier-access.component.css'
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class ViewparticipantTierAccessComponent {
  testTier = {}
  // mapUserToProfileid = {}
  maptier = {}
  maptierOrder = {}
  sortedTierKeys: string[] = []
  private subscription = new Subject<void>();
  seriesTierData: any[] = []
  tierSeriesData: any[] = []
  seriesViewMode: string = 'series'
  seriesSortMode: string = 'az'
  seriesSearchText: string = ''
  filteredSeriesData: any[] = []
  filteredTierSeriesData: any[] = []

  tierAccessData: any[] = []
  filteredTierAccessData: any[] = []
  tierAccessSearchText: string = ''
  mapJourney = {}
  mapProduct = {}
  mapBigLevel = {}
  memberSearchText: string = ''
  filteredTierKeys: string[] = []

  constructor(
    private firestore:Firestore,
    private dialog: MatDialog
  ) {
    const tierRef = collection(this.firestore,"tier") 
    getDocs(tierRef).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.maptier[element['id']] = element['tier']
        this.maptierOrder[element['id']] = element['order'] ?? 999 
      }
    })
    // const profiledataRef = collection(this.firestore,"profile_data") 
    // getDocs(profiledataRef).then(snap => {
    //   for (let i = 0; i < snap.docs.length; i++) {
    //     const element = snap.docs[i].data();
    //     if(![null,undefined].includes(element['user_ref'])){
    //       this.mapUserToProfileid[element['user_ref'].id] = element['name']
    //     }
    //   }
      const userRef = collection(this.firestore, "participant metadata")
      collectionSnapshots(query(userRef, orderBy("name"))).pipe(takeUntil(this.subscription)).subscribe(snap => {
        this.testTier = {}
        for (let i = 0; i < snap.length; i++) {
          const element = snap[i].data();
          if(element["firebaseuserref"]){
            let userid = snap[i].id
            let tierElement = element['tier'] ?? []
            if(tierElement.length != 0){
              for (let j = 0; j < tierElement.length; j++) {
                this.testTier[tierElement[j]] = this.testTier[tierElement[j]] || []
                this.testTier[tierElement[j]].push(element["name"])
              }
            }else{
              this.testTier["Tierless Participant"] = this.testTier["Tierless Participant"] || []
              this.testTier["Tierless Participant"].push(element["name"])
            }
          }
        }
        // this.sortedTierKeys = Object.keys(this.testTier).sort((a, b) => (this.maptierOrder[a] ?? 999) - (this.maptierOrder[b] ?? 999));
        this.sortedTierKeys = Object.keys(this.testTier).sort((a, b) => (this.maptierOrder[a] ?? 999) - (this.maptierOrder[b] ?? 999));
        this.filteredTierKeys = [...this.sortedTierKeys];
        this.memberSearchText = '';
      })
    // })
    const seriesRef = collection(this.firestore, 'series')
    collectionSnapshots(seriesRef).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      const tierPromises: Promise<any>[] = [];
      const tiersData: any[] = [];

      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        const tierRefs = data['tier'];
        const seriesName = data['seriesName'];
        const id = docSnap.id;
        const seriesTiers: any[] = [];

        if (Array.isArray(tierRefs)) {
          tierRefs.forEach((tierRef: DocumentReference<any>) => {
            tierPromises.push(
              getDoc(tierRef).then((tierDoc: any) => {
                const tierData = tierDoc.data();
                seriesTiers.push(tierData?.tier ?? 'Unknown');
              })
            );
          });
        }

        // tiersData.push({ id, seriesName, tiers: seriesTiers });
        tiersData.push({ id, seriesName, tiers: seriesTiers, date: data['date'] ?? null });
      });
      Promise.all(tierPromises).then(() => {
        for (const series of tiersData) {
          series.tiers.sort((a, b) => {
            const aId = Object.keys(this.maptier).find(k => this.maptier[k] === a) || '';
            const bId = Object.keys(this.maptier).find(k => this.maptier[k] === b) || '';
            return (this.maptierOrder[aId] ?? 999) - (this.maptierOrder[bId] ?? 999);
          });
        }
        this.seriesTierData = tiersData;
        const tierMap: { [tierName: string]: string[] } = {};
        for (const series of tiersData) {
          for (const tierName of series.tiers) {
            tierMap[tierName] = tierMap[tierName] || [];
            tierMap[tierName].push(series.seriesName);
          }
        }
        this.tierSeriesData = Object.keys(tierMap).map(t => ({ tierName: t, seriesList: tierMap[t] }));
        this.applySortAndFilter();
      }).catch(error => {
        console.error('Error retrieving tiers:', error);
      });
    })
    
    
    const tieraccessconfigref = collection(this.firestore, "tier access config")
    collectionSnapshots(tieraccessconfigref).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      this.tierAccessData = snapData.map(d => ({ id: d.id, ...d.data() }))
      this.tierAccessData.sort((a, b) => (this.maptierOrder[a['tierid']] ?? 999) - (this.maptierOrder[b['tierid']] ?? 999));
      this.filteredTierAccessData = [...this.tierAccessData];
    })

    const journeyref = collection(this.firestore, "journey")
    getDocs(journeyref).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapJourney[element['id']] = element['journey']
      }
    })

    const productsref = collection(this.firestore, "products")
    getDocs(productsref).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProduct[element['id']] = element['product']
      }
    })

    const biglevelref = collection(this.firestore, "biglevel")
    getDocs(biglevelref).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapBigLevel[element['docid']] = element['level']
      }
    })
  }
  onSeriesSearch() {
    this.applySortAndFilter();
  }
  onMemberSearch() {
    const search = this.memberSearchText.trim().toLowerCase();
    if (!search) {
      this.filteredTierKeys = [...this.sortedTierKeys];
      return;
    }
    this.filteredTierKeys = this.sortedTierKeys.filter(key => {
      const tierName = (key !== 'Tierless Participant' ? this.maptier[key] : key) || '';
      const nameMatch = tierName.toLowerCase().includes(search);
      const memberMatch = (this.testTier[key] || []).some((name: string) => name.toLowerCase().includes(search));
      return nameMatch || memberMatch;
    });
  }
  applySortAndFilter() {
    const search = this.seriesSearchText.trim().toLowerCase();

    // Filter + sort series view
    let filtered = this.seriesTierData.filter(s =>
      (s.seriesName || '').toLowerCase().includes(search)
    );
    switch (this.seriesSortMode) {
      case 'az':
        filtered.sort((a, b) => (a.seriesName || '').localeCompare(b.seriesName || ''));
        break;
      case 'za':
        filtered.sort((a, b) => (b.seriesName || '').localeCompare(a.seriesName || ''));
        break;
      case 'newest':
        filtered.sort((a, b) => {
          const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
          const db = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
          return db.getTime() - da.getTime();
        });
        break;
      case 'oldest':
        filtered.sort((a, b) => {
          const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
          const db = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
          return da.getTime() - db.getTime();
        });
        break;
    }
    this.filteredSeriesData = filtered;
    let filteredTiers = this.tierSeriesData.filter(t =>
      (t.tierName || '').toLowerCase().includes(search) ||
      t.seriesList.some((s: string) => s.toLowerCase().includes(search))
    );
    filteredTiers.sort((a, b) => {
      const aId = Object.keys(this.maptier).find(k => this.maptier[k] === a.tierName) || '';
      const bId = Object.keys(this.maptier).find(k => this.maptier[k] === b.tierName) || '';
      return (this.maptierOrder[aId] ?? 999) - (this.maptierOrder[bId] ?? 999);
    });
    this.filteredTierSeriesData = filteredTiers;
  }
  openDialog(){
    this.dialog.open(AddTierComponent,{
      width: '920px',
      maxWidth: '95vw',
      data : {
        add : true
      }
    })
  }
  onEditDialog(id:any) {
    this.dialog.open(AddTierComponent,{
      width: '920px',
      maxWidth: '95vw',
      data: {
        edit : true,
        id : id
      }
    })
  }
  onAssignEditDialog(doc){
    console.log(doc)
    this.dialog.open(AssignSeriesComponent,{
      data : {
        edit : true,
        seriesName : doc.seriesName,
        id : doc.id,
        tier:doc.tiers
      }
    })
  }
  ngOnInit(): void {}
  onAddTierAccess() {
    this.dialog.open(ConfigNewTierComponent, {
      data: { type: "add" },
      disableClose: true
    })
  }

  onEditTierAccess(row: any) {
    this.dialog.open(ConfigNewTierComponent, {
      data: { type: "edit", doc: { ...row } },
      disableClose: true
    })
  }

  onDeleteTierAccess(row: any) {
    if (confirm('Are you sure you want to delete this tier access config?')) {
      const ref = doc(this.firestore, "tier access config", row.docid)
      deleteDoc(ref).then(() => console.log('Document successfully deleted'))
    }
  }

  onTierAccessSearch() {
    const search = this.tierAccessSearchText.trim().toLowerCase();
    let filtered = [...this.tierAccessData];
    if (search) {
      filtered = filtered.filter(row =>
        (this.maptier[row.tierid] || '').toLowerCase().includes(search) ||
        (row.tieraccessby || '').toLowerCase().includes(search)
      );
    }
    filtered.sort((a, b) => (this.maptierOrder[a.tierid] ?? 999) - (this.maptierOrder[b.tierid] ?? 999));
    this.filteredTierAccessData = filtered;
  }
  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
  }
}

