import { Component, OnInit, NgZone } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, updateDoc, where } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { ZoomMtg } from '@zoom/meetingsdk'
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-zoom-meeting',
  imports: [
    MatSnackBarModule,
    CommonModule
  ],
  templateUrl: './zoom-meeting.component.html',
  styleUrl: './zoom-meeting.component.css'
})
export class ZoomMeetingComponent {
  participantData: any = {}
  zoomdata: any = {}
  profileid: string
  profileAssignmentId: string
  assignmentId: string;
  hostname: string
  admin: boolean = false
  screenshots = [];
  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private ngZone: NgZone,
    private snackBar: MatSnackBar
  ) {
    // this.route.snapshot.queryParamMap.get().then((queryParams) => {
    this.profileid = this.route.snapshot.queryParams['profileid']
    this.profileAssignmentId = this.route.snapshot.queryParams['participantAssignmentId'] ?? null
    this.assignmentId = this.route.snapshot.queryParams['assignmentid'];
    this.admin = this.route.snapshot.queryParams['type'] === "1" ? true : false
    getDoc(doc(this.firestore, "big assignment", this.assignmentId)).then(snap => {
      
      if (snap.exists()) {
        if (snap.data()['zoomdata']) {
          console.log('Zoom Data Found');
          this.zoomdata = snap.data();
          this.startmeeting();
        }
      }else {
        console.log('No Document Found');
      }
    });
  }

  ngOnInit(): void {
  }

  async startmeeting() {
    await getDocs(query(collection(this.firestore, 'profile_data'), where('profileid', '==', this.profileid))).then(snap => {
      this.participantData = snap.docs[0].data()
      console.log(this.participantData['name'], this.participantData['email']);
      this.hostname = this.participantData['name']
    })
    if (this.zoomdata && this.zoomdata['zoomdata']) {
      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.13.2/lib', '/av');

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      ZoomMtg.i18n.load('en-US')
      document.getElementById('zmmtg-root')?.style.setProperty('display', 'block');
      console.log("ng zone start");
      //get ZAK Token
      // Extract query string manually
      const urlqueryString = this.zoomdata['zoomdata']['start_url'].split('?')[1]; // "docid=123&userid=456"
      console.log(urlqueryString);

      // Convert to an object
      const urlparams = urlqueryString.split('&').reduce((acc, param) => {
        const [key, value] = param.split('=');
        acc[key] = value;
        return acc;
      }, {});
      console.log("zak", urlparams['zak']);
      this.ngZone.runOutsideAngular(() => {
        console.log("zoom", "admin", this.admin);
        if (this.admin) {
          ZoomMtg.init({
            leaveUrl: `${window.location.origin}/particiant_assignment_board`,
            patchJsMedia: true,
            success: (success: any) => {
              console.log(success);
              ZoomMtg.join({
                sdkKey: "rjad2eLZSIKlamaIwi09tw",
                signature: this.zoomdata['signature'],
                meetingNumber: this.zoomdata['zoomdata']['id'],
                passWord: this.zoomdata['zoomdata']['password'],
                userName: this.participantData['name'],
                userEmail: this.zoomdata['zoomdata']['host_email'],
                zak: urlparams['zak'],
                success: (success: any) => {
                  console.log(success);
                  console.log("zoom successfully joined");
                  this.updateAssignmentStatus(this.route.snapshot.queryParams['assignmentid'], null)
                },
                error: (error: any) => {
                  console.log(error);
                }
              });
            },
            error: (error: any) => {
              console.log(error);
            }
          });
        } else {
          ZoomMtg.init({
            // leaveUrl: "https://star-labs.web.app/particiant_assignment_board",
            leaveUrl: `${window.location.origin}/particiant_assignment_board`,
            patchJsMedia: true,
            success: (success: any) => {
              console.log(success);
              ZoomMtg.join({
                sdkKey: "rjad2eLZSIKlamaIwi09tw",
                signature: this.zoomdata['participantsignature'],
                meetingNumber: this.zoomdata['zoomdata']['id'],
                passWord: this.zoomdata['zoomdata']['password'],
                userName: this.participantData['name'],
                userEmail: this.participantData['email'] ?? "",
                customerKey: this.profileAssignmentId,
                success: (success: any) => {
                  console.log(success);
                  console.log("zoom successfully joined");
                  this.updateAssignmentStatus(this.route.snapshot.queryParams['assignmentid'], this.profileAssignmentId)
                },
                error: (error: any) => {
                  console.log(error);
                }
              });
            },
            error: (error: any) => {
              console.log(error);
            }
          });
        }
      });
    }
  }

  async updateAssignmentStatus(assignmentid: string, participantAssignmentId: string) {
    if (assignmentid) {
      await updateDoc(doc(this.firestore, "big assignment", assignmentid), {
        status: "ongoing"
      })
    }
    if (participantAssignmentId) {
      await updateDoc(doc(this.firestore, "big participants assignments", participantAssignmentId), {
        status: "ongoing"
      })
    }
  }
}



