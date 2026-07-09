import { Component, OnInit,NgZone } from '@angular/core';
import { collection, collectionGroup, doc, Firestore, getDoc, getDocs, query, updateDoc, where } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
// import { ZoomMtg } from '@zoomus/websdk';
import { ZoomMtg } from '@zoom/meetingsdk'
import { HttpClient } from '@angular/common/http';
import { Storage } from '@angular/fire/storage';
import * as RecordRTC from 'recordrtc';
import { AuthguardService } from '../../authguard.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import html2canvas from 'html2canvas';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MarkAppointmentStatusComponent } from '../mark-appointment-status/mark-appointment-status.component';


@Component({
  selector: 'app-appointment-zoom-view',
  imports: [
    CommonModule
  ],
  templateUrl: './appointment-zoom-view.component.html',
  styleUrl: './appointment-zoom-view.component.css'
})
export class AppointmentZoomViewComponent {
  mediaRecorder:any;
  recordedChunks: Blob[] = [];
  bufferSize = 5; // seconds
  buffer: Blob[] = [];
  isRecording = false;
  afterClickChunks: Blob[] = [];
 

  zoomdata:any
  hostname:string 
  profileid: any;
  screenshots: any = [];
  private dialogOpen = false;
  private buttonCheckInterval: any;
  private observer: MutationObserver | null = null;
  private meetingInitialized = false;
  private zoomUICheckInterval: any = null;
  private maxRetries = 10;
  private retryCount = 0;


  constructor(private route: ActivatedRoute,private firestore : Firestore,private ngZone:NgZone,  private storage: Storage,private http: HttpClient, private guard: AuthguardService, private snackBar: MatSnackBar, private dialog: MatDialog,private router: Router) { 
    this.route.params.subscribe(data => {
      console.log(data);
      console.log("docid",data['id']);
      getDoc(doc(this.firestore,"appointments", data['id'])).then(snap => {
        console.log("docid",snap.id);
        this.zoomdata = snap.data()
        console.log("zoom data",this.zoomdata);
        this.startmeeting();
      })
    })
  }

  ngOnDestroy() {

    // Remove keydown event listener
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.clearScreenshots();
  }

  
 

  loadScreenshots() {
    // Get screenshots from local storage
    this.screenshots = JSON.parse(localStorage.getItem('screenshots') || '[]');
  }

  async startmeeting() {
  
    await this.guard.getRoles().then(async roles=>{
      // this.profileRoles = roles
      this.profileid = roles.profile_ref.id
    })  
    await getDocs(query(collection(this.firestore,'profile_data'), where('profileid', '==', this.profileid))).then(snap => {
      this.hostname = snap.docs[0].data()['name']
      console.log(this.hostname);
      
    })
    if (this.zoomdata && this.zoomdata['zoomdata']) {
      ZoomMtg.setZoomJSLib(`${window.location.origin}/zoom/lib`, '/av');

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      ZoomMtg.i18n.load('en-US')
      document.getElementById('zmmtg-root')?.style.setProperty('display', 'block');
      console.log("ng zone start");

      this.ngZone.runOutsideAngular(() => {
        console.log("zoom");

        ZoomMtg.init({
          leaveUrl: this.buildMeetingEndUrl(),
          patchJsMedia: true,
          defaultView: 'gallery',
          success: (success: any) => {
            console.log(success);
            ZoomMtg.join({
              sdkKey: "rjad2eLZSIKlamaIwi09tw",
              signature: this.zoomdata['signature'],
              meetingNumber: this.zoomdata['zoomdata']['id'],
              passWord: this.zoomdata['zoomdata']['password'],
              userName: this.hostname,
              userEmail: this.zoomdata['zoomdata']['host_email'],
              zak: this.zoomdata['zak'],

              success: (success: any) => {
                console.log(success);
                console.log("zoom successfully joined");
        
                this.snackBar.open('Reminder: You can click the Capture button or press the Tab key to take a video clip', 'Close', {
                  duration: 1000, // Duration in milliseconds
                  horizontalPosition: 'center',
                  verticalPosition: 'top'
                });
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
      });
    }
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

 
  async onClick() {
    try {
      const clickTimestamp = new Date().toISOString(); // Get the current timestamp
      const clipTiming = {
        timestamp: clickTimestamp,
        capturedby: this.profileid
      };
      var data
      await getDoc(doc(this.firestore,'appointments',this.zoomdata['docid'])).then(snap => {
        data = snap.data();
      });
      console.log(data);
      
      let clipTimings = data['cliptimings'] ? data.cliptimings : [];
  
      // Add the new clip timing to the array
      clipTimings.push(clipTiming);
  
      // Update the document with the new array
      await updateDoc(doc(this.firestore,'appointments',this.zoomdata['docid']),{ cliptimings: clipTimings });
  
      console.log('Clip timing updated successfully:', clipTiming);
      this.showPopup();
      this.captureScreenshot();
    } catch (error) {
      console.error('Error updating clip timing:', error);
    }
  }

  
 
  
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      this.onClick();
    }
  }

  showPopup(): void {
    this.snackBar.open('Clip captured', 'Close', {
      duration: 2000, // Duration in milliseconds
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  captureScreenshot() {
    // const videoElement = document.querySelector('#zmmtg-root') as HTMLVideoElement | null;
    const targetElement = document.querySelector('#zmmtg-root') as HTMLElement;
    if (targetElement) {
      html2canvas(targetElement, { useCORS: true, allowTaint: true }).then(canvas => {
        const dataURL = canvas.toDataURL('image/png');
        this.saveScreenshot(dataURL);
        this.updateSlider(dataURL);
    }).catch(error => {
        console.error('Error capturing screenshot:', error);
    });
    
    } else {
      console.error('Target element not found.');
    }
  }
  
  
  saveScreenshot(dataURL: string) {
    // Get existing screenshots from local storage
    const screenshots = JSON.parse(localStorage.getItem('screenshots') || '[]');
    
    // Add the new screenshot
    screenshots.push(dataURL);
    
    // Save back to local storage
    localStorage.setItem('screenshots', JSON.stringify(screenshots));
  }
  
  updateSlider(dataURL: string) {
    this.screenshots.push(dataURL);
  }
  
   
  clearScreenshots() {
    localStorage.removeItem('screenshots');
    this.screenshots = [];
  }

  private buildMeetingEndUrl(): string {
    const data = {
      host:this.hostname,
      hostemail: this.zoomdata['zoomdata']['host_email'],
      meetingId: this.zoomdata['zoomdata']['id'],
      appointmentid: this.zoomdata['docid']
    };
    
    const encoded = encodeURIComponent(JSON.stringify(data));
    return `${window.location.origin}/appointment-status-update?data=${encoded}`;
  }

}
