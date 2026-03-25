import { Component, OnInit,NgZone } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, updateDoc, where } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
// import { ZoomMtg } from '@zoomus/websdk';
import { ZoomMtg } from '@zoom/meetingsdk'
import { HttpClient } from '@angular/common/http';
import { Storage } from '@angular/fire/storage';
import * as RecordRTC from 'recordrtc';
import { AuthguardService } from '../../authguard.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import html2canvas from 'html2canvas';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

type zoomConfig = {
  meetingNumber: string | number;
  userName: string;
  userEmail?: string;
  passWord?: string;
  customerKey?: string;
  tk?: string;
  zak?: string;
  sdkKey?: string;
  signature: string;
  recordingToken?: string;
  childToken?: string;
  success: Function;
  error: Function;
}

@Component({
  selector: 'app-zoom-clientview',
  imports: [
    CommonModule
  ],
  templateUrl: './zoom-clientview.component.html',
  styleUrl: './zoom-clientview.component.css'
})
export class ZoomClientviewComponent {
  mediaRecorder:any;
  recordedChunks: Blob[] = [];
  bufferSize = 5; // seconds
  buffer: Blob[] = [];
  isRecording = false;
  afterClickChunks: Blob[] = [];

  zoomdata:any
  hostname:string 
  profileid: any;
  profileHost:boolean
  screenshots: any = [];
  collectiontype : any;
  documentId : any;
  private subscription: Subscription;
  constructor(private route: ActivatedRoute,private firestore : Firestore,private ngZone:NgZone,  private storage: Storage,private http: HttpClient, private guard: AuthguardService, private snackBar: MatSnackBar) { 
    this.route.params.subscribe(data => {
      console.log(data);
      console.log("docid",data['id']);
      this.documentId = data['id']
      this.collectiontype = data['collectiontype']
      
      const collectionMap = {
        'queue': 'live assignment',
        'appointment': 'appointments'
      };
      const collectionName = collectionMap[this.collectiontype];
      getDoc(doc(this.firestore, collectionName, this.documentId)).then(snap => {
        console.log("docid",snap.id);
        this.zoomdata = snap.data()
        console.log("zoom data",this.zoomdata);
        this.startmeeting();
      })

    })  
    
  }

 

  ngOnInit(): void {
   
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
      this.profileid = roles.profile_ref.id
      const hosts = this.collectiontype === 'queue' ? this.zoomdata["pairing"] : this.zoomdata["hosts"].map(ref => ref.id); 
      this.profileHost = hosts.includes(this.profileid)
      console.log(this.profileHost ? "Host" : "Participant")
      
    })  

    var profileData = {}
    await getDocs(query(collection(this.firestore,'profile_data'), where('profileid', '==', this.profileid))).then(snap => {
      this.hostname = snap.docs[0].data()['name']
      profileData = snap.docs[0].data()
      console.log(this.hostname);
      
    })
    if (this.zoomdata && this.zoomdata['zoomdata']) {
      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.13.2/lib', '/av');

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      ZoomMtg.i18n.load('en-US')
      document.getElementById('zmmtg-root')?.style.setProperty('display', 'block');
      console.log("ng zone start");

      this.ngZone.runOutsideAngular(() => {
        console.log("zoom");

        ZoomMtg.init({
          leaveUrl: this.profileHost ? `${window.location.origin}/dynamicstudio` : `${window.location.origin}/participantstudio`,
          patchJsMedia: true,
          success: (success: any) => {
            console.log(success);
            var zoomConfig:zoomConfig = {
              sdkKey: "rjad2eLZSIKlamaIwi09tw",
              signature: this.profileHost ? this.zoomdata['hostsignature'] : this.zoomdata['participantsignature'],
              meetingNumber: this.zoomdata['zoomdata']['id'],
              passWord: this.zoomdata['zoomdata']['password'],
              userName: this.hostname,
              userEmail: this.profileHost ? this.zoomdata['zoomdata']['host_email'] : profileData["email"],
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
            }
            if(this.profileHost){
              zoomConfig["zak"] = this.zoomdata['zak']
            }
            else{
              zoomConfig["customerKey"] = this.profileid
            }
            ZoomMtg.join(zoomConfig);
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
      await getDoc(doc(this.firestore,'live assignment',this.zoomdata['docid'])).then(snap => {
        data = snap.data();
      });
      console.log(data);
      
      let clipTimings = data['cliptimings'] ? data.cliptimings : [];
  
      // Add the new clip timing to the array
      clipTimings.push(clipTiming);
  
      // Update the document with the new array
      await updateDoc(doc(this.firestore,'live assignment',this.zoomdata['docid']),{ cliptimings: clipTimings });
  
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
}
