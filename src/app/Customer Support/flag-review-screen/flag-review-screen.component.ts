import { Component, ElementRef, Input, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FormGroup, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, docData, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { Subject, takeUntil } from 'rxjs';
import { InsertMessageDialogComponent } from '../insert-message-dialog/insert-message-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { LinebreaksPipe, LinkPipe } from "../../custompipe.pipe";

@Component({
  selector: 'app-flag-review-screen',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    MatMenuModule,
    FormsModule,
    MatProgressBarModule,
    MatDividerModule,
    ReactiveFormsModule,
    LinebreaksPipe,
    LinkPipe
  ],
  templateUrl: './flag-review-screen.component.html',
  styleUrl: './flag-review-screen.component.css'
})
export class FlagReviewScreenComponent {

  @Input() status: any[] = [];
  @Input() validators: any[] = [];
  @Input() negligence: any[] = [];
  @Input() categories: any[] = [];
  @Input() clientid = "";
  @Input() profileid = "";
  @Input() mapuserId = {};
  @Input() mapprofiledata: {};
  @Input() weeknumber: number = 0;
  @Input() weekYear: number = 0;
  @ViewChildren('itemElement') itemElements: QueryList<ElementRef>;

  private subscription = new Subject<void>();
  @ViewChild('fileInput') fileInput: ElementRef;
  @ViewChild('menuTrigger') menuTrigger!: MatMenuTrigger;
  @ViewChild('targetElement') targetElement!: ElementRef;
  @ViewChild('flagmenu') flagmenu: MatMenu;
  [x: string]: any;
  // @ViewChild('tableContainer') tableContainer!: ElementRef;
  // private savedScrollPosition: number = 0;

  flagform!: FormGroup

  timegapform!: FormGroup

  // Array declarations
  clientMessages = [];
  severityList = ["Urgent", "Escalation","Important", "Normal", "Critical", "Emergency"];
  negligencelist = [];
  ratingList = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  clientTicketsLog = [];
  categorylist = [];
  negligenceFlagID = [];
  validatorsList = [];
  validateMetrics = [];
  reviewedTickets = [];

  // Object declarations 
  mapUserId = {};
  currentIssueData = {};
  mapProfileData = {};
  negligenceData = {};
  negligenceMetrics = {};
  negligenceCheck = {};
  mapTicketData = {};

  // null declarations 
  popupData: any = null;

  // String declarations 
  loggedinprofile_id: string = "";
  flagseverity: string = "";

  // boolean declarations 
  loading: boolean = true;
  markreview: boolean = false;
  enableFlag: boolean = false;

  // numeric declarations 
  progressvalue = 0;
  private currentIndex = -1

  constructor(private fb: Firestore,
    private snackbar: MatSnackBar,
    private formbuilder: FormBuilder,
    private dialog: MatDialog,
  ) {
    this.flagform = this.formbuilder.group({
      category: ['',],
      severity: ['',],
      rating: ['',],
    })
    this.timegapform = this.formbuilder.group({
      category: ['',],
      severity: ['',],
      rating: ['',],
    })
  }

  async ngOnInit() {
    this.negligencelist = this.negligence;
    this.mapUserId = this.mapuserId;
    this.categorylist = this.categories;
    this.mapProfileData = this.mapprofiledata;
    this.loggedinprofile_id = this.profileid;
    this.validatorsList = this.validators;

    // fetch tikcets from client issue collection 
    try {
      const clientissueRef = collection(this.fb, 'clientissue')
      const clientissueQuery = query(clientissueRef, where("clientid", "==", this.clientid), orderBy("reporteddate", "asc"))
      const clientissue = await getDocs(clientissueQuery);
      let count = 0;
      if (clientissue.docs.length != 0) {
        let openArray = [];
        let closedArray = [];
        for (let i = 0; i < clientissue.docs.length; i++) {
          const ticketref = clientissue.docs[i].ref;
          const clientdata = clientissue.docs[i].data();
          if (i == 0) {
            this.currentIssueData = clientdata;
          }

          if (!this.negligenceMetrics.hasOwnProperty(clientdata['issueno'])) {
            this.negligenceMetrics[clientdata['issueno']] = "";
          }
          this.clientTicketsLog.push(clientdata);
          this.mapTicketData[clientdata['issueno']] = clientdata;

          // if(![null, undefined, []].includes(clientdata['notes'])) {
          //   clientdata['notes'].forEach(notes => {
          //     notes['time'] = notes['date'];
          //     notes['type'] = 'notes';
          //     notes['ticketid'] = clientdata['issueno'];
          //     notes['status'] = clientdata['status']?.status;
          //     tempArray.push(notes)
          //   });
          // }

          // fetch messages of that current ticket
          const messagesRef = collection(ticketref, 'messages');
          await getDocs(messagesRef).then((messages) => {
            if (messages.docs.length != 0) {
              let tempArray = [];
              for (let j = 0; j < messages.docs.length; j++) {
                const messageref = messages.docs[j];
                const messagedata = messages.docs[j].data();
                messagedata['ticketno'] = clientdata['issueno'];
                messagedata['ticketid'] = clientdata['id'];
                messagedata['status'] = clientdata['status']?.status;
                messagedata['messageref'] = messageref;
                messagedata['clientid'] = clientdata['clientid'];
                tempArray.push(messagedata);

                if (j + 1 == messages.docs.length) {
                  tempArray = tempArray.sort((a, b) => a['time'] - b['time']);

                  count = count + 1;
                  this.progressvalue = (count / clientissue.docs.length) * 100;
                  if (![null, undefined, ""].includes(messagedata['status']) && messagedata['status']?.toLowerCase() == "open") {
                    openArray.push(...tempArray);
                  } else if (![null, undefined, ""].includes(messagedata['status']) && messagedata['status']?.toLowerCase() == "closed") {
                    closedArray.push(...tempArray);
                  }
                }
              }
            } else {
              console.log("No Messages Found");
            }
          });

          if (i + 1 == clientissue.docs.length) {
            this.clientMessages = openArray;
            this.clientMessages.push(...closedArray);
            this.loading = false;
            this.scrollToNextTicket(true);
          }
        }
      } else {
        console.log("No Data Found for the Client :(");
      }
    } catch (error) {
      console.error(error);

    }
  }

  // ngOnDestroy() {
  //   for (const keys in this.subscription) {
  //     if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
  //       const element = this.subscription[keys];
  //       if(![null,undefined].includes(element)){
  //         element.unsubscribe();
  //       }
  //     }
  //   }
  // }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  //scroll to the index in messages
  scrollToNextTicket(forward: boolean) {
    if (!this.itemElements || this.itemElements.length === 0) return;    

    const matchingElements = this.itemElements.filter(item => {
      const ticketNo = item.nativeElement.dataset?.ticketno;
      return ticketNo && this.mapTicketData[ticketNo]?.assign.includes(this.loggedinprofile_id);
    });

    if (matchingElements.length === 0) return;

    if (this.currentIndex < 0 || this.currentIndex >= matchingElements.length) {
      this.currentIndex = forward ? -1 : 0;
    }

    let currentTicketNo = this.currentIndex >= 0 ? matchingElements[this.currentIndex].nativeElement.dataset.ticketno : null;
    let newIndex = this.currentIndex;
    let attempts = 0;

    do {
      if (forward) {
        newIndex = (newIndex + 1) % matchingElements.length;
      } else {
        newIndex = (newIndex - 1 + matchingElements.length) % matchingElements.length;
      }
      attempts++;

      if (attempts >= matchingElements.length) {
        console.warn("No different ticket found while scrolling!");
        return;
      }
    } while (matchingElements[newIndex].nativeElement.dataset.ticketno === currentTicketNo);

    this.currentIndex = newIndex;

    const targetTicket = matchingElements[this.currentIndex];
    const elementToScrollTo = targetTicket.nativeElement.querySelector('.ticket-title') || targetTicket.nativeElement;

    elementToScrollTo.scrollIntoView({
      behavior: 'smooth',
      block: forward ? 'center' : 'end'
    });
  }

  // function to check the sender id matches of 2 messages 
  isNotMatch(sender: string, index: number): boolean {
    // if (index == 0 || (![null, undefined, ''].includes(this.clientMessages[index - 1]['sender_uid']) && this.clientMessages[index - 1]['sender_uid'] !== sender)) {
    if (![null, undefined].includes(this.clientMessages[index]['flagid'])) {
      const id = this.negligenceFlagID.findIndex(
        (item) => item === this.clientMessages[index]['flagid']
      );
      if (id == -1) {
        this.negligenceFlagID.push(this.clientMessages[index]['flagid']);
        this.getNegligence(index, 'flag');
        this.negligenceCheck[index] = false;
      }
    }
    return true;
    // }
    // return false;
  }

