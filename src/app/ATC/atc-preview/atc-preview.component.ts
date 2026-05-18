import { Component } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { DomSanitizer } from '@angular/platform-browser';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';

@Component({
  selector: 'app-atc-preview',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  templateUrl: './atc-preview.component.html',
  styleUrl: './atc-preview.component.css'
})
export class AtcPreviewComponent {
  // private firestore = inject(Firestore);
  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  atcID: string;
  marathonId: string;
  assignmentId: string;
  participantAssignmentId: string;

  loading: boolean = true;
  collectionName: string;
  processing: boolean = false;
  mentorPathSet: Set<string> = new Set();
  selectedParticipant: any = {};
  reportATC = {
    atcData: null as any,
    profile_name: null as string | null,
    bigactivity: {} as any,
    directive: null as string | null,
    date: '' as any,
    product: "" as string,
    atcpath: "" as string,
    notesid: null as string | null,
    atceducation: [] as any[],
    validator: [] as any[],
    transcription: [] as any[]
  };

  existingNotes: any = null;
  procedureMap: any = {};
  profileMap: any = {};
  mapBigActivity: any = {};
  mapProfile: any = {};
  
  authorActivity: any[] = [];
  observerActivity: any[] = [];
  assignedtoActivity: any[] = [];
  mentorActivity: any[] = [];
  otherBigActivity: any[] = [];
  selectedAdditionalActivity: any[] = [];
  mentorList = [];
  authorList = [];

  specialistsByActivity: any[] = [];
  adjustmentAwarenessDetail: any = {};

  audioUrls: string[] = [];
  imageUrls: string[] = [];
  atcImageUrls: string[] = [];

  // Notes for actions
  actionNotes: string = '';
  loggedInProfileId: string;

  constructor(
    public router: Router,
    public route: ActivatedRoute,
    public guard: AuthguardService,
    private domSanitizer: DomSanitizer,
    public location: Location,
    public datepipe: DatePipe
  ) {
    route.queryParams.subscribe(data => {
      this.atcID = data['atcdocid'];
      this.marathonId = data['marathonid'];
      this.assignmentId = data['assignmentid'];
      this.participantAssignmentId = data['participantassignmentid'];
      this.collectionName = data['type'] == "alpha" ? "atc_alpha" : "atc_to_validate";
      
      guard.getRoles().then(async roles => {
        this.loggedInProfileId = roles['profile_ref'].id
        getDocs(collection(this.firestoreDefault, "profile_data")).then(snap => {
          snap.docs.map(e => this.mapProfile[e.ref.path] = e.data())
        })
        await this.fetchPreData();
        this.getATC();
      }).catch(err => {
        this.loading = false;
        console.log(err);
      });
    });
  }

  ngOnInit(): void {
    getDoc(doc(this.firestoreDefault, "classify", "adjustment_awareness")).then(snap => {
      this.adjustmentAwarenessDetail = snap.data();
    });
  }

  async fetchPreData() {
    await getDocs(query(collection(this.firestoreDefault, "users_roles"), orderBy("name"))).then(async users => {
      for (let i = 0; i < users.docs.length; i++) {
        var userDoc = users.docs[i];
        var userData = userDoc.data();
        this.profileMap[userData["profile_ref"].id] = userData['name'];
      }
    });

    await getDocs(query(collection(this.firestoreDefault, "bigactivity"), orderBy("activity", "asc"))).then(list => {
      for (let i = 0; i < list.docs.length; i++) {
        const docItem = list.docs[i];
        var data = docItem.data();
        console.log(data);
        
        var atcProperty = data["atcproperty"];
        this.mapBigActivity[docItem.id] = data["activity"];
        
        if (atcProperty == "author") {
          this.authorActivity.push({...data, docid: docItem.id});
        } else if (atcProperty == "observer") {
          this.observerActivity.push({...data, docid: docItem.id});
        } else if (atcProperty == "mentoring") {
          this.mentorActivity.push({...data, docid: docItem.id});
        } else if (atcProperty == "assigned_to") {
          this.assignedtoActivity.push(data)
        } else {
          this.otherBigActivity.push({...data, docid: docItem.id});
        }
      }
    });

    await getDocs(query(collection(this.firestoreDefault, 'procedures'), orderBy('name'))).then(procedures => {
      procedures.forEach(docItem => {
        this.procedureMap[docItem.ref.path] = docItem.data()['name'];
      });
    });

    await getDocs(query(collection(this.firestoreDefault, "users_roles"), orderBy("name"))).then(async users => {
      var mentor = []
      var author = []
      for (let i = 0; i < users.docs.length; i++) {
        var userDoc = users.docs[i]
        var userData = userDoc.data()
        this.profileMap[userData["profile_ref"].id] = userData['name']
        if (userData["mentor"]) {
          mentor.push({
            authorpath: userData["profile_ref"]["path"],
            authorname: userData["name"]
          })
        }
        if (userData["changeagent"] || userData["eis"] || userData["admin"] || userData["ah"] || userData["mentor"]) {
          author.push({
            authorpath: userData["profile_ref"]["path"],
            authorname: userData["name"]
          })
        }
      }
      this.mentorList = mentor
      this.authorList = author
    })
  }

  async getATC() {
    var totalProcedureRead = 0;
    
    await getDoc(doc(this.firestoreATC, this.collectionName, this.atcID)).then(async atcData => {
      var atcDocData = atcData.data();

      getDoc(doc(this.firestoreDefault, "profile_data", atcDocData["profileid"])).then(participant => {
        if (participant.exists()) {
          this.selectedParticipant = participant.data();
        }
      });

      if (atcDocData["notesid"] != null) {
        await getDoc(doc(this.firestoreATC, "atc_notes", atcDocData["notesid"])).then(async snap => {
          if (snap.exists()) {
            this.existingNotes = snap.data();
            this.audioUrls = this.existingNotes['changeworkbrief'] || [];
            this.imageUrls = this.existingNotes['imagenotes'] || [];
          }
        });
      }

      this.reportATC.atcData = atcDocData;
      this.reportATC.profile_name = this.profileMap[atcDocData['profileid']];
      this.reportATC.directive = atcDocData["directive"] ?? null;
      this.reportATC.atcpath = atcData.ref.path;
      this.reportATC.product = atcDocData['product'] != null ? atcDocData['product'] : null;
      this.reportATC.notesid = atcDocData['notesid'] != null ? atcDocData['notesid'] : null;
      this.reportATC.date = atcDocData['prescription_date'].toDate();
      this.reportATC.atceducation = atcDocData["atceducation"] != null ? atcDocData["atceducation"] : [];
      this.reportATC.validator = atcDocData["validator"]?.map((e: any) => e.id);
      this.atcImageUrls = atcDocData["prescription_image"] || [];

      var atcActivity = Object.keys(atcDocData["bigactivity"] ?? {});
      if (atcActivity.length == 0) {
        this.reportATC.bigactivity[this.authorActivity[0].docid] = atcDocData["author"]?.map(e => e.path) ?? []
      }
      atcActivity.forEach(bigactivityID => {
        var specialist = (atcDocData["bigactivity"][bigactivityID] ?? []).map((e: string) => "profile_data/" + e);
        if (this.otherBigActivity.filter(e => e.docid == bigactivityID).length != 0) {
          this.selectedAdditionalActivity.push({
            activity: bigactivityID,
            specialist: specialist
          });
          
        } else {
          this.reportATC.bigactivity[bigactivityID] = specialist;
        }
      });

      // Prepare specialist data
      Object.keys(this.reportATC.bigactivity).forEach(e => {
        var activitySpecialist = this.reportATC.bigactivity[e];
        if (activitySpecialist.length != 0) {
          this.specialistsByActivity.push({
            activity: this.mapBigActivity[e],
            specialists: activitySpecialist.map((profile: string) => this.profileMap[doc(this.firestoreDefault, profile).id])
          });
        }
      });

      this.selectedAdditionalActivity.forEach(e => {
        if (e.specialist.length != 0) {
          this.specialistsByActivity.push({
            activity: this.mapBigActivity[e.activity],
            specialists: e.specialist.map((profile: string) => this.profileMap[doc(this.firestoreDefault, profile).id])
          });
        }
      });

      getDocs(collection(atcData.ref, "corrections")).then(async adjustment => {
        for (let i = 0; i < adjustment.docs.length; i++) {
          var adjustmentData = adjustment.docs[i].data();
          this.reportATC.transcription.push({
            adjData: adjustmentData,
            adjustment: adjustmentData['name'],
            awareness: adjustmentData['awareness'] ?? null,
            awarenessdetail: adjustmentData['awarenessdetail'] ?? null,
            potentialyears: adjustmentData['potentialyears'] ?? null,
            adjustmentdelete: adjustmentData['isdelete'] != null ? adjustmentData['isdelete'] : false,
            procedure: []
          });

          getDocs(collection(adjustment.docs[i].ref, "procedures")).then(procedure => {
            totalProcedureRead = totalProcedureRead + 1;
            for (let j = 0; j < procedure.docs.length; j++) {
              var procedureData = procedure.docs[j].data();
              this.reportATC.transcription[i].procedure.push({
                procedureData: procedureData,
                name: this.procedureMap[procedureData['name'].path],
                proceduredelete: procedureData['isdelete'] != null ? procedureData['isdelete'] : false,
                recommended_to: procedureData['recommended_to'],
                mandatory: procedureData['mandatory'] || false,
                completed: procedureData['status'] === 'completed'
              });
            }
            if (totalProcedureRead == adjustment.size) {
              this.loading = false;
            }
          });
        }
      });
    });
    console.log(this.reportATC);
    
  }

  sanitize(url: string) {
    return this.domSanitizer.bypassSecurityTrustUrl(url);
  }

  goBack() {
    this.location.back();
  }

  onRework() {
    if (this.actionNotes != '') {
      console.log('Rework clicked', this.actionNotes);
      const notes = this.actionNotes;
      const activityref = doc(this.firestoreDefault, "bigformassignment", this.participantAssignmentId);
      const activitylog = [
        {
          activityreference: activityref,
          notes,
          reviewdate: new Date(),
          reviewer: this.loggedInProfileId
        }
      ];
      getDoc(doc(this.firestoreDefault, "big participants assignments", this.participantAssignmentId)).then(docSnapshot => {
        const existingActivityLog = docSnapshot.exists() ? docSnapshot.data()['activitylog'] || [] : [];
        const updatedActivityLog = [...existingActivityLog, ...activitylog];
        return updateDoc(doc(this.firestoreDefault, "big participants assignments", this.participantAssignmentId), {
          activitylog: updatedActivityLog,
          status: "rework",
          activityref: doc(this.firestoreATC, this.collectionName, this.atcID)
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

  async onCompletedActivity() {
    if (!this.actionNotes.trim()) {
      alert('Please enter notes before marking as completed.');
      return;
    }

    if (!confirm('Are you sure you want to mark this Activity as completed?')) {
      return;
    }

    if (this.actionNotes != '') {
      console.log('completed clicked', this.actionNotes);
      console.log(this.participantAssignmentId);
      console.log(this.route.snapshot.queryParams['patchdata']);
      const notes = this.actionNotes;
      await updateDoc(doc(this.firestoreDefault, "big participants assignments", this.participantAssignmentId), {
        status: "completed",
        summary: notes
      }).then(() => {
        console.log("completed");
        window.self.close()
      }).catch(err => {
        console.log(err);
      });

    } else {
      console.log('else');
    }
  }

  async onCompletedATC() {
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
      await updateDoc(doc(this.firestoreDefault, "big participants assignments", this.participantAssignmentId), {
        status: "completed",
        summary: notes
      }).then(() => {
        console.log("completed");
      }).catch(err => {
        console.log(err);
      });

      //ATC Validated
      await updateDoc(doc(this.firestoreATC, this.collectionName, this.atcID), {
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