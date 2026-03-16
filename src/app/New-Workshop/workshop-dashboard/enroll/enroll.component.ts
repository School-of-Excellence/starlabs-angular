import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Firestore, collection, doc, setDoc, updateDoc, serverTimestamp, where, query, getDocs, collectionSnapshots, getDoc } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-enroll',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatChipsModule,MatIconModule
  ],
  templateUrl: './enroll.component.html',
  styleUrl: './enroll.component.css'
})
export class EnrollComponent {
  private enrolledSubscription = new Subject<void>();
  enrolledParticipantProfileIds: string[] = [];
  profiles :string[] = [];
  profilestoenroll :string[] = []
  mapProfile: any = {};
  nameControl = new FormControl<string[]>([], Validators.required);

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<EnrollComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    if (data?.workshopId && data?.profiledata) {
      console.log(data.profiledata,"Print Data");
      this.mapProfile = data.profiledata
      this.profiles = Object.keys(data.profiledata);
      this.loadParticipantEnrolled(data?.workshopId)
    }
  }
  async loadParticipantEnrolled(workshopId:string){
    const workshopref = doc(this.firestore,`workshopconfiguration/${workshopId}`)
    const participantRef = collection(this.firestore,'workshop participant enrolled')
    const q = query(participantRef,where('workshopref', '==', workshopref ))
    collectionSnapshots(q).pipe(takeUntil(this.enrolledSubscription)).subscribe((snapshots)=>{
      const participants = snapshots.map(doc=>({id:doc.id, ...doc.data()}))
      this.enrolledParticipantProfileIds = participants.map((p: any) => p.profileid).filter((id: string) => !!id); 
      this.profilestoenroll = this.profiles.filter(
        (id) =>
          !this.enrolledParticipantProfileIds.includes(id) &&
          this.mapProfile[id]?.name &&
          this.mapProfile[id]?.name.trim() !== ''
      );
      console.log('enrolledParticipantProfileIds:', this.enrolledParticipantProfileIds);
      console.log('Available (Not Enrolled) Profile IDs:', this.profilestoenroll.length);
    })
    console.log(this.profiles.length,"Consoling profiles");
    
  }
  ngOnDestroy(): void {
    console.log("Destroyed");
    this.enrolledSubscription.next();
    this.enrolledSubscription.complete();
  }
  async Enroll() {
    const selectedProfiles = this.nameControl.value || []
    if(!selectedProfiles.length) return;
    const workshopId = this.data?.workshopId;
    const workshopref = doc(this.firestore, `workshopconfiguration/${workshopId}`);
    const participantCollection = collection(this.firestore, 'workshop participant enrolled');
    try{
      const workshopSnap = await getDoc(workshopref);
      const workshopData = workshopSnap.data() || {}; 
    // const workshopSnap = await getDoc(doc(this.firestore, 'workshopconfiguration',workshopId))
      for(const profileid of selectedProfiles){
        const participantWorkshopRef = doc(collection(this.firestore, 'participant workshop'));
        const participantDoc = doc(participantCollection);
        await setDoc(participantDoc,{
          profileid,
          status:'enrollednotstarted',
          workshopref,
          enrollmentdate: serverTimestamp(),
          participantworkshopref:participantWorkshopRef
        })
        await setDoc(participantWorkshopRef,{
          created:serverTimestamp(),
          docref:participantWorkshopRef,
          profileid,
          workshopparticipantenrolledRef:participantDoc,
          workshopref,
          detailpage: workshopData['detailpage'] || null,
          challenges: workshopData['challenges'] || null

        })
      }
      this.dialogRef.close(true);
    }catch(error){
      console.error('❌ Enrollment failed:', error);
    }
  }
  cancel() {
    this.dialogRef.close();
  }
  removeProfile(profileId: string): void {
    const current = this.nameControl.value || [];
    this.nameControl.setValue(current.filter(id => id !== profileId));
  }

}