  // function to check whether there is timegap between 2 messges 
  isTimeGap(sender: string, index: number) {
    if (index > 0 && index < this.clientMessages.length - 1 && this.clientMessages[index - 1]['ticketno'] == this.clientMessages[index]['ticketno']) {
      const time1 = this.clientMessages[index - 1]['time']?.toDate().getTime();
      const time2 = this.clientMessages[index]['time']?.toDate().getTime();
      const differenceInMilliseconds = Math.abs(time1 - time2);
      const timeGapInMinutes = Math.floor(differenceInMilliseconds / (60 * 1000));
      const fiveMinutesInMilliseconds = 5 * 60 * 1000;
      const minutes = Math.floor(differenceInMilliseconds / (60 * 1000));
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let formattedGap = '';
      if (days >= 1) {
        formattedGap = `${days} day${days > 1 ? 's' : ''}`;
      } else if (hours >= 1) {
        formattedGap = `${hours} hour${hours > 1 ? 's' : ''}`;
      } else {
        formattedGap = `${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
      // if the differnce between 2 messages is more than 5 minutes
      if (differenceInMilliseconds > fiveMinutesInMilliseconds) {
        if (![null, undefined].includes(this.clientMessages[index]['timegapid'])) {
          const id = this.negligenceFlagID.findIndex(
            (item) => item === this.clientMessages[index]['timegapid']
          );
          if (id == -1) {
            this.negligenceFlagID.push(this.clientMessages[index]['timegapid']);
            this.getNegligence(index, 'timegap');
          }
        }
        return { isGap: true, formattedGap };
      } else {
        return { isGap: false, formattedGap: '0' };
      }
    }
    return { isGap: false, formattedGap: '0' };
  }

  // function to the get the negligence data marked 
  async getNegligence(index: number, type) {
    const negligencemeterdoc = doc(this.fb, 'negligencemeter', this.clientMessages[index][type == 'flag' ? 'flagid' : 'timegapid'])
    docData(negligencemeterdoc).pipe(takeUntil(this.subscription)).subscribe((negligence) => {
      if (negligence) {
        this.negligenceData[negligence['docid']] = negligence['negligence'];
      } else {
        this.negligenceData[this.clientMessages[index][type == 'flag' ? 'flagid' : 'timegapid']] = [];
      }
    });
  }

  // function to submit the review that got marked 
  async submitReview(chatDoc, index, type, form) {
    this.markreview = false;

    if (chatDoc.hasOwnProperty(type == 'flag' ? 'flagid' : 'timegapid') && chatDoc[type == 'flag' ? 'flagid' : 'timegapid'] != '') {
      const negligencemeterGetdoc = doc(this.fb, 'negligencemeter', type == 'flag' ? chatDoc.flagid : chatDoc.timegapid)
      getDoc(negligencemeterGetdoc).then(async (negligence) => {
        if (negligence.exists()) {

          let negligencedata = negligence.data();
          if (!negligencedata['negligence']) {
            negligencedata['negligence'] = [];
          }

          let existProfile = negligencedata['negligence'].find((e) => e?.markedby == this.loggedinprofile_id);
          negligencedata['negligence'] = negligencedata['negligence'].filter((e) => e?.markedby != this.loggedinprofile_id);

          let map = {
            "category": ![null, undefined, ""].includes(form['category']) ? form['category'] : null,
            "severity": ![null, undefined, ""].includes(form['severity']) ? form['severity'] : null,
            "rating": ![null, undefined, ""].includes(form['rating']) ? form['rating'] > 10 ? 10 : form['rating'] < 0 ? 0 : form['rating'] : null,
            "markedby": this.loggedinprofile_id,
            "lastupdate": new Date(),
            "type": existProfile == -1 ? 'new' : 'edited'
          }
          negligencedata['negligence'].push(map);
          negligencedata['lastupdate'] = new Date();
          const negligencemeterUpdatedoc = doc(this.fb, 'negligencemeter', type == 'flag' ? chatDoc.flagid : chatDoc.timegapid)
          await updateDoc(negligencemeterUpdatedoc, negligencedata).then(() => {
            this.openSnackBar("Review Marked Successfully", "OK");
            if (this.reviewedTickets.includes(chatDoc['ticketno'])) {
              this.reviewedTickets = this.reviewedTickets.filter((e) => e != chatDoc['ticketno']);
            }

            if (![null, undefined, ""].includes(map['rating'])) {

              if (this.negligenceMetrics[chatDoc['ticketno']] == "" && map['rating'] == 0) {
                this.negligenceMetrics[chatDoc['ticketno']] = map['rating']
              } else {
                if (map['rating'] > this.negligenceMetrics[chatDoc['ticketno']]) {
                  this.negligenceMetrics[chatDoc['ticketno']] = map['rating'];

                  if (!this.validateMetrics.includes(chatDoc['messageid'])) {
                    this.validateMetrics.push(chatDoc['messageid']);
                  }
                } else {
                  if (this.validateMetrics.includes(chatDoc['messageid'])) {
                    this.negligenceMetrics[chatDoc['ticketno']] = map['rating']
                  }
                }
              }
            }

          }).catch((error) => {
            this.openSnackBar("Error Marking Review", "OK");
          });
        } else {
          console.log("OOPS!!! No Data Found In The Document");
        }
      });
    } else {

      let Id = doc(collection(this.fb, 'negligencemeter')).id
      let negligencedata = {
        "docid": Id,
        "ticketid": chatDoc['ticketid'],
        "profileid": this.clientid,
        "type": type == 'flag' ? 'negligenceflag' : 'negligencetimegap',
        "created": new Date(),
        "lastupdate": new Date(),
        "negligence": [{
          "category": ![null, undefined, ""].includes(form['category']) ? form['category'] : null,
          "severity": ![null, undefined, ""].includes(form['severity']) ? form['severity'] : null,
          "rating": ![null, undefined, ""].includes(form['rating']) ? form['rating'] > 10 ? 10 : form['rating'] < 0 ? 0 : form['rating'] : null,
          "markedby": this.loggedinprofile_id,
          "lastupdate": new Date()
        }]
      };

      this.clientMessages[index][type == 'flag' ? 'flagid' : 'timegapid'] = Id;

      const fieldsToRemove = ["status", "messageref"];
      let currIndex = this.clientMessages[index];

      const updatedCurrObj = Object.keys(currIndex)
        .filter(key => !fieldsToRemove.includes(key))
        .reduce((acc, key) => {
          acc[key] = currIndex[key];
          return acc;
        }, {});

      updateDoc(this.clientMessages[index]['messageref'].ref, updatedCurrObj).then(() => {
        console.log("Updated Successfully", this.clientMessages[index]['messageref']);
      }).catch((error) => {
        console.log("Error Updating", this.clientMessages[index]['messageref']);
      });
      const negligencemeterSetdoc = doc(this.fb, 'negligencemeter', Id)
      await setDoc(negligencemeterSetdoc, negligencedata).then(() => {
        this.openSnackBar("Review Marked Successfully", "OK");
        if (this.reviewedTickets.includes(chatDoc['ticketno'])) {
          this.reviewedTickets = this.reviewedTickets.filter((e) => e != chatDoc['ticketno']);
        }
        if (![null, undefined, ""].includes(negligencedata['negligence'][0]['rating'])) {

          if (this.negligenceMetrics[chatDoc['ticketno']] == "" && negligencedata['negligence'][0]['rating'] == 0) {
            this.negligenceMetrics[chatDoc['ticketno']] = negligencedata['negligence'][0]['rating']
          } else {
            if (negligencedata['negligence'][0]['rating'] > this.negligenceMetrics[chatDoc['ticketno']]) {
              this.negligenceMetrics[chatDoc['ticketno']] = negligencedata['negligence'][0]['rating'];

              if (!this.validateMetrics.includes(chatDoc['messageid'])) {
                this.validateMetrics.push(chatDoc['messageid']);
              }
            } else {
              if (this.validateMetrics.includes(chatDoc['messageid'])) {
                this.negligenceMetrics[chatDoc['ticketno']] = negligencedata['negligence'][0]['rating']
              }
            }
          }
        }
      }).catch((error) => {
        this.openSnackBar("Error Marking Review", "OK");
      });
    }
    this.resetForm();
  }

  // function to flag and unflag data 
  updateFlag() {
    const currFlag = this.currentIssueData;

    if ([null, undefined, false].includes(currFlag['flag'])) {
      this.enableFlag = !this.enableFlag;
    } else if (currFlag['flag'] === true) {

      const confirmUnflag = confirm("Are you sure to unflag this ticket?");
      if (confirmUnflag) {
        currFlag['flag'] = false;
        const clientissueDoc = doc(this.fb, 'clientissue', currFlag['id'])
        updateDoc(clientissueDoc, currFlag).then(() => {
          this.currentIssueData['flag'] = currFlag['flag'];
          this.openSnackBar('Ticket Successfully Unflagged', 'OK');
        });
      }
    }
  }

  // function to update flag data 
  updateData() {
    let currFlag = this.currentIssueData;
    let x = confirm("Are you sure to flag this ticket");

    if (x) {
      currFlag['flag'] = true;
      currFlag['flagdata'] = {
        "severity": this.flagseverity,
        "flaggedby": this.loggedinprofile_id,
        "time": new Date()
      };
      const clientissueupdate = doc(this.fb, 'clientissue', currFlag['id'])
      updateDoc(clientissueupdate, currFlag).then(() => {
        this.openSnackBar('Ticket Successfully Flagged', 'OK');
      });
    }
    this.flagseverity = "";
    this.enableFlag = false;
  }

  // function to update marked data 
  async updateMarked(ticketid) {
    let x = confirm("Are you sure to mark as review completed");

    if (x) {
      const element = this.clientTicketsLog.find((e) => e['id'] == ticketid);
      if ([null, undefined].includes(element['review'])) {
        element['review'] = {}
      }
      element['review'][this.loggedinprofile_id] = new Date();

      if (this.validatorsList.includes(this.loggedinprofile_id)) {
        if ([null, undefined].includes(element['mandatereview'])) {
          element['mandatereview'] = {};
        }
        element['mandatereview'][this.loggedinprofile_id] = new Date();
      }

      element['flag'] = false;

      if ([null, undefined].includes(element['negligencemetrics'])) {
        element['negligencemetrics'] = {}
      }

      let weekyear = `${this.weeknumber}${"-"}${this.weekYear}`;

      if (![null, undefined, ""].includes(this.negligenceMetrics[element['issueno']])) {

        if (element['negligencemetrics'].hasOwnProperty(weekyear) && this.negligenceMetrics[element['issueno']] > element['negligencemetrics'][weekyear]) {
          element['negligencemetrics'][weekyear] = this.negligenceMetrics[element['issueno']];
        } else {
          element['negligencemetrics'][weekyear] = this.negligenceMetrics[element['issueno']];
        }
      }
      const clientissueDocupdate = doc(this.fb, 'clientissue', element['id'])
      updateDoc(clientissueDocupdate, element).then(() => {
        console.log('Review Marked For Ticket', element['issueno']);
        this.openSnackBar(`Review Marked For Ticket ${element['issueno']}`, "OK");
        if (!this.reviewedTickets.includes(element['id'])) {
          this.reviewedTickets.push(element['id']);
        }
      }).catch((error) => {
        console.log("Error Marking Review For Ticket", element['issueno']);
        this.openSnackBar(`Error Review Marked For Ticket ${element['issueno']}`, "OK");
      });
    }
  }

  // function to open popup of ticket details 
  showPopup(row: any, event: MouseEvent) {
    this.popupData = row;
    const targetElement = event.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
  }

  // function to close popup 
  hidePopup() {
    this.popupData = null;
  }

  // function to change the current viewing data 
  changeTicket(ticket) {
    this.currentIssueData = this.clientTicketsLog.find((e) => e['id'] == ticket['id']);
    this.enableFlag = false;
  }

  // function to open snack bar 
  openSnackBar(message: string, action: string) {
    this.snackbar.open(message, action, { duration: 2000 })
  }

  // function to reset form to default 
  resetForm() {
    this.flagform.controls['category'].setValue('');
    this.flagform.controls['severity'].setValue('');
    this.flagform.controls['rating'].setValue('');
    this.timegapform.controls['category'].setValue('');
    this.timegapform.controls['severity'].setValue('');
    this.timegapform.controls['rating'].setValue('');
  }

  // function to download clicked file 
  downloadFiles(url) {
    window.open(url, '_blank');
  }

  // function to open insert message dialog 
  async insertMessage(chat) {
    this.dialog.open(InsertMessageDialogComponent, {
      disableClose: true,
      width: '50vw',
      data: {
        data: chat,
        mapprofile: this.mapProfileData,
        clientid: this.clientid
      }
    })
  }

  // function to validate and restrict key press other than 0-10
  validateKeyPress(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete'];
    const key = event.key;

    if (!allowedKeys.includes(key) && !/^\d$/.test(key)) {
      event.preventDefault();
    }
  }

  // function to reset and keep value between 0 to 10 
  validateInput(event: Event): void {
    let input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);

    if (value < 0) {
      value = 0;
    } else if (value > 10) {
      value = 10;
    }
    input.value = value.toString();
    // this.flagform.controls.rating.setValue(input.value)
  }

  // function to get scroll location 
  // onTableScroll(event: Event): void {
  //   const target = event.target as HTMLElement;
  //   this.savedScrollPosition = target.scrollTop;
  // }

  // function to retrieve back scroll position 
  // onTabChange(event: any): void {
  //   if (event.index === this.tabIndex-1) { 
  //     setTimeout(() => {
  //       if (this.tableContainer) {
  //         this.tableContainer.nativeElement.scrollTop = this.savedScrollPosition;
  //       }
  //     });
  //   }
  // }

}
