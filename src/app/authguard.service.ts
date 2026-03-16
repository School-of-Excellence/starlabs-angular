import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Auth, signOut, user } from '@angular/fire/auth';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Firestore, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, CollectionReference, DocumentReference, serverTimestamp, addDoc, limit, onSnapshot, Timestamp} from '@angular/fire/firestore';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import { environment } from '../environments/environment';
import { getApps, initializeApp } from '@angular/fire/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

interface NotificationData {
  id?: string;
  title: string;
  message: string;
  subtitle?: string;
  type: string;
  notificationimage?: string;
  date: Date;
  read: boolean;
  metadata?: any;
  landingpage?: string;
  sticky?: boolean;
  recordid?: string;
}

@Injectable({
  providedIn: 'root',
})

export class AuthguardService {

  generateId = (firestore: Firestore, collectionName: string) => doc(collection(firestore, collectionName)).id;

  loggedinProfile = {}
  loggedinRoles = {}

  favouriteDashboard = []

  filteredProfile = []
  activateScreen = false
  uid
  pid
  email
  mapsupportdeskmessage = {}
  mapsupportchatmessage = {}
  profileJourneyProduct = {};
  private jsonUrl = '/manifest.json';
  // private messaging = firebaseApp.messaging();
  messaging;
  token: any;
  // rolesObserver;

  //collection variables
  user_dataRef;
  profile_dataRef;
  profile_dataNewUserRef;
  collectionnameRefs;
  userAccessRefs;
  appointmenttypeRefs;
  eisrolesRefs
  productsRefs
  packageRefs
  journeyRefs
  journeytoproductRefs
  proceduresRefs
  deliverablesRefs
  tagsystemRefs
  participantdeliverysequenceRefs
  appointmentsRefs
  participantJourneySequenceRefs
  participantjourneyproductRefs
  availabilityRefs
  queuetokenRefs
  queuestagelogsRefs


  chatgptReport = {
    "uplifereport": "uP! Life Report"
  }
  // notification
  private tokenFCM: string | null = null;
  private userPreferences: any = {};
  private messagings: any
  private notificationSubject = new Subject<NotificationData>();
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private unreadCountListener: any = null;
  private dbName: string;
  private storeName: string;

  isAuthLoading: boolean = false
  constructor(
    private auth: AngularFireAuth,
    private firestore: Firestore,
    private http: HttpClient,
    private router: Router,
    private snackBar: MatSnackBar,
    private datepipe: DatePipe,
    private firebaseAuth: Auth
  ) {

    if (environment.firebase.projectId === "starlabs-test") {
      this.dbName = 'AppCache_Test';
      this.storeName = 'cacheStore_Test';
    } else if (environment.firebase.projectId === "fir-sample-aae4a" || environment.firebase.projectId === "launch-your-legacy-development") {
      this.dbName = 'AppCache_Production';
      this.storeName = 'cacheStore_Production';
    } else {
      // Default fallback
      this.dbName = 'AppCache_' + environment.firebase.projectId;
      this.storeName = 'cacheStore_' + environment.firebase.projectId;
    }

    this.profile_dataRef = collection(this.firestore, 'profile_data')
    this.profile_dataNewUserRef = collection(this.firestore, 'new_user_data')
    this.user_dataRef = collection(this.firestore, 'user_data')
    this.collectionnameRefs = collection(this.firestore, 'collectionname')
    this.userAccessRefs = collection(this.firestore, 'userAccessCounts')
    this.appointmenttypeRefs = collection(this.firestore, 'appointmenttype')
    this.profile_dataRef = collection(this.firestore, 'profile_data')
    this.user_dataRef = collection(this.firestore, 'user_data')
    this.collectionnameRefs = collection(this.firestore, 'collectionname')
    this.userAccessRefs = collection(this.firestore, 'userAccessCounts')
    this.appointmenttypeRefs = collection(this.firestore, 'appointmenttype')
    this.eisrolesRefs = collection(this.firestore, 'eisroles')
    this.productsRefs = collection(this.firestore, 'products')
    this.packageRefs = collection(this.firestore, 'package')
    this.journeyRefs = collection(this.firestore, 'journey')
    this.journeytoproductRefs = collection(this.firestore, 'journey-to-product')
    this.proceduresRefs = collection(this.firestore, 'procedures')
    this.deliverablesRefs = collection(this.firestore, 'deliverables')
    this.tagsystemRefs = collection(this.firestore, 'tagsystem')
    this.participantdeliverysequenceRefs = collection(this.firestore, 'participantdeliverysequence')
    this.appointmentsRefs = collection(this.firestore, 'appointments')
    this.participantJourneySequenceRefs = collection(this.firestore, 'participantJourneySequence')
    this.participantjourneyproductRefs = collection(this.firestore, 'participantjourneyproduct')
    this.availabilityRefs = collection(this.firestore, 'availability')
    this.queuetokenRefs = collection(this.firestore, 'queue_token')
    this.queuestagelogsRefs = collection(this.firestore, 'queue stage log')
    this.user.pipe(map((user) => {
      console.log("authguard", user);
      if (user) {
        this.uid = user.uid
        this.email = user.email
      }
    }))
    const app = initializeApp(environment.firebase);
    try {
      this.messagings = getMessaging(app);
    } catch (error) {
      console.log(error)
    }
  }
  get user(): Observable<any> {
    return this.auth.authState;
  }
  get isLoggedIn(): Observable<any> {
    return this.user.pipe(map((user) => user));
  }

  async getUser() {
    var userData = null
    await this.auth.currentUser.then(user => {
      userData = user
    })
    return userData
  }

  setloading(isLoading: boolean) {
    return this.isAuthLoading = isLoading
  }

  isLoading(): boolean {
    return this.isAuthLoading
  }

  // Firebase Messaging
  async sendPushMessage(title, message, clickable, tokens) {
    console.log('Messaging started');

    var key: string;
    if (environment.firebase.projectId == "test-environment-841c3") {
      key = "key=AAAAeaoVovE:APA91bHhAtIlfc9HEsrUSofRpiF8N6OQoQ61J6p-Oz-8PY7waX7Lvk8C77Rw7AdHqNknYQl5Dplt3YSmOVfV8HPCd_dPW9LyoNXRiPc-HAg-DXCPugYP9qHHJqG2g3_5UBHE7egslUpz";
    } else if (environment.firebase.projectId == "fir-sample-aae4a") {
      key = "key=AAAA5JENlxk:APA91bFRty5M64qvqJC1rDSdMSFO6HYDrtHeTaL0aTkE32ixDWX15PiFPGHwXImYCZ8cSoAOEus7ALqOE55cp1cN18xkGsz8VUKSX8Si7BqgOh_ms7Y7wDakL0QWqnMYMDLxsbNHr9B7";
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      let data = {
        "notification": {
          "title": title,
          "body": message,
          "click_action": clickable,
          "icon": "",
          "sound": "default"
        },
        "to": `${token}`,
        "priority": "high",
      }
      let postData = JSON.stringify(data);
      let url = "https://fcm.googleapis.com/fcm/send";
      this.http.post(url, postData, {
        headers: new HttpHeaders()
          .set('Authorization', key)
          .set('Content-Type', 'application/json'),
      }).subscribe({
        next: (response) => {
          console.log('response', response);
        },
        error: (err) => {
          console.log(err);
          console.log("Error: " + err);
        }
      });
    }
  }



  // canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
  //   this.auth.user.subscribe(async(user)=>{
  //     if(user != null){
  //       this.uid = user.uid
  //       this.email 
  //       = user.email
  //       // await this.requestPermission();
  //       // Update Firestore with the new access count
  //       // await this.updateAccessCount(state.url);
  //     }
  //   })

  //   return this.auth.user.pipe(
  //     take(1),
  //     map(user => !!user),
  //     tap(loggedIn => {
  //       if (!loggedIn) {
  //         console.log('access denied: authguard')
  //         this.router.navigate(['login'], { queryParams: { returnUrl: state.url }});
  //       }
  //     })
  //   )
  // }

  openSnackBar(message: string, action: string, duration: number | null | undefined = null) {
    return this.snackBar.open(message, action, { duration: duration ?? 3000 })
  }

  private async updateAccessCount(url: string): Promise<void> {
    const docRef = doc(this.userAccessRefs)
    await setDoc(docRef, {
      docid: docRef.id,
      uid: this.uid,
      url: url,
      date: new Date()
    })
  }

  async upDashboardLogs(url: string, screenname: string, collectionname: string): Promise<void> {
    const docRef = doc(this.collectionnameRefs)
    await setDoc(docRef, {
      docid: docRef.id,
      uid: this.uid,
      screenname: screenname,
      url: url,
      date: new Date()
    })
  }
  async updateTokenToUser() {
    let profile: any;
    const userdataDoc = doc(this.user_dataRef, this.uid)
    const q = query(this.profile_dataRef, where("user_ref", "==", userdataDoc))
    const profileData = await getDocs(q);
    profile = profileData.docs.length != 0 ? profileData.docs[0].data() : null;

    if (profile != null) {
      const Ref = doc(this.profile_dataRef, profile['profileid'])
      await updateDoc(Ref, {
        notification_token: this.token
      }).then(() => {
        console.log("Token Updated Successfully");
      }).catch((error) => {
        console.log("Oops Error While Updating Token");
      });
    } else {
      console.log("Profile not found");
    }
  }
  private uidSubject = new BehaviorSubject<string | null>(null);
  uid$ = this.uidSubject.asObservable();

  async setUid(value) {
    console.log("set uid function called", value);
    this.uid = value;
    this.uidSubject.next(value);
  }

  async getuid() {
    console.log(this.uid)
    return this.uid
  }

  async getRoles() {
    var roles
    console.log(this.uid, "this uid");
    const userdataDoc = doc(this.user_dataRef, this.uid)
    const rolesQuery = query(this.profile_dataRef, where("user_ref", "==", userdataDoc))
    const profileData = await getDocs(rolesQuery)
    if (profileData.docs.length > 0) {
      const rolesRef = profileData.docs[0].data()['role_ref']
      const roleDoc = await getDoc(rolesRef);
      roles = roleDoc.data();
    }
    return roles
  }
  async routeConfig(route: string): Promise<{ roles: string[], label: string, profileid : string[] }> {
    let allowedRoles: string[] = [];
    let label: string = '';
    let allowedProfiles: string[] = [];

    const querySnapshot = await getDocs(collection(this.firestore, "dashboard"));

    querySnapshot.forEach(doc => {
      const data = doc.data();
      const children = data['children'];

      if (!Array.isArray(children) || children.length === 0) {
        if (data['route'] === route) {
          allowedRoles = data['roles'] || [];
          label = data['label'] || '';
          allowedProfiles = data['profileid'] ?? [];
        }
      } else {
        children.forEach((child) => {
          if (child?.route === route) {
            allowedRoles = child['roles'] || [];
            label = child['label'] || '';
            allowedProfiles = child['profileid'] ?? [];
          }
        });
      }
    });

    return { roles: allowedRoles, label, profileid : allowedProfiles };
  }

  async username() {
    //not in use 
    let profile = {}
    const userUid = doc(this.user_dataRef, this.uid)
    console.log(userUid, "userUid console");
    const profilequery = query(this.profile_dataRef, where("user_ref", '==', userUid))
    const profileData = await getDocs(profilequery)
    if (profileData.docs.length > 0) {
      profile = profileData.docs[0].data()
    }
    return profile
  }

  // Add these properties at the top of your class
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes
  private dbReady: Promise<IDBDatabase> | null = null;

  // Initialize IndexedDB (call once)
  private getDB(): Promise<IDBDatabase> {
    if (this.dbReady) return this.dbReady;

    this.dbReady = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });

    return this.dbReady;
  }

  // Set cache (async)
  private serializeForCache(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.serializeForCache(item));
    }

    if (typeof data === 'object') {
      // Check if it's a Firebase DocumentReference
      if (data.firestore && data.path) {
        return { _ref: true, path: data.path, id: data.id };
      }

      // Check if it's a Firebase Timestamp
      if (data.toDate && typeof data.toDate === 'function') {
        return { _timestamp: true, value: data.toDate().toISOString() };
      }

      // Regular object - recursively clean
      const cleaned: any = {};
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          const value = data[key];
          // Skip functions
          if (typeof value === 'function') continue;
          cleaned[key] = this.serializeForCache(value);
        }
      }
      return cleaned;
    }

    return data;
  }

  private deserializeFromCache(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.deserializeFromCache(item));
    }

    if (typeof data === 'object') {
      // Convert back to Firebase DocumentReference
      if (data._ref === true && data.path) {
        return doc(this.firestore, data.path);
      }

      // Convert back to Firebase Timestamp
      if (data._timestamp === true && data.value) {
        return Timestamp.fromDate(new Date(data.value));
      }

      // Regular object - recursively deserialize
      const restored: any = {};
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          restored[key] = this.deserializeFromCache(data[key]);
        }
      }
      return restored;
    }

    return data;
  }

  // Update setCache to serialize data
  async setCache(key: string, data: any): Promise<void> {
    try {
      const db = await this.getDB();
      const serializedData = this.serializeForCache(data); // Clean the data

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        store.put({
          key: key,
          data: serializedData,
          timestamp: Date.now()
        });

        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          console.error(`❌ Cache failed: ${key}`, transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.warn('setCache error:', error);
    }
  }

  // Get cache (async)
  async getCache(key: string): Promise<any | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;

          if (!result) {
            resolve(null);
            return;
          }

          // Check if expired
          if (Date.now() - result.timestamp > this.cacheExpiry) {
            this.deleteCache(key);
            resolve(null);
            return;
          }

          // Deserialize before returning
          const deserializedData = this.deserializeFromCache(result.data);
          resolve(deserializedData);
        };

        request.onerror = () => {
          console.warn('getCache error:', request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.warn('getCache error:', error);
      return null;
    }
  }

  // Delete single cache
  async deleteCache(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.delete(key);
    } catch (error) {
      console.warn('deleteCache error:', error);
    }
  }

  // Clear all caches (call on logout)
  async clearAllCaches(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.clear();
        transaction.oncomplete = () => {
          resolve();
        };
      });
    } catch (error) {
      console.warn('clearAllCaches error:', error);
    }
  }

  async getProfileMap(forceRefresh: boolean = false) {
    if (!forceRefresh) {
      const cached = await this.getCache('cache_profileMap');
      if (cached) {
        return cached;
      }
    }

    var docdata: any = {};
    var map: any = {};
    var list: any[] = [];
    var level: any = {};
    var email: any = {};
    var phonenumber: any = {};
    var mapUserId: any = {};
    var profileimage: any = {};
    var address: any = {};
    var dob: any = {};
    var myoperatoruid: any = {};
    var number: any = {};
    var mapEmailData: any = {};

    const q = query(this.profile_dataRef, orderBy("name"));
    const profile = await getDocs(q);

    for (let i = 0; i < profile.docs.length; i++) {
      const docSnap = profile.docs[i];
      const data = docSnap.data() as Record<string, any>;  // Fix: Cast to object type

      // Store clean data
      const cleanData: Record<string, any> = Object.assign({}, data, { _id: docSnap.id });

      // Convert user_ref to just the ID
      if (data['user_ref'] && data['user_ref'].id) {
        cleanData['user_ref_id'] = data['user_ref'].id;
        cleanData['user_ref'] = data['user_ref']
        // delete cleanData['user_ref'];
      }

      docdata[docSnap.id] = cleanData;
      mapEmailData[data['email']] = cleanData;
      map[docSnap.id] = data["name"];

      if (data['user_ref']?.id) {
        mapUserId[data['user_ref'].id] = cleanData;
      }

      list.push({
        name: data["name"],
        id: docSnap.id
      });

      var personLevel: any[] = [];
      if (data['installations_level'] != null) {
        personLevel.push(data['installations_level']);
      }
      if (data['atc_level'] != null) {
        personLevel.push(data['atc_level']);
      }
      if (data['changework_level'] != null) {
        personLevel.push(data['changework_level']);
      }

      if (data['myoperatoruid']) {
        myoperatoruid[data['myoperatoruid']] = cleanData;
      }

      level[`profile_data/${docSnap.id}`] = personLevel.length == 0 ? null : personLevel;
      email[docSnap.id] = data['email'] ?? null;
      phonenumber[docSnap.id] = data['number'] ?? null;
      profileimage[docSnap.id] = data['profile'] ?? null;
      address[docSnap.id] = data['address'] ?? null;
      dob[docSnap.id] = data['dateofbirth'] ?? null;
      number[data['number']] = cleanData;
    }

    const result = {
      docdata, map, list, level, email, phonenumber,
      mapUserId, profileimage, address, dob, myoperatoruid,
      number, mapEmailData
    };

    this.setCache('cache_profileMap', result);

    return result;
  }

  // async getProfileMap() {
  //   var docdata = {}
  //   var map = {}
  //   var list = []
  //   var level = {}
  //   var email = {}
  //   var phonenumber = {}
  //   var mapUserId = {}
  //   var profileimage = {}
  //   var address = {}
  //   var dob = {}
  //   var myoperatoruid = {};
  //   var number = {};
  //   var mapEmailData = {};

  //   const q = query(this.profile_dataRef, orderBy("name"))
  //   const profile = await getDocs(q);
  //   for (let i = 0; i < profile.docs.length; i++) {
  //     const doc = profile.docs[i];
  //     docdata[doc.id] = doc.data()
  //     mapEmailData[doc.data()['email']] = doc.data()
  //     map[doc.id] = doc.data()["name"]
  //     if (![null, undefined, ''].includes(doc.data()['user_ref'])) {
  //       mapUserId[doc.data()['user_ref'].id] = doc.data();
  //     }
  //     list.push({
  //       name: doc.data()["name"],
  //       id: doc.id
  //     })
  //     var personLevel = []
  //     if (doc.data()['installations_level'] != null) {
  //       personLevel.push(doc.data()['installations_level'])
  //     }
  //     if (doc.data()['atc_level'] != null) {
  //       personLevel.push(doc.data()['atc_level'])
  //     }
  //     if (doc.data()['changework_level'] != null) {
  //       personLevel.push(doc.data()['changework_level'])
  //     }

  //     if (![null, undefined].includes(doc.data()['myoperatoruid'])) {
  //       myoperatoruid[doc.data()['myoperatoruid']] = doc.data();
  //     }

  //     level[doc.ref.path] = personLevel.length == 0 ? null : personLevel
  //     email[doc.id] = doc.data()['email'] != null ? doc.data()['email'] : null
  //     phonenumber[doc.id] = doc.data()['number'] != null ? doc.data()['number'] : null
  //     profileimage[doc.id] = doc.data()['profile'] != null ? doc.data()['profile'] : null
  //     address[doc.id] = doc.data()['address'] != null ? doc.data()['address'] : null
  //     dob[doc.id] = doc.data()['dateofbirth'] != null ? doc.data()['dateofbirth'] : null
  //     number[doc.data()['number']] = doc.data();
  //   }
  //   return { docdata, map, list, level, email, phonenumber, mapUserId, profileimage, address, dob, myoperatoruid, number, mapEmailData }
  // }

  async getProfileMapNewUser(){
    var docdata = {}
    var map = {}
    var list = []
    var level = {}
    var email = {}
    var phonenumber = {}
    var mapUserId = {}
    var profileimage = {}
    var address = {}
    var dob = {}
    var myoperatoruid = {};
    var number = {};
    var mapEmailData = {};

    const q = query(this.profile_dataNewUserRef, orderBy("name"))
    const profile = await getDocs(q);
    for (let i = 0; i < profile.docs.length; i++) {
      const doc = profile.docs[i];
      docdata[doc.id] = doc.data()
      mapEmailData[doc.data()['email']] = doc.data()
      map[doc.id] = doc.data()["name"]
      if (![null, undefined, ''].includes(doc.data()['uid'])) {
        mapUserId[doc.data()['uid']] = doc.data();
      }
      list.push({
        name: doc.data()["name"],
        id: doc.id
      })
      var personLevel = []
      if (doc.data()['installations_level'] != null) {
        personLevel.push(doc.data()['installations_level'])
      }
      if (doc.data()['atc_level'] != null) {
        personLevel.push(doc.data()['atc_level'])
      }
      if (doc.data()['changework_level'] != null) {
        personLevel.push(doc.data()['changework_level'])
      }

      if (![null, undefined].includes(doc.data()['myoperatoruid'])) {
        myoperatoruid[doc.data()['myoperatoruid']] = doc.data();
      }

      level[doc.ref.path] = personLevel.length == 0 ? null : personLevel
      email[doc.id] = doc.data()['email'] != null ? doc.data()['email'] : null
      phonenumber[doc.id] = doc.data()['number'] != null ? doc.data()['number'] : null
      profileimage[doc.id] = doc.data()['profile'] != null ? doc.data()['profile'] : null
      address[doc.id] = doc.data()['address'] != null ? doc.data()['address'] : null
      dob[doc.id] = doc.data()['dateofbirth'] != null ? doc.data()['dateofbirth'] : null
      number[doc.data()['number']] = doc.data();
    }
    return { docdata, map, list, level, email, phonenumber, mapUserId, profileimage, address, dob, myoperatoruid, number, mapEmailData }
  }
  async getParticipantMetaMap() {
    var docdata = {}
    var map = {}
    var list = []

    const q = query(collection(this.firestore, 'participant metadata'), orderBy("name"))
    const profile = await getDocs(q);
    for (let i = 0; i < profile.docs.length; i++) {
      const doc = profile.docs[i];
      docdata[doc.id] = doc.data()
      map[doc.id] = doc.data()["name"]
      list.push({
        name: doc.data()["name"],
        id: doc.id
      })
    }
    return { docdata, map, list }
  }
  async getAppointmentMap() {
    let map = {}
    var mapData = {}
    var list = []
    const appointmentQuery = query(this.appointmenttypeRefs)
    const appointmentDocs = await getDocs(appointmentQuery)
    for (let i = 0; i < appointmentDocs.docs.length; i++) {
      const doc = appointmentDocs.docs[i];
      var data = doc.data()
      mapData[doc.id] = data
      map[doc.id] = data["appointmenttype"]
      list.push(data)
    }
    return { map, mapData, list }
  }

  async getAppointmentRolesMap() {
    let list = []
    let map = {}
    let mapbypath = {}
    const eisrolesQuery = query(this.eisrolesRefs)
    const eisrolesDocs = await getDocs(eisrolesQuery)
    for (let i = 0; i < eisrolesDocs.docs.length; i++) {
      const doc = eisrolesDocs.docs[i];
      var data = doc.data()
      map[doc.id] = data["role"]
      mapbypath[doc.ref.path] = data["role"]
      list.push(data)
    }
    return { map, mapbypath, list }
  }

  async getProductMap() {
    let map = {}
    const productsQuery = query(this.productsRefs)
    const productsDocs = await getDocs(productsQuery)
    for (let i = 0; i < productsDocs.docs.length; i++) {
      const doc = productsDocs.docs[i];
      map[doc.id] = doc.data()["product"]
    }
    return map
  }

  async getProductList() {
    let list = []
    const productsQuery = query(this.productsRefs)
    const productsDocs = await getDocs(productsQuery)
    for (let i = 0; i < productsDocs.docs.length; i++) {
      const docdata = productsDocs.docs[i].data();
      list.push(docdata)
    }
    return list;
  }

  async getPackageMap() {
    let map = {}

    const packageQuery = query(this.packageRefs)
    const packageDocs = await getDocs(packageQuery)
    for (let i = 0; i < packageDocs.docs.length; i++) {
      const doc = packageDocs.docs[i];
      map[doc.id] = doc.data()["package"]
    }
    return map
  }


  async getJourneyMap() {
    let map = {}
    const journeyQuery = query(this.journeyRefs)
    const journeyDocs = await getDocs(journeyQuery)
    for (let i = 0; i < journeyDocs.docs.length; i++) {
      const doc = journeyDocs.docs[i];
      map[doc.id] = doc.data()["journey"]
    }
    return map
  }

  async getJourneyToProductMap() {
    var map = {}
    const journeytoproductQuery = query(this.journeytoproductRefs)
    const journeytoproductDocs = await getDocs(journeytoproductQuery)
    for (let i = 0; i < journeytoproductDocs.docs.length; i++) {
      const doc = journeytoproductDocs.docs[i];
      map[doc.data()['journey'].id] = doc.data()["product"]
    }
    return map
  }


  async getProcedureMap() {
    let map = {}
    const proceduresQuery = query(this.proceduresRefs)
    const proceduresDocs = await getDocs(proceduresQuery)
    for (let i = 0; i < proceduresDocs.docs.length; i++) {
      const doc = proceduresDocs.docs[i];
      map[doc.id] = doc.data()["name"]
    }
    return map
  }


  async gettagmap() {
    var tag = {}

    const tagsystemQuery = query(this.tagsystemRefs)
    const tagsystemDocs = await getDocs(tagsystemQuery)
    for (let i = 0; i < tagsystemDocs.docs.length; i++) {
      const element = tagsystemDocs.docs[i];
      tag[element.id] = element.data()['tagname']
    }
    return tag
  }

  async updateDeliveryStatus(apptPath: string, status: string, { eventRequestRef = null }: { eventRequestRef?} = {}) {
    // var batch = firebase.default.firestore().batch()
    const batch = writeBatch(this.firestore)
    try {
      const apptDocRef = doc(this.firestore, apptPath)
      const deliverableQuery = query(this.deliverablesRefs, where("fileref", "array-contains", apptDocRef));
      const deliverableSnapshot = await getDocs(deliverableQuery);

      for (let i = 0; i < deliverableSnapshot.docs.length; i++) {
        const deliverableDoc = deliverableSnapshot.docs[i];
        const deliverableDocRef = doc(this.deliverablesRefs, deliverableDoc.id)
        batch.update(deliverableDocRef, {
          status: status
        })
      }

      if (eventRequestRef && status === "completed") {
        // const eventRequestQuery = query(eventRequestRef);
        const eventRequestSnapshot = await getDocs(eventRequestRef)
        for (let j = 0; j < eventRequestSnapshot.docs.length; j++) {
          const requestDoc = eventRequestSnapshot.docs[j];
          // const requestDocRef = doc(eventRequestRef,requestDoc.id)
          const requestDocRef = requestDoc.ref
          batch.update(requestDocRef, {
            status: "attended"
          })
        }
      }
      await batch.commit();
      console.log("Delivery status updated successfully");

    } catch (error) {
      console.log("Deliverable Error", error);
      throw error;
    }

  }

  async updateDeliverySequence(profileid: string, productList: Array<any>) {
    console.log(productList);
    const sequenceDocRef = doc(this.firestore, 'participantdeliverysequence', profileid);

    const sequenceDoc = await getDoc(sequenceDocRef);

    const mapProductDelivery: any = {};

    if (sequenceDoc.exists()) {
      const sequenceproduct = sequenceDoc.data()?.["products"] ?? [];
      for (let i = 0; i < sequenceproduct.length; i++) {
        const item = sequenceproduct[i];
        mapProductDelivery[item["participantproductid"]] = item["delivery"] ?? [];
      }
    }

    const newProductSequence: any[] = [];
    for (let i = 0; i < productList.length; i++) {
      const participantProduct = productList[i];
      const productsRef = collection(this.firestore, 'products');
      const productDocRef = doc(productsRef, participantProduct["productref"]);

      newProductSequence.push({
        participantproductid: participantProduct["docid"] ?? participantProduct["participantproductid"],
        productref: productDocRef,
        delivery: mapProductDelivery[participantProduct["docid"] ?? participantProduct["participantproductid"]] ?? []
      });
    }

    console.log("New Sequence", newProductSequence);

    await setDoc(sequenceDocRef, {
      profileid: profileid,
      products: newProductSequence
    });
  }

  async profileCurrentData({ profileid, journeyname, journeystatus, product, productstatus, journeyid, productid, productcompleteddate = null }) {
    var lastappointment = null
    var lastappointmentdate = null
    var currentappointment = null
    var currentappointmentdate = null
    var currentproductcompleted = productcompleteddate
    console.log(currentproductcompleted, productcompleteddate)
    const profileRef = doc(this.profile_dataRef, profileid)
    const apptDocs = query(this.appointmentsRefs, where("bookedby", "==", profileRef), where("journeyid", "==", journeyid), where("productid", "==", productid), orderBy("starttime", "desc"))
    const appt = await getDocs(apptDocs)
    var apptData = appt.docs.map(e => e.data())
    var upcoming = apptData.filter(e => !e["attended"] && !e["cancelled"])
    if (upcoming.length > 0) {
      const appointmentDoc = await getDoc(upcoming[0]["appointment"])
      currentappointment = appointmentDoc.data()?.['appointmenttype'] || null
      currentappointmentdate = upcoming[0]["starttime"] || null
    }
    var past = apptData.filter(e => e["attended"])
    if (past.length > 0) {
      const appointmentDoc = await getDoc(past[0]["appointment"])
      lastappointment = appointmentDoc.data()?.['appointmenttype'] || null
      lastappointmentdate = past[0]["starttime"] || null
    }
    const profileDocRef = doc(this.profile_dataRef, profileid);
    await updateDoc(profileDocRef, {
      currentjourney: journeyname,
      currentjourneystatus: journeystatus,
      currentproduct: product,
      currentproductstatus: productstatus,
      currentproductcompleted: currentproductcompleted,
      lastappointment: lastappointment,
      lastappointmentdate: lastappointmentdate,
      currentappointment: currentappointment,
      currentappointmentdate: currentappointmentdate,
      lastmodifieddate: new Date()
    })
  }

  // journey Coach Status
  async updateJourneyCoach({ profileid, participantjourneyid }) {
    let lastjourneycoachdate = null;
    if (participantjourneyid != null) {
      try {
        const profileDocRef = doc(this.profile_dataRef, profileid);
        const appointmentsQuery = query(
          this.appointmentsRefs,
          where("bookedby", "==", profileDocRef),
          where("participantjourneyid", "==", participantjourneyid),
          orderBy("starttime", "desc")
        );
        const appointmentSnapshot = await getDocs(appointmentsQuery);
        const apptData = appointmentSnapshot.docs.map(doc => doc.data());
        const upcoming = apptData.filter(appointment => !appointment["cancelled"]);
        lastjourneycoachdate = upcoming.length === 0 ? null : upcoming[0]["starttime"];
        const profileDocReference = doc(this.profile_dataRef, profileid);
        await updateDoc(profileDocReference, {
          lastjourneycoachdate: lastjourneycoachdate,
          lastmodifieddate: new Date()
        });
        const participantJourneyDocRef = doc(this.participantJourneySequenceRefs, participantjourneyid);
        await updateDoc(participantJourneyDocRef, {
          lastjourneycoachdate: lastjourneycoachdate
        });

        console.log("Journey coach status updated successfully");

      } catch (error) {
        console.log("Journey Coach Update Error", error);
        throw error;
      }
    }
  }

  cancelAppointment(apptData) {
    var id: string = apptData.bookingid
    var slotData: Array<any> = apptData.slotdata
    var appointmentid: string = apptData.appointment.id
    var startTime = apptData.starttime?.toDate()
    var endTime = apptData.endtime?.toDate()
    var profileid = apptData.bookedby.id
    var participantjourneyid = apptData.participantjourneyid ?? null
    var journeycoach = apptData.journeycoach ?? false
    var onboarding = apptData.onboarding ?? false

    var selectedSlot = {
      start: new Date(startTime),
      end: new Date(endTime)
    }

    if (confirm("Sure, Do you want to cancel this appointment?")) {
      if (journeycoach == true && onboarding == true) {
        const Ref = doc(this.participantjourneyproductRefs, apptData['participantjourneyproductid'])
        updateDoc(Ref, {
          onboardingscheduled: null,
          onreschedule: true,
        })
      }

      const appointmentRef = doc(this.appointmentsRefs, id)

      updateDoc(appointmentRef, {
        cancelled: true,
        cancelledon: new Date()
      }).catch(err => {
        alert(err)
      })

      for (let i = 0; i < slotData.length; i++) {
        const element = slotData[i];
        const availabilityDoc = doc(this.availabilityRefs, element.id)
        getDoc(availabilityDoc).then(async availability => {
          if (availability.exists()) {
            const chosenAppointment = availability.data();
            console.log(chosenAppointment, 'chosenAppointment');
            for (let j = 0; j < chosenAppointment["appointments"].length; j++) {
              const chosenelement = chosenAppointment["appointments"][j];
              var computedSlots = chosenAppointment[chosenelement.id]
              if (computedSlots != null || computedSlots != undefined) {
                for (let k = 0; k < computedSlots.length; k++) {
                  const slotelement = computedSlots[k];
                  var slotStart: any = new Date(slotelement.slotstart.toDate())
                  var slotEnd: any = new Date(slotelement.slotend.toDate())

                  if ((slotStart >= selectedSlot.start && slotStart < selectedSlot.end) || (slotEnd > selectedSlot.start && slotEnd < selectedSlot.end) || (selectedSlot.start >= slotStart && selectedSlot.start < slotEnd)) {

                    if (chosenelement.id == appointmentid) {
                      if (element.index == k) {
                        if (this.datepipe.transform(slotStart, "short") == this.datepipe.transform(selectedSlot.start, "short")) {
                          if (this.datepipe.transform(slotEnd, "short") == this.datepipe.transform(selectedSlot.end, "short")) {
                            slotelement.booked = false
                          }
                        }
                      }
                    }

                    if (!slotelement.booked) {
                      slotelement.available = true
                    }

                  }
                }
              }
            }

            updateDoc(availability.ref, chosenAppointment).catch(err => {
              console.log(element.id)
            })

          } else {
            console.log("Not Available");
          }
        }).catch(err => {
          console.log(err)
        })
      }

      if (journeycoach) {
        this.updateJourneyCoach({
          profileid: profileid,
          participantjourneyid: participantjourneyid
        })
      } else {
        const appointmentRef = doc(this.appointmentsRefs, id);
        this.updateDeliveryStatus(appointmentRef.path, "ready");
      }
    } else {
      if (apptData.isRescheduling != undefined) { apptData.isRescheduling = false }
    }
  }

  // // Revoke Specialist Availability
  generateSpecialistSlot(profileid) {
    try {
      let url: string
      if (environment.firebase.projectId == "test-environment-841c3") {
        console.log("test")
        url = "https://us-central1-test-environment-841c3.cloudfunctions.net/profileAvailability?profileid=" + profileid
      }
      if (environment.firebase.projectId == "starlabs-test") {
        console.log("test 19")
        url = "https://us-central1-starlabs-test.cloudfunctions.net/profileAvailability?profileid=" + profileid
      }
      else if (environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development") {
        console.log("Production")
        url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/profileAvailability?profileid=" + profileid
      }
      this.http.get(url).toPromise().then(res => {
        console.log(res)
      }).catch(err => {
        console.log(err)
      })
    } catch (err) {
      console.log(err);
    }
  }

  async initializeWatson() {
    var credential = {}
    if(environment["watson"]){
      credential = environment["watson"]
      if (getApps().filter(e => e.name == "watson").length == 0) {
        initializeApp(credential, 'watson');
      }
    }
  }

  async moveQueueStage(formref, videoask) {
    let currentStage = this.profileJourneyProduct["queuemode"]["currentstage"];
    let currentIndex = this.profileJourneyProduct["queuestages"].indexOf(currentStage);
    if (currentIndex != -1) {
      if ((currentIndex + 1) < this.profileJourneyProduct["queuestages"].length) {
        let nextStage = this.profileJourneyProduct["queuestages"][currentIndex + 1];
        let data = {
          "previousstage": currentStage,
          "currentstage": nextStage,
          "logdate": new Date(),
          "stagestatus": "Approved",
          "quicknotes": null,
          "cwmentoring": null,
          "cwshadowing": null,
          "cwperson": null,
          "diagnosticmentoring": null,
          "diagnosticshadowing": null,
          "diagnosticperson": null,
          "people_involved": [],
        };
        if (formref != null) {
          data["formref"] = formref;
        }
        else if (videoask != null) {
          data["videoaskref"] = videoask;
        }
        let log = {
          ...this.profileJourneyProduct["tokendata"],
          ...data
        };
        const queuetoken = doc(this.queuetokenRefs, log["docid"])
        await updateDoc(queuetoken, log).catch((err) => {
          console.log(err);

        })
        let logdocid = doc(this.queuestagelogsRefs)
        log["logdocid"] = logdocid.id;
        await setDoc(logdocid, log).catch((error) => {
          console.log(error);
        })
      }
    }
  }

  async saveNotificationRecord({
    title, // String
    message, // String
    subtitle = null, // String || Null
    date = new Date(), // Date
    notificationimage = null, // Image URL || Null
    notificationtype = "ahupdate",
    landingpage = null,
    sticky = false, // Boolean (Notification will be displayed in App Homescreen)
    logged = true, // Boolean (Notification will be displayed in user Log)
    metadata = {}, // Map (Related Metadata)
    profileid,
  }) {
    var docid = this.generateId(this.firestore, "notificationrecord")
    console.log(docid)
    var notificationRecordData = {
      title: title,
      message: message,
      subtitle: subtitle,
      date: date,
      notificationimage: notificationimage,
      notificationtype: notificationtype,
      landingpage: landingpage,
      sticky: sticky,
      logged: logged,
      metadata: metadata,
      profileid: profileid,
      success: false,
    }
    console.log("Record ID", docid)
    await setDoc(doc(this.firestore, "notificationrecord", docid), notificationRecordData).then(() => {
      console.log("Notification Record Created Successfully.", notificationRecordData)
    }).catch(err => {
      console.log("Unable to store Notification Record", err)
    })
  }

  async setupNotification() {
    try {
      // Get FCM Token
      const token = await getToken(this.messagings, {
        vapidKey: environment.firebase.vapidKey
      });

      if (token) {
        this.tokenFCM = token;
        // Update logged in profile
        if (this.uid) {
          this.loggedinProfile['fcmtoken'] = token
        }
        console.log("Push Messaging token:", token);

        // Update FCM token in database
        await this.updateFCMToken(
          this.userPreferences['email'],
          token,
          this.userPreferences['uid'],
          this.userPreferences['pid'],
          true
        );
      } else {
        console.log('No registration token available.');
      }
    } catch (err) {
      console.error("unable to fetch FCM", err);
      // this.appService?.logException({ exception: `${err}`, stack: "" });
    }

    // Request permission for notifications
    await this.requestPermission();

    // Handle app launch from notification
    await this.handleInitialMessage();
  }

  private async requestPermission(): Promise<boolean> {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  private setupForegroundMessageListener() {
    onMessage(this.messagings, (message) => {
      console.log('A new onMessage event was published!', message.data);
      const notification = message.notification;
      console.log(notification?.title);
      console.log(notification?.body);

      if (notification) {
        this.showLocalNotification(
          notification.title || "",
          notification.body || "",
          JSON.stringify(message.data)
        );
      }
    });
  }

  // private handleBackgroundNotificationClick() {
  //   // This is handled in the service worker (firebase-messaging-sw.js)
  //   // We'll listen for messages from the service worker
  //   if ('serviceWorker' in navigator) {
  //     navigator.serviceWorker.addEventListener('message', (event) => {
  //       if (event.data?.type === 'notification-click') {
  //         console.log('Background notification clicked:', event.data.payload);
  //         this.onNotificationTap(event.data.payload);
  //       }
  //     });
  //   }
  // }

  private async handleInitialMessage() {
    // For web, we need to check if the page was opened from a notification
    // This can be done by checking URL parameters or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const notificationData = urlParams.get('notification_data');

    if (notificationData) {
      try {
        const data = JSON.parse(decodeURIComponent(notificationData));
        console.log("Initial Message", data);
        this.onNotificationTap(data);
      } catch (error) {
        console.error('Error parsing notification data from URL:', error);
      }
    }
  }

  private showLocalNotification(title: string, body: string, payload: string) {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '/assets/icon.png', // Your app icon
        badge: '/assets/badge.png',
        data: payload
      });

      notification.onclick = () => {
        console.log("App Foreground Click Local Notification ----", payload);
        const parsedPayload = payload ? JSON.parse(payload) : null;
        console.log("Payload", parsedPayload);
        this.onNotificationTap(parsedPayload);
        notification.close();
      };
    }
  }

  private onNotificationTap(payload: any) {
    console.log('Notification tapped with payload:', payload);

    // Handle notification tap based on payload type
    if (payload?.type === "supportticket") {
      // Navigate to ticket chat
      // this.router.navigate(['/ticket-chat'], {
      //   queryParams: {
      //     chatIndex: payload.chatindex,
      //     issueid: payload.issueid
      //   }
      // });
    } else {
      // Navigate to notification log
      // this.router.navigate(['/notification-log']);
    }
  }

  async updateFCMToken(email: string, token: string, uid: string, pid: string, value: boolean) {
    console.log(token, email, uid);

    try {
      const deviceData = await this.getDeviceInfo();
      await this.deactivateExistingTokensForDevice(deviceData, uid);

      // Query existing token
      const q = query(
        collection(this.firestore, "FCM_token"),
        where('FCM_id', '==', token)
      );

      const querySnapshot = await getDocs(q);
      console.log("FCM Token", querySnapshot.docs.length);

      const version = await this.getAppVersion();

      if (querySnapshot.docs.length === 0) {
        console.log("Token Creating");

        await addDoc(collection(this.firestore, "FCM_token"), {
          FCM_id: token,
          email: email,
          uid: uid,
          user_ref: doc(this.firestore, "user_data", uid),
          profile_ref: doc(this.firestore, "profile_data", pid),
          active: value,
          device_os: this.getOperatingSystem(),
          created: serverTimestamp(),
          last_modified: serverTimestamp(),
          current_version: version,
          deviceinfo: deviceData,
          device_fingerprint: this.generateDeviceFingerprint(deviceData)
        });

        console.log(`${uid}, Created Token DOCID`);
      } else {
        console.log("Updating existing token");

        // Check last modification date for login log
        const lastRecord = querySnapshot.docs[0].data();
        const lastModified = lastRecord["last_modified"]?.toDate();
        const daysDifference = lastModified ?
          Math.floor((Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24)) :
          999;

        console.log(`Last Update ${lastModified?.toString()} - ${daysDifference}`);

        // Update all matching tokens
        for (const docSnapshot of querySnapshot.docs) {
          console.log("Token Updating");

          await updateDoc(docSnapshot.ref, {
            active: value,
            device_os: this.getOperatingSystem(),
            last_modified: serverTimestamp(),
            current_version: version,
            deviceinfo: deviceData,
            device_fingerprint: this.generateDeviceFingerprint(deviceData)
          });

          console.log(`${docSnapshot.ref.id}, Updated Token DOCID`);
        }

        // Add login log if more than 7 days
        if (daysDifference > 7) {
          await addDoc(collection(this.firestore, "loginlog"), {
            email: email,
            uid: uid,
            profileid: pid,
            date: serverTimestamp(),
            current_version: version,
            deviceinfo: deviceData
          });
        }
      }
    } catch (error) {
      console.error("Error updating FCM token:", error);
    }
  }

  private async getDeviceInfo(): Promise<any> {
    const deviceData: any = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Add more device info if available
    // if ('getBattery' in navigator) {
    //   try {
    //     const battery = await (navigator as any).getBattery();
    //     deviceData.batteryLevel = battery.level;
    //     deviceData.charging = battery.charging;
    //   } catch (error) {
    //     console.log('Battery API not available');
    //   }
    // }

    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      deviceData.connectionType = connection.effectiveType;
      deviceData.downlink = connection.downlink;
    }

    return deviceData;
  }

  private getOperatingSystem(): string {
    const userAgent = navigator.userAgent;

    if (userAgent.indexOf("Windows") !== -1) return "Windows";
    if (userAgent.indexOf("Mac") !== -1) return "macOS";
    if (userAgent.indexOf("Linux") !== -1) return "Linux";
    if (userAgent.indexOf("Android") !== -1) return "Android";
    if (userAgent.indexOf("iOS") !== -1) return "iOS";

    return "Unknown";
  }

  private async getAppVersion(): Promise<string> {
    return "1.0.0";
  }

  private async deactivateExistingTokensForDevice(deviceData: any, currentUid: string) {
    try {
      const deviceFingerprint = this.generateDeviceFingerprint(deviceData);
      console.log("Deactivating existing tokens for device:", deviceFingerprint);

      // Query tokens with same device fingerprint but different user
      const q = query(
        collection(this.firestore, "FCM_token"),
        where('device_fingerprint', '==', deviceFingerprint),
        where('active', '==', true)
      );

      const querySnapshot = await getDocs(q);

      for (const docSnapshot of querySnapshot.docs) {
        const tokenData = docSnapshot.data();

        // Deactivate if it's a different user on the same device
        if (tokenData['uid'] !== currentUid) {
          console.log(`Deactivating token for previous user: ${tokenData['uid']}`);

          await updateDoc(docSnapshot.ref, {
            active: false,
            deactivated_reason: "New user login on same device",
            deactivated_at: serverTimestamp(),
            last_modified: serverTimestamp()
          });

          console.log(`Deactivated token: ${docSnapshot.ref.id}`);
        }
      }
    } catch (error) {
      console.error("Error deactivating existing tokens:", error);
    }
  }

  // Generate a unique fingerprint for the device/browser
  private generateDeviceFingerprint(deviceData: any): string {
    // Create a unique identifier based on device characteristics
    const fingerprint = [
      deviceData.userAgent || '',
      deviceData.platform || '',
      deviceData.screenResolution || '',
      deviceData.timezone || '',
      deviceData.language || ''
    ].join('|');

    return btoa(fingerprint).substring(0, 50); // Base64 encode and truncate
  }

  async deactivateCurrentUserToken(uid: string) {
    try {
      if (!this.tokenFCM) {
        console.log("No active token to deactivate");
        return;
      }

      const q = query(
        collection(this.firestore, "FCM_token"),
        where('FCM_id', '==', this.tokenFCM),
        where('uid', '==', uid),
        where('active', '==', true)
      );

      const querySnapshot = await getDocs(q);

      for (const docSnapshot of querySnapshot.docs) {
        await updateDoc(docSnapshot.ref, {
          active: false,
          deactivated_reason: "User logout",
          deactivated_at: serverTimestamp(),
          last_modified: serverTimestamp()
        });

        console.log(`Deactivated token on logout: ${docSnapshot.ref.id}`);
      }

      // Clear local token
      this.tokenFCM = null;
      if (this.loggedinProfile) {
        delete this.loggedinProfile["fcmtoken"];
      }

    } catch (error) {
      console.error("Error deactivating token on logout:", error);
    }
  }

  // Get notifications 
  async getNotifications(limitCount: number = 50): Promise<NotificationData[]> {
    try {
      const uid = this.userPreferences?.uid;
      if (!uid) {
        console.warn('No user UID available for fetching notifications');
        return [];
      }

      const q = query(
        collection(this.firestore, 'notifications', uid, 'logs'),
        orderBy('date', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const notifications: NotificationData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push({
          id: doc.id,
          title: data['title'] || '',
          message: data['message'] || '',
          subtitle: data['subtitle'] || '',
          type: data['type'] || 'ahupdate',
          notificationimage: data['notificationimage'] || '',
          date: data['date']?.toDate() || new Date(),
          read: data['read'] || false,
          metadata: data['metadata'] || {},
          landingpage: data['landingpage'] || '',
          sticky: data['sticky'] || false,
          recordid: data['recordid'] || ''
        });
      });

      return notifications;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  onNotificationReceived(): Observable<NotificationData> {
    return this.notificationSubject.asObservable();
  }

  onUnreadCountChanged(): Observable<number> {
    return this.unreadCountSubject.asObservable();
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const uid = this.userPreferences?.uid;
      if (!uid) return;

      const notificationRef = doc(this.firestore, 'notifications', uid, 'logs', notificationId);
      await updateDoc(notificationRef, {
        read: true
      });

      // Also update the main notification read status
      const mainNotificationRef = doc(this.firestore, 'notifications', uid);
      const unreadQuery = query(
        collection(this.firestore, 'notifications', uid, 'logs'),
        where('read', '==', false)
      );

      const unreadSnapshot = await getDocs(unreadQuery);
      const hasUnread = !unreadSnapshot.empty;

      await updateDoc(mainNotificationRef, {
        read: !hasUnread
      });

    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(): Promise<void> {
    try {
      const uid = this.userPreferences?.uid;
      if (!uid) return;

      // Get all unread notifications
      const unreadQuery = query(
        collection(this.firestore, 'notifications', uid, 'logs'),
        where('read', '==', false)
      );

      const unreadSnapshot = await getDocs(unreadQuery);
      const batch = writeBatch(this.firestore);

      // Update all unread notifications
      unreadSnapshot.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });

      // Update main notification status
      const mainNotificationRef = doc(this.firestore, 'notifications', uid);
      batch.update(mainNotificationRef, { read: true });

      await batch.commit();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  // Setup real-time listener for new notifications
  setupNotificationListener() {
    const uid = this.userPreferences?.uid;
    if (!uid) return;

    const q = query(
      collection(this.firestore, 'notifications', uid, 'logs'),
      orderBy('date', 'desc'),
      limit(1)
    );

    onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const notificationData: NotificationData = {
            id: change.doc.id,
            title: data['title'] || '',
            message: data['message'] || '',
            subtitle: data['subtitle'] || '',
            type: data['type'] || 'ahupdate',
            notificationimage: data['notificationimage'] || '',
            date: data['date']?.toDate() || new Date(),
            read: data['read'] || false,
            metadata: data['metadata'] || {},
            landingpage: data['landingpage'] || '',
            sticky: data['sticky'] || false,
            recordid: data['recordid'] || ''
          };

          // Only emit if it's a new notification (less than 10 seconds old)
          const now = new Date();
          const notificationAge = now.getTime() - notificationData.date.getTime();
          if (notificationAge < 10000) { // 10 seconds
            this.notificationSubject.next(notificationData);
          }
        }
      });
    });
  }

  // Setup real-time unread count listener
  setupUnreadCountListener(callback?: (count: number) => void) {
    const uid = this.userPreferences?.uid;
    if (!uid) return;


    // Also listen to unread notifications count
    const unreadQuery = doc(this.firestore, 'notifications', uid);

    this.unreadCountListener = onSnapshot(unreadQuery, (snapshot) => {
      if(snapshot.exists() && snapshot.data()['read'] === false){
        const unreadCount = 1;
        console.log('Unread notifications count updated:', unreadCount);
        // Update the BehaviorSubject
        this.unreadCountSubject.next(unreadCount);

        // Call callback if provided (for backward compatibility)
        if (callback) {
          callback(unreadCount);
        }
      }

    }, (error) => {
      console.error('Error listening to unread count:', error);
    });
  }

}