import { Component, Inject, OnDestroy, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';

import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  setDoc,
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  Timestamp,
  QuerySnapshot,
  DocumentData,
  getDocs,
  writeBatch,
  deleteField
} from '@angular/fire/firestore';
import { AuthguardService } from '../../../authguard.service';
import { Subscription } from 'rxjs';

interface QAItem {
  docid: string;
  profileid: string;
  question: string;
  date: any;
  replyid: string | null;
  workshopId: string;
  isdelete: boolean;
  isadmin?: boolean;
  tag?: string;
  pinned?:boolean;
  pindate?:any;
}

interface ProfileData {
  [key: string]: string;
}

@Component({
  selector: 'app-questionandanswer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './questionandanswer.component.html',
  styleUrl: './questionandanswer.component.css'
})
export class QuestionandanswerComponent implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  
  loggedProfileID: string | null = null;
  loading = true;
  
  questionText = '';
  replyText = '';
  
  replyingToId: string | null = null;
  replyingToProfileId: string | null = null;
  isReplying = false;
  showAllReplies = false;
  selectedQuestionId: string | null = null;
  activeReplyItemId: string | null = null;
  
  profileData: ProfileData = {};
  questions: QAItem[] = [];
  myQuestions: QAItem[] = [];
  pinQuestions: QAItem[] = [];
  othersQuestions: QAItem[] = [];
  repliesMap: { [questionId: string]: QAItem[] } = {};
  
  private subscriptions: Subscription[] = [];

  constructor(
    public dialogRef: MatDialogRef<QuestionandanswerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private guard: AuthguardService,
    private snackBar: MatSnackBar,
    public storage: Storage
  ) {}

  async ngOnInit() {
    try {
      const roles = await this.guard.getRoles();
      this.loggedProfileID = roles.profile_ref.id;
      console.log(this.data, 'consoling qa id', this.loggedProfileID);
      
      await this.loadProfiles();
      this.subscribeToQuestions();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Error initializing component');
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // private async loadProfiles() {
  //   try {
  //     const profilesCollection = collection(this.firestore, 'profile_data');
  //     const snapshot = await getDocs(profilesCollection);
      
  //     snapshot.forEach((doc) => {
  //       const data = doc.data();
  //       this.profileData[doc.id] = data['name'] || doc.id;
  //     });
  //   } catch (error) {
  //     console.error('Error loading profiles:', error);
  //   }
  // }
  private async loadProfiles() {
    this.profileData = {};

    try {
      const profileRef = collection(this.firestore, 'profile_data');
      const newUserRef = collection(this.firestore, 'new_user_data');
      const [profileSnap, newUserSnap] = await Promise.all([
        getDocs(profileRef),
        getDocs(newUserRef).catch(() => null)
      ]);

      
      if (!profileSnap.empty) {
        profileSnap.forEach(doc => {
          const data = doc.data();
          this.profileData[doc.id] = data['name'] || doc.id;
        });
      } else {
        console.warn('"profile_data" collection is empty.');
      }

      if (newUserSnap && !newUserSnap.empty) {
        newUserSnap.forEach(doc => {
          const data = doc.data();
          this.profileData[doc.id] = data['name'] || doc.id;
        });
      } else {
        console.warn('"new_user_data" collection is missing or empty.');
      }

      console.log('profileData:', this.profileData);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }


  private subscribeToQuestions() {
    const questionsQuery = query(
      collection(this.firestore, 'workshopQA'),
      where('workshopId', '==', this.data['workshopId']),
      where('replyid', '==', null),
      where('isdelete', '==', false),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(questionsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      this.questions = [];
      this.myQuestions = [];
      this.othersQuestions = [];
      this.pinQuestions = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as QAItem;
        this.questions.push(data);
        if (data.pinned === true) {
          this.pinQuestions.push(data);
          return;
        }
        if (data.profileid === this.loggedProfileID) {
          this.myQuestions.push(data);
        } else {
          this.othersQuestions.push(data);
        }
      });

      this.subscribeToReplies();
    });

    this.subscriptions.push({ unsubscribe } as any);
  }

  // private subscribeToQuestions() {
  //   const questionsQuery = query(
  //     collection(this.firestore, 'workshopQA'),
  //     where('workshopId', '==', this.data['workshopId']),
  //     where('replyid', '==', null),
  //     where('isdelete', '==', false),
  //     orderBy('date', 'desc')
  //   );

  //   const unsubscribe = onSnapshot(questionsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
  //     this.questions = [];
  //     this.myQuestions = [];
  //     this.othersQuestions = [];
  //     this.pinQuestions = []
      
  //     snapshot.forEach((doc) => {
  //       const data = doc.data() as QAItem;
  //       this.questions.push(data);
        
  //       if (data.profileid === this.loggedProfileID) {
  //         this.myQuestions.push(data);
  //       } else {
  //         this.othersQuestions.push(data);
  //       }
  //     });
  //     this.subscribeToReplies();
  //   });
    
  //   this.subscriptions.push({ unsubscribe } as any);
  // }

  private subscribeToReplies() {
    this.repliesMap = {};
    
    this.questions.forEach(question => {
      const repliesQuery = query(
        collection(this.firestore, 'workshopQA'),
        where('workshopId', '==', this.data['workshopId']),
        where('replyid', '==', question.docid),
        where('isdelete', '==', false),
        orderBy('date')
      );

      const unsubscribe = onSnapshot(repliesQuery, (snapshot: QuerySnapshot<DocumentData>) => {
        this.repliesMap[question.docid] = [];
        snapshot.forEach((doc) => {
          const replyData = doc.data() as QAItem;
          this.repliesMap[question.docid].push(replyData);
        });
      });
      
      this.subscriptions.push({ unsubscribe } as any);
    });
  }

  async askQuestion() {
    if (!this.questionText.trim()) {
      this.showSnackBar('Please enter a question before submitting', 'orange');
      return;
    }

    try {
      const docRef = doc(collection(this.firestore, 'workshopQA'));
      await setDoc(docRef, {
        profileid: this.loggedProfileID,
        question: this.questionText.trim(),
        docid: docRef.id,
        isdelete: false,
        isadmin: true, // Set as admin since this is admin screen
        date: Timestamp.now(),
        replyid: null,
        workshopId: this.data['workshopId']
      });
      
      this.questionText = '';
      
      // Scroll to top after a short delay
      setTimeout(() => {
        if (this.scrollContainer) {
          this.scrollContainer.nativeElement.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      }, 500);
    } catch (error) {
      console.error('Error posting question:', error);
      this.showSnackBar('Error posting question');
    }
  }

  async postReply(question) {
    console.log("consolingggg post questionnn",question);
    if (!this.replyText.trim() || !this.replyingToId) {
      if (!this.replyText.trim()) {
        this.showSnackBar('Please enter a reply before submitting', 'orange');
      }
      return;
    }

    try {
      const docRef = doc(collection(this.firestore, 'workshopQA'));
      let taggedProfileId = null;
      
      if (
        this.replyingToProfileId &&
        this.replyingToProfileId !== this.loggedProfileID
      ) {
        taggedProfileId = this.replyingToProfileId;
      }
      const isOneToOne = question?.onetoone === true;
      const replydata = {
        profileid: this.loggedProfileID,
        question: this.replyText.trim(),
        tag: taggedProfileId,
        docid: docRef.id,
        isdelete: false,
        isadmin: true,
        date: Timestamp.now(),
        replyid: this.replyingToId,
        workshopId: this.data['workshopId'],
        onetoone: isOneToOne
      };
      await setDoc(docRef, replydata);
      console.log("Reply successfully sended:", replydata);
      this.appNotification(replydata)

      this.replyText = '';
      this.cancelReply();
    } catch (error) {
      console.error('Error posting reply:', error);
      this.showSnackBar('Error posting reply');
    }
  }

  async appNotification(result) {
    if (result['tag'] != null && result['tag'] != undefined) {
      const templates = [
        {
          title: `🔥 Your question in the ${this.data['workshopTitle']} has been addressed!`,
          message: `Dive into the EI Flix Web App to read the A&H Team’s response.`
        },
        {
          title: `✅ Your question in the ${this.data['workshopTitle']} has been answered!`,
          message: `Head over to the EI Flix Web App to read the A&H Team’s response now.`
        },
        {
          title: `✨ The A&H Team has responded to your question in the ${this.data['workshopTitle']}!`,
          message: `Open the EI Flix Web App to see their answer.`
        }
      ];
      const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
      result['title'] = randomTemplate.title;
      result['message'] = randomTemplate.message;

      var profileID = [result['tag']];
      console.log(profileID, "profile id workshop notification");

      var notificationimage = null;
      if (result["notificationimage"] != null) {
        const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
        try {
          const storageRef = ref(this.storage, filepath);
          const uploadResult = await uploadBytes(storageRef, result["notificationimage"]);
          notificationimage = await getDownloadURL(uploadResult.ref);
        } catch (error) {
          console.log("file upload error", error);
        }
      }

      this.guard.saveNotificationRecord({
        title: result["title"],
        message: result["message"],
        subtitle: result["subtitle"] ?? null,
        notificationtype: "ahupdate",
        notificationimage: notificationimage,
        sticky: result["sticky"],
        logged: true,
        // landingpage: result["landingpage"],
        profileid: profileID,
      }).then(() => {
        console.log(notificationimage);
        // alert("A&H Update sent to App user " + profileID.length.toString());
      });
    }
  }


  async deleteItem(docId: string) {
    const confirmed = window.confirm('Are you sure you want to delete this item?');
    
    if (confirmed) {
      try {
        console.log('Deleting docId:', docId);
        const docRef = doc(this.firestore, 'workshopQA', docId);
        await updateDoc(docRef, { isdelete: true });
        console.log('✅ Document marked as deleted');
      } catch (error) {
        console.error('❌ Error deleting document:', error);
        this.showSnackBar(`Error deleting: ${error}`);
      }
    } else {
      console.log('❎ Deletion cancelled by user');
    }
  }



  async pinQuestion(docId: string, type: string) {
    const confirmed = window.confirm('Are you sure you want to Pin/Unpin this question?');
    
    if (!confirmed) {
      console.log('Pin cancelled by user');
      return;
    }

    try {
      console.log('Pin docId:', docId);
      const docRef = doc(this.firestore, 'workshopQA', docId);
      let updateData: any = {};
      if (type === 'pin') {
        updateData = {
          pinned: true,
          pindate: Timestamp.now(),
        };
      } else if (type === 'unpin') {
        updateData = {
          pinned: deleteField(),
          unpindate: Timestamp.now(),
        };
      }

      await updateDoc(docRef, updateData);
      console.log(`Document ${type === 'pin' ? 'pinned' : 'unpinned'} successfully`);
    } catch (error) {
      console.error('Error:', error);
      this.showSnackBar(`Error: ${error}`);
    }
  }

  // async pinQuestion(docId: string) {
  //   console.log('Pin docId:', docId);
  //   const confirmed = window.confirm('Are you sure you want to Pin this Question?');
    
  //   if (!confirmed) {
  //     console.log('Pin cancelled by user');
  //     return;
  //   }
  //   try {
  //     const updateData = {
  //       pinned: true,
  //       pindate: Timestamp.now(),
  //     };
  //     const batch = writeBatch(this.firestore);
  //     const mainDocRef = doc(this.firestore, 'workshopQA', docId);
  //     batch.update(mainDocRef, updateData);
  //     const repliesQuery = query(
  //       collection(this.firestore, 'workshopQA'),
  //       where('replyid', '==', docId)
  //     );
  //     const querySnapshot = await getDocs(repliesQuery);
  //     querySnapshot.forEach((replyDoc) => {
  //       const replyRef = doc(this.firestore, 'workshopQA', replyDoc.id);
  //       batch.update(replyRef, updateData);
  //     });
  //     await batch.commit();

  //     console.log('Q&A Pinned successfully');
  //     this.showSnackBar('Question and its replies Pinned successfully');
  //   } catch (error) {
  //     console.error('Error', error);
  //     this.showSnackBar(`Error: ${error}`);
  //   }
  // }

  async moveItem(docId: string) {
    console.log('Movinggg docId:', docId);
    const confirmed = window.confirm('Are you sure you want to move this Question to Admin Only?');
    
    if (!confirmed) {
      console.log('Moving cancelled by user');
      return;
    }
    try {
      const updateData = {
        onetoone: true,
        moved: true,
        moveddate: Timestamp.now(),
      };
      const batch = writeBatch(this.firestore);
      const mainDocRef = doc(this.firestore, 'workshopQA', docId);
      batch.update(mainDocRef, updateData);
      const repliesQuery = query(
        collection(this.firestore, 'workshopQA'),
        where('replyid', '==', docId)
      );
      const querySnapshot = await getDocs(repliesQuery);
      querySnapshot.forEach((replyDoc) => {
        const replyRef = doc(this.firestore, 'workshopQA', replyDoc.id);
        batch.update(replyRef, updateData);
      });
      await batch.commit();

      console.log('Q&A moved successfully');
      this.showSnackBar('Question and its replies moved successfully');
    } catch (error) {
      console.error('Error', error);
      this.showSnackBar(`Error: ${error}`);
    }
  }

  cancelReply() {
    this.replyingToId = null;
    this.replyingToProfileId = null;
    this.isReplying = false;
    this.activeReplyItemId = null;
    this.replyText = null
  }

  toggleShowAllReplies(questionId: string) {
    if (this.selectedQuestionId === questionId && this.showAllReplies) {
      this.showAllReplies = false;
      this.selectedQuestionId = null;
    } else {
      this.showAllReplies = true;
      this.selectedQuestionId = questionId;
    }
  }

  startReply(questionId: string, profileId: string, uniqueId: string) {
    this.replyingToId = questionId;
    this.replyingToProfileId = profileId;
    this.isReplying = true;
    this.activeReplyItemId = uniqueId;
  }

  // Updated method to handle admin display
  getDisplayName(profileId: string, isAdmin?: boolean): string {
    if (isAdmin === true) {
      return 'A&H Team';
    }
    if (profileId === this.loggedProfileID) {
      return 'You';
    }
    return this.profileData[profileId] || profileId;
  }

  getTaggedDisplayName(taggedProfileId: string, parentItem?: QAItem): string {
    if (taggedProfileId === this.loggedProfileID) {
      return 'You';
    }
    
    if (parentItem && parentItem.isadmin === true) {
      return 'A&H Team';
    }
    
    return this.profileData[taggedProfileId] || taggedProfileId;
  }

  findParentItem(reply: QAItem): QAItem | undefined {
    if (!reply.tag) return undefined;
    const parentQuestion = this.questions.find(q => q.profileid === reply.tag);
    if (parentQuestion) return parentQuestion;
    for (const questionId in this.repliesMap) {
      const parentReply = this.repliesMap[questionId].find(r => r.profileid === reply.tag);
      if (parentReply) return parentReply;
    }
    return undefined;
  }

  formatDate(date: any): string {
    if (!date) return '';
    
    let dateTime: Date;
    if (date instanceof Timestamp) {
      dateTime = date.toDate();
    } else if (date instanceof Date) {
      dateTime = date;
    } else {
      return '';
    }
    
    const now = new Date();
    const difference = now.getTime() - dateTime.getTime();
    const minutes = Math.floor(difference / (1000 * 60));
    const hours = Math.floor(difference / (1000 * 60 * 60));
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) {
      return 'now';
    } else if (hours < 1) {
      return `${minutes}m`;
    } else if (days < 1) {
      return `${hours}h`;
    } else {
      return `${days}d`;
    }
  }

  getRepliesForQuestion(questionId: string): QAItem[] {
    return this.repliesMap[questionId] || [];
  }

  getRepliesToShow(questionId: string): QAItem[] {
    const replies = this.getRepliesForQuestion(questionId);
    const shouldShowAll = this.showAllReplies && this.selectedQuestionId === questionId;
    return shouldShowAll ? replies : replies.slice(0, 2);
  }

  shouldShowViewAllReplies(questionId: string): boolean {
    const replies = this.getRepliesForQuestion(questionId);
    const shouldShowAll = this.showAllReplies && this.selectedQuestionId === questionId;
    return replies.length > 2 && !shouldShowAll;
  }

  shouldShowHideReplies(questionId: string): boolean {
    const replies = this.getRepliesForQuestion(questionId);
    const shouldShowAll = this.showAllReplies && this.selectedQuestionId === questionId;
    return shouldShowAll && replies.length > 2;
  }

  isActiveReply(uniqueId: string): boolean {
    return this.activeReplyItemId === uniqueId;
  }

  private showSnackBar(message: string, panelClass: string = 'error-snackbar') {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: [panelClass]
    });
  }

  closeDialog() {
    this.dialogRef.close();
  }

  onQuestionKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.questionText.trim()) {
        this.askQuestion();
      }
    }
  }

  onReplyKeyPress(event: KeyboardEvent,questionorreply) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.replyText.trim()) {
        this.postReply(questionorreply);
      }
    }
  }
}