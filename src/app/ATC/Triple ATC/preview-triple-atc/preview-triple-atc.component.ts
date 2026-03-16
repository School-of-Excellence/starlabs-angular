import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { collection, collectionSnapshots, doc, docData, Firestore, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthguardService } from '../../../authguard.service';

@Component({
  selector: 'app-preview-triple-atc',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatDividerModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './preview-triple-atc.component.html',
  styleUrl: './preview-triple-atc.component.css'
})
export class PreviewTripleATCComponent implements OnInit, OnDestroy {
  loading = false;
  atcid: string;
  atcData: any = null;
  
  // Subscriptions
  atcSubscription: Subscription;
  adjustmentSubscription: Subscription;
  procedureSubscription: Subscription;
  roleSubscription: Subscription;
  
  // Metadata
  profileMap: any = {};
  procedureMap: any = {};
  
  mentorProfileid: string[] = [];
  
  // Processed data
  tripleatclist: any[] = [];
  transcriptionData: any[] = [];

  actionNotes: string = '';
  marathonId:string;
  assignmentId:string;
  participantAssignmentId:string;
  loggedInProfileId:string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private location: Location,
    public guardservice: AuthguardService,
    
  ) { 

    guardservice.getRoles().then(async roles => {
      this.loggedInProfileId = roles['profile_ref'].id
    }).catch(err => {
      this.loading = false;
      console.log(err);
    });

  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(data=>{
      this.atcid = data['atcdocid'];
      this.marathonId = data['marathonid']
      this.assignmentId = data['assignmentid']
      this.participantAssignmentId = data['participantassignmentid']
      if (this.atcid) {
        this.fetchMetaData();
        this.fetchATCData();
      } else {
        alert('No ATC ID provided');
        // this.goBack();
      }
    });
  }

  ngOnDestroy(): void {
    this.atcSubscription?.unsubscribe();
    this.adjustmentSubscription?.unsubscribe();
    this.procedureSubscription?.unsubscribe();
    this.roleSubscription?.unsubscribe();
  }

  fetchMetaData(): void {
    const roleCollection = collection(this.firestore, 'users_roles');
    this.roleSubscription = collectionSnapshots(roleCollection).subscribe(userRoles => {
      const mentorList: string[] = [];
      userRoles.forEach(roleDoc => {
        const role = roleDoc.data();
        this.profileMap[role['profile_ref']['id']] = role;
        if (role['mentor'] === true) {
          mentorList.push(role['profile_ref']['id']);
        }
      });
      this.mentorProfileid = mentorList;
    });

    const procedureCollection = collection(this.firestore, 'procedures');
    collectionSnapshots(procedureCollection).subscribe(procedures => {
      procedures.forEach(procDoc => {
        this.procedureMap[procDoc.ref.path] = procDoc.data()['name'];
      });
    });
  }

  async fetchATCData(): Promise<void> {
    this.loading = true;
    
    const atcDocRef = doc(this.firestore, 'triple atc', this.atcid);
    this.atcSubscription = docData(atcDocRef).subscribe(async (data) => {
      if (data) {
        this.atcData = data;
        await this.fetchTranscriptions();
      } else {
        alert('ATC not found');
        this.goBack();
      }
      this.loading = false;
    });
  }

  async fetchTranscriptions(): Promise<void> {
    const adjCollection = collection(this.firestore, 'triple atc', this.atcid, 'corrections');
    
    this.adjustmentSubscription = collectionSnapshots(adjCollection).subscribe(async (adjustments) => {
      this.transcriptionData = [];
      
      for (const adjustmentDoc of adjustments) {
        const adjustmentData = adjustmentDoc.data();
        const transcription: any = {
          adjustment: adjustmentData['name'],
          adjustmentpath: adjustmentDoc.ref.path,
          perceptualposition: adjustmentData['perceptualposition'],
          comment: adjustmentData['comment'],
          editedby: adjustmentData['editedby'],
          isdelete: adjustmentData['isdelete'],
          newlyadded: adjustmentData['newlyadded'],
          procedure: []
        };

        const procedureCollection = collection(this.firestore, adjustmentDoc.ref.path, 'procedures');
        collectionSnapshots(procedureCollection).subscribe((procedureSnapshot) => {
          if (procedureSnapshot) {
            for (const procedureDoc of procedureSnapshot) {
              const procedureData = procedureDoc.data();
              transcription.procedure.push({
                procedurename: this.procedureMap[procedureData['name']?.path],
                procedurepath: procedureDoc.ref.path,
                completed: procedureData['status'] === 'completed',
                mandatory: procedureData['mandatory'],
                newlyadded: procedureData['newlyadded'],
                isdelete: procedureData['isdelete'],
                recommended_to: procedureData['recommended_to']?.path,
                assigned_to: procedureData['assigned_to']?.map((e: any) => e.path) ?? [],
                assignedname: procedureData['assigned_to']?.map((e: any) => this.profileMap[e.id]?.name)
              });
            }
          }
        });
        
        this.transcriptionData.push(transcription);
      }
      console.log(this.transcriptionData);
      
      this.organizeTripleATCList();
    });
  }

  organizeTripleATCList(): void {
    this.tripleatclist = [];
    
    if (this.atcData['perceptualposition']) {
      for (const position of this.atcData['perceptualposition']) {
        this.tripleatclist.push({
          perceptualposition: position,
          transcription: this.transcriptionData.filter(t => t.perceptualposition === position)
        });
      }
    }
  }

  getProfileName(profileRef: any): string {
    return this.profileMap[profileRef?.id]?.name || 'Unknown';
  }

  getProfileNames(profileRefs: any[]): string {
    if (!profileRefs || profileRefs.length === 0) return '';
    return profileRefs.map(ref => this.getProfileName(ref)).join(', ');
  }

  goBack(): void {
    this.location.back();
  }

  editATC(): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/edittripleATC/' + this.atcid])
    );
    window.open(url, '_blank');
  }

  checkEditedBy(transcription){
    return transcription['editedby'] && !this.atcData['author']?.some((a: any) => a.id === transcription['editedby']?.id)
  }

  markForRework() {
    if (this.actionNotes != '') {
      console.log('Rework clicked', this.actionNotes);
      const notes = this.actionNotes;
      const activityref = doc(this.firestore, "bigformassignment", this.participantAssignmentId);
      const activitylog = [
        {
          activityreference: activityref,
          notes,
          reviewdate: new Date(),
          reviewer: this.loggedInProfileId
        }
      ];
      getDoc(doc(this.firestore, "big participants assignments", this.participantAssignmentId)).then(docSnapshot => {
        const existingActivityLog = docSnapshot.exists() ? docSnapshot.data()['activitylog'] || [] : [];
        const updatedActivityLog = [...existingActivityLog, ...activitylog];
        return updateDoc(doc(this.firestore, "big participants assignments", this.participantAssignmentId), {
          activitylog: updatedActivityLog,
          status: "rework",
          activityref: doc(this.firestore, 'triple atc', this.atcid)
        });
      }).then(() => {
        console.log("New activity log added");
        window.self.close()
      }).catch(err => {
        console.log(err);
      });
    } else {
      console.log('else');
    }
  }

  async validateATC() {
    if (!this.actionNotes.trim()) {
      alert('Please enter notes before marking as completed.');
      return;
    }

    if (!confirm('Are you sure you want to mark this ATC and Activity as completed?')) {
      return;
    }

    if (this.actionNotes != '') {
      console.log('completed clicked', this.actionNotes);
      console.log(this.participantAssignmentId);
      console.log(this.route.snapshot.queryParams['patchdata']);
      const notes = this.actionNotes;
      // Big Activity Completed
      await updateDoc(doc(this.firestore, "big participants assignments", this.participantAssignmentId), {
        status: "completed",
        summary: notes
      }).then(() => {
        console.log("completed");
      }).catch(err => {
        console.log(err);
      });

      //ATC Validated
      await updateDoc(doc(this.firestore, 'triple atc', this.atcid), {
        status: "validated",
      }).then(() => {
        console.log("completed");
        window.self.close();
      }).catch(err => {
        console.log(err);
      });

    } else {
      console.log('else');
    }
  }

}