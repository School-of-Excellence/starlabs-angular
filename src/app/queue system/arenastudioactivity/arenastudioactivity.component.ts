import { Component, OnInit } from '@angular/core';
import { collection, collectionData, collectionSnapshots, doc, documentId, Firestore, limit, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-arenastudioactivity',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatButtonModule,
    CommonModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule,
    MatSnackBarModule,
    ProfilePictureComponent
  ],
  templateUrl: './arenastudioactivity.component.html',
  styleUrl: './arenastudioactivity.component.css'
})
export class ArenastudioactivityComponent {
  selectedValue:any;
  filterText = ""
  queuelist=[];
  arenaparticipant = []
  mapProfile:any ={}
  developer:boolean
  mapZoomAccount = {}
  mapParticipantToToken = {}
  duplicateSpecialistPairing = []
  zoomNotInUseEmails = []

  // Webhook presence (`live assignment log`) for the listed studios, so the
  // Regenerate button can flag when a call is actually in progress.
  private logByLaId: Record<string, any> = {}
  private logSubs: Subscription[] = []
  private logSubKey = ''

  private subscriptionHandle = new Subject<void>()

  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:'Please wait processing ...'},disableClose:true})
  }

  constructor(public firestore: Firestore,private guard : AuthguardService,private dialog : MatDialog,private http: HttpClient,private snack: MatSnackBar) {
    guard.getRoles().then(async roles=>{
      this.developer = roles["developer"]
      // roles["admin"] || roles["ah"] || roles["integrator"] ||
      // if(this.developer){
        guard.getProfileMap().then(e => this.mapProfile = e.map)
        collectionData(query(collection(this.firestore,"queue generation"), orderBy('queueenddate','desc'),limit(5))).pipe(takeUntil(this.subscriptionHandle)).subscribe(snap =>{
          this.queuelist = snap;
        })
        collectionData(query(collection(this.firestore,"zoomaccount"),where("accounttype","==","licensed"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(snap => {
          this.mapZoomAccount = Object.fromEntries(
            snap.map(({email,...rest}) => [email,{email, ...rest}])
          )
          this.zoomNotInUseEmails = snap.filter(e => e['inuse'] === false).map(e => e['email'])
          console.log(this.zoomNotInUseEmails);
          
        })
      // }
    })
  }


  ngOnInit():void{}

  ngOnDestroy(): void {
    this.subscriptionHandle.next()
    this.subscriptionHandle.complete()
  }

  filterQueue(){
    return this.queuelist.filter(e => e["queuename"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  // ---- Dashboard KPI stats (derived from the currently-loaded queue) --------
  get statActive(): number { return this.arenaparticipant?.length || 0 }
  get statZoomFree(): number { return this.zoomNotInUseEmails?.length || 0 }
  get statInCall(): number {
    return (this.arenaparticipant || []).filter((a:any) => this.isCallHappening(a)).length
  }
  get statMismatch(): number {
    return (this.arenaparticipant || []).filter((a:any) =>
      this.mapParticipantToToken[a['participantid']]?.['currentstage'] !== a['stagename']).length
  }
  get statDuplicates(): number {
    return (this.arenaparticipant || []).filter((a:any) =>
      this.duplicateSpecialistPairing.includes((a['pairing'] || []).join(','))).length
  }

  onQueueSelect(value:any){
    collectionSnapshots(
      query(
        collection(this.firestore,"live assignment"),
        where('queueid','==',value),
        where('status','in',['live','recording'])
      )
    ).pipe(
      takeUntil(this.subscriptionHandle)
    ).subscribe(async snap =>{
      this.arenaparticipant = []
      this.duplicateSpecialistPairing = []
      let checkingArray = []
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i].data();
        this.arenaparticipant.push(element);

        let concate = element['pairing'].join(",");
        if(checkingArray.includes(concate)){
          this.duplicateSpecialistPairing.push(concate)
        }else{
          checkingArray.push(concate)
        }
      }
      // Keep presence logs in sync for the listed studios (drives the
      // "call in progress" flag on the Regenerate button).
      this.subscribeStudioLogs(this.arenaparticipant.map((a:any) => a['docid']))
    })
    let queueRef = doc(this.firestore,"queue generation",value)
    collectionData(
      query(
        collection(this.firestore,"queue_token"),
        where("queueref","==",queueRef),
        where("stagestatus", "==", "Approved"),
        where("tokenstatus", "==", "Active")
      )
    ).pipe(
      takeUntil(this.subscriptionHandle)
    ).subscribe(snap => {
      this.mapParticipantToToken = Object.fromEntries(
        snap.map(({profile_id,...rest}) => [profile_id,{profile_id, ...rest}])
      )
      console.log(this.mapParticipantToToken);
      
    })
  }

  // Subscribe to `live assignment log` for the listed studios (documentId() IN,
  // chunks of 30). Re-subscribes only when the id set changes. Feeds isCallHappening().
  private subscribeStudioLogs(ids: string[]): void {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)))
    const key = uniq.slice().sort().join(',')
    if (key === this.logSubKey) return
    this.logSubKey = key
    this.logSubs.forEach(s => s.unsubscribe())
    this.logSubs = []
    this.logByLaId = {}
    for (let i = 0; i < uniq.length; i += 30) {
      const chunk = uniq.slice(i, i + 30)
      const sub = collectionData(
        query(collection(this.firestore, 'live assignment log'), where(documentId(), 'in', chunk)),
        { idField: 'docid' }
      ).pipe(takeUntil(this.subscriptionHandle)).subscribe(
        (rows: any[]) => { rows.forEach(r => { this.logByLaId[r['docid']] = r }) },
        () => {}
      )
      this.logSubs.push(sub)
    }
  }

  // Is anyone currently INSIDE the Zoom call for this studio (webhook truth)?
  // Participant in-call OR any specialist in-call (joined && not left).
  isCallHappening(studio: any): boolean {
    const id = studio?.['docid']
    const log = id ? this.logByLaId[id] : null
    if (!log) return false
    const participantIn = !!log['participantInCallAt'] && !log['participantLeftAt']
    const specialists: any = log['specialists'] || {}
    const specialistIn = Object.values(specialists).some((s: any) => s && s.joinedAt && !s.leftAt)
    return participantIn || specialistIn
  }

  // Admin regenerate — always allowed, but warns hard if a call is in progress
  // (regenerating ends the current meeting and issues a fresh link). Reuses the
  // safe studioZoomLinkRegenerate (which ends the old meeting first).
  async regenerateLink(studio: any){
    const inCall = this.isCallHappening(studio)
    const msg = inCall
      ? '⚠️ A call is CURRENTLY IN PROGRESS for this studio.\n\nRegenerating will END the current call and issue a new link. Everyone in the call will be dropped.\n\nProceed anyway?'
      : 'Regenerate the Zoom link for this studio?'
    if (!confirm(msg)) return

    const zoomdata = studio?.['zoomdata'] ?? {}
    const project = environment?.firebase?.projectId
    const url = `https://us-central1-${project}.cloudfunctions.net/studioZoomLinkRegenerate`
      + `?liveassignmentid=${encodeURIComponent(studio['docid'])}`
      + `&zoomdata=${encodeURIComponent(JSON.stringify(zoomdata))}`
    const loading = this.loading
    try {
      await this.http.get(url, { responseType: 'text' }).toPromise()
    } catch (err) {
      // The function regenerates server-side; a CORS/network blip on the response
      // doesn't mean it failed. Log and move on (mirrors the studio's behaviour).
      console.log('[regenerateLink] response error (ignored)', err)
    }
    loading.close()
  }

  // Copy the host (start_url) or participant (join_url) Zoom link to the clipboard.
  // The link is never shown on screen — just copied.
  copyLink(kind: 'host' | 'participant', studio: any){
    const zd = studio?.['zoomdata'] || {}
    const url = kind === 'host' ? (zd['start_url'] || '') : (zd['join_url'] || '')
    const who = kind === 'host' ? 'Host' : 'Participant'
    if (!url || url === 'Link Broken' || url === 'No Link Generated') {
      this.snack.open(`No ${who.toLowerCase()} link available for this studio`, 'Close', { duration: 2500 })
      return
    }
    const done = () => this.snack.open(`${who} Zoom link copied`, '', { duration: 1600 })
    const fail = () => this.snack.open('Could not copy — clipboard blocked', 'Close', { duration: 2500 })
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, fail)
    } else {
      // Fallback for non-secure contexts.
      try {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
        done()
      } catch { fail() }
    }
  }

  async closeStudio(studio:any){
    console.log(studio);
    if(confirm("are you sure want to close the studio")){
      updateDoc(doc(this.firestore,"live assignment",studio['docid']),{
        status:'completed'
      }).then(() => {console.log("live assignment status changed to completed");
      }).catch((err) => {console.log(err);})
      if(studio["studioid"] != null && studio["studioid"] != undefined){
        updateDoc(doc(this.firestore,"queue studio pairing",studio["studioid"]),{
          status: null
        })
      }
    }
  }
}
