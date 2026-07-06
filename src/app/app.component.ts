import { Component, OnDestroy, OnInit, inject, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Auth, signOut, user } from '@angular/fire/auth';
import { Firestore, collection, query, where, onSnapshot, doc, updateDoc } from '@angular/fire/firestore';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { CommonModule, Location, NgFor, NgIf } from '@angular/common';
import { AuthguardService } from './authguard.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule, MatDrawer } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter, Subscription } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { ConfirmComponent } from './DialogBox/confirm/confirm.component';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { UpdatesnackbarComponent } from './updatesnackbar/updatesnackbar.component';
import { SafeImgDirective } from './shared/safe-img.directive';
import { Title } from '@angular/platform-browser';
import { ProfilePictureComponent } from './ProfilePicture/profile-picture/profile-picture.component';

interface NavItem {
  icon: string;
  label: string;
  route?: string;
  children?: NavItem[];
  expanded?: boolean;
  showInSidenav?: boolean;
  order?: number;
}

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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    RouterOutlet,
    RouterModule,
    MatIconModule,
    MatToolbarModule,
    MatButtonModule,
    NgIf,
    NgFor,
    MatSidenavModule,
    MatListModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
    MatDividerModule,
    MatCardModule,
    CommonModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    SafeImgDirective,
    ProfilePictureComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent implements OnInit, OnDestroy {

  profileData = {};
  profileEligibleRoles = []
  dashboardDocuments: any[] = [];
  filteredDashboard = [];
  expandedDashboard = {}

  notifications: NotificationData[] = [];
  unreadCount = 0;
  loading = false;
  private notificationSubscription?: Subscription;
  private unreadCountSubscription?: Subscription;
  // selectedItem: any = null; 
  // selectedItemIsFav: boolean = false;
  // favRouteSet = new Set<string>();
  // newTab: boolean = true;
  private unsubscribeFunctions: (() => void)[] = [];
  // filteredNavItems: NavItem[] = []; 
  @ViewChild('leftDrawer') leftDrawer!: MatDrawer;
  @ViewChild('rightDrawer') rightDrawer!: MatDrawer;
  // selectedNavIndex: number = -1;
  // isHandset = false;
  leftDrawerOpened = false;
  rightDrawerOpened = false;
  // currentPageTitle: string = 'Dashboard'; 
  // leftNavItems: NavItem[] = [];
  // private subscription = new Subject<void>();
  // rightNavItems = [];
  // rightNavItemsFav = []

  searchQuery: string = '';
  currentUrl: string = '';

  private location = inject(Location);
  public router = inject(Router);
  private firestore = inject(Firestore);
  public guard = inject(AuthguardService);
  private firebaseAuth = inject(Auth);
  private breakpointObserver = inject(BreakpointObserver);

  private channel = new BroadcastChannel('app-update-channel');
  private snackBarRef: MatSnackBarRef<UpdatesnackbarComponent> | null = null;


  constructor(
    public dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private swUpdate: SwUpdate,
    private snackBar: MatSnackBar,
    private titleService: Title,
  ) {

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentUrl = event.url;
      this.cdr.detectChanges();
    });
    // if (this.swUpdate.isEnabled) {
    //   // Check every 5 minutes
    //   interval(5 * 60 * 1000).subscribe(() => {
    //     this.swUpdate.checkForUpdate();
    //   });
    //   this.swUpdate.versionUpdates.subscribe(event => {
    //     console.log("Version Event - ", event)
    //     if (event.type === 'VERSION_READY') {
    //       console.log("New version available.")
    //     }
    //   });
    // }

    if (this.swUpdate.isEnabled) {
      let updateInterval: any;

      const startUpdateChecking = () => {
        updateInterval = setInterval(() => {
          this.swUpdate.checkForUpdate();
        }, 5 * 60 * 1000);
      };

      const stopUpdateChecking = () => {
        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }
      };

      startUpdateChecking();

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          stopUpdateChecking();
        } else {
          // Check immediately when becoming visible
          this.swUpdate.checkForUpdate();
          startUpdateChecking();
        }
      });

      // Also check when window gains focus
      window.addEventListener('focus', () => {
        if (!updateInterval) {
          this.swUpdate.checkForUpdate();
          startUpdateChecking();
        }
      });

      window.addEventListener('blur', () => {
        stopUpdateChecking();
      });

      this.swUpdate.versionUpdates.subscribe(event => {
        console.log("Version Event - ", event);
        if (event.type === 'VERSION_READY') {
          console.log("New version available.");
        }
      });
    }

    this.setupUpdateListener();
    this.setupBroadcastListener();
    // this.breakpointObserver.observe([Breakpoints.Handset, Breakpoints.Tablet])
    // .subscribe(result => {
    //   this.isHandset = result.matches;
    //   if (this.isHandset) {
    //     this.leftDrawerOpened = false;
    //     this.rightDrawerOpened = false;
    //   }
    // });
    user(this.firebaseAuth).subscribe(async (user) => {
      if (user != null) {
        console.log("UID", user.uid);
        this.guard.setUid(user.uid);

        // Try to load from cache first for instant display
        const cachedProfile = await this.guard.getCache('cache_loggedInProfile');
        const cachedRoles = await this.guard.getCache('cache_loggedInRoles');

        if (cachedProfile && cachedRoles) {
          this.profileData = cachedProfile;
          this.guard.loggedinProfile = cachedProfile;
          this.guard.loggedinRoles = cachedRoles;

          // Set up roles list
          this.profileEligibleRoles = Object.keys(cachedRoles).filter(key => cachedRoles[key] === true);

          this.filterNavItems();
          if (this.dashboardDocuments.length == 0) {
            this.fetchNavigationItems();
          }
        }

        const profileQuery = query(collection(this.firestore, 'profile_data'), where('user_ref', '==', doc(this.firestore, 'user_data', user.uid)));
        const unsubscribeProfile = onSnapshot(profileQuery, (snapshot) => {
          if (!snapshot.empty) {
            const profileDoc = snapshot.docs[0];
            this.profileData = profileDoc.data();
            this.guard.loggedinProfile = this.profileData;

            this.guard.setCache('cache_loggedInProfile', this.profileData);

            // if (Object.keys(this.guard.loggedinRoles).length == 0 || !cachedRoles) {
              const roleRef = this.profileData["role_ref"].path;
              const roleDocRef = doc(this.firestore, roleRef);

              const unsubscribeRole = onSnapshot(roleDocRef, (roleShot) => {
                if (roleShot.exists()) {
                  const roleData = roleShot.data();
                  this.guard.loggedinRoles = roleData;

                  console.log("User Roles", this.guard.loggedinRoles)

                  // Cache roles
                  this.guard.setCache('cache_loggedInRoles', roleData);

                  this.profileEligibleRoles = Object.keys(roleData).filter(key => roleData[key] === true);
                }

                this.filterNavItems();
                if (this.dashboardDocuments.length == 0) {
                  this.fetchNavigationItems();
                }
              });
              this.unsubscribeFunctions.push(unsubscribeRole);
            // }

            this.guard['userPreferences'] = {
              email: user.email,
              uid: user.uid,
              pid: this.profileData['profileid']
            };
            if (this.isBrowserSupported()) {
              this.initializeNotifications();
            } else {
              console.log('Browser does not support notifications or service workers');
            }
            this.initializeServiceListener();
            this.subscribeToUnreadCount();
          }
        });
        this.unsubscribeFunctions.push(unsubscribeProfile);
      } else {
        this.guard.loggedinProfile = {}
        this.guard.loggedinRoles = {}
      }
    });
  }

  private setupUpdateListener() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        console.log('Version Event:', event);

        if (event.type === 'VERSION_READY') {
          console.log('New version available');
          this.showUpdateNotification();
        }
      });
    }
  }

  private setupBroadcastListener() {
    this.channel.addEventListener('message', (event) => {
      if (event.data.type === 'RELOAD_ALL_TABS') {
        console.log('Received reload command from another tab');
        this.reloadApp();
      } else if (event.data.type === 'UPDATE_AVAILABLE') {
        // Show notification if another tab detected update
        this.showUpdateNotification();
      }
    });
  }

  private showUpdateNotification() {
    // Prevent multiple snackbars
    if (this.snackBarRef) {
      return;
    }

    this.snackBarRef = this.snackBar.openFromComponent(UpdatesnackbarComponent, {
      duration: 0,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['update-snackbar'],
      data: {
        onUpdate: () => this.handleUpdate(),
        // onDismiss: () => this.handleDismiss()
      }
    });
  }

  private handleUpdate() {
    console.log('User accepted update');

    // Notify all tabs to reload
    this.channel.postMessage({ type: 'RELOAD_ALL_TABS' });

    // Close snackbar
    if (this.snackBarRef) {
      this.snackBarRef.dismiss();
      this.snackBarRef = null;
    }

    // Reload current tab
    this.reloadApp();
  }

  // private handleDismiss() {
  //   console.log('User dismissed update notification');
  //   if (this.snackBarRef) {
  //     this.snackBarRef.dismiss();
  //     this.snackBarRef = null;
  //   }
  // }

  private reloadApp() {
    // Give service worker time to activate new version
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  // Public method to trigger update check
  public checkForUpdate() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().then(updateAvailable => {
        if (updateAvailable) {
          console.log('Update check found new version');
        }
      });
    }
  }

  // Cleanup
  public destroy() {
    this.channel.close();
    if (this.snackBarRef) {
      this.snackBarRef.dismiss();
    }
  }

  private isBrowserSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  private async initializeNotifications() {
    try {
      console.log(this.guard['userPreferences']);
      // Setup notifications
      await this.guard.setupNotification().then(() => {
        console.log('Notifications initialized successfully')
      });
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  }

  // fetchFav() {
  //   if (this.profileid !== null) {
  //   const dashboardDocRef = doc(this.firestore, 'dashboardsettings', this.profileid);
  //   docSnapshots(dashboardDocRef).pipe(takeUntil(this.subscription))
  //     .subscribe(favnavdata => {
  //       this.rightNavItemsFav = [];
  //       this.favRouteSet.clear(); 
  //       const favDoc = { id: favnavdata.id, ...favnavdata.data() };
  //       if (favDoc['favouriteroute']) {
  //         favDoc['favouriteroute'].forEach(child => {
  //           const actionKey = child.action || child.label?.toLowerCase().replace(/\s+/g, '_');
  //           this.favRouteSet.add(actionKey);
  //           this.rightNavItemsFav.push({
  //             icon: child.icon || 'folder',
  //             label: child.label,
  //             action: actionKey,
  //           });
  //         });
  //       }
  //     });
  //   }
  // }

  async ngOnInit() {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.setTitleFromNavLabel();
    });
  }

  ngOnDestroy(): void {
    // this.subscription.next();
    // this.subscription.complete();
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.notificationSubscription?.unsubscribe();
    if (this.unreadCountSubscription) {
      this.unreadCountSubscription.unsubscribe();
    }
  }

  private setTitleFromNavLabel(): void {
    const currentRoute = this.router.url;

    for (const parent of this.dashboardDocuments) {
      if (parent.route && currentRoute.includes(parent.route)) {
        this.titleService.setTitle(parent.label);
        return;
      }

      if (parent.children && parent.children.length > 0) {
        for (const child of parent.children) {
          if (child.route && currentRoute.includes(child.route)) {
            this.titleService.setTitle(child.label);
            return;
          }
        }
      }
    }

    // fallback
    this.titleService.setTitle('Starlabs');
  }

  /*
  updateCurrentPageTitle(): void {
    if (this.leftNavItems.length === 0) {
      this.currentPageTitle = 'Loading...';
      return;
    }
    
    const currentRoute = this.router.url;
    if (currentRoute.includes('/userprofile/' + this.profileid)) {
      this.currentPageTitle = 'My Profile';
      return;
    }
    
    if (currentRoute.includes('/routeconfiguration')) {
      this.currentPageTitle = 'Developers Settings';
      return;
    }
    const activeItem = this.findActiveNavItem(this.leftNavItems, currentRoute);
    
    if (activeItem) {
      this.currentPageTitle = activeItem.label;
    } else {
      this.currentPageTitle = 'Dashboard'; 
    }
  }

  private findActiveNavItem(items: NavItem[], currentRoute: string): NavItem | null {
    for (const item of items) {
      if (item.route && this.isRouteActive(item.route)) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const childMatch = this.findActiveNavItem(item.children, currentRoute);
        if (childMatch) {
          return childMatch;
        }
      }
    }
    return null;
  }
  */

  /*
  shouldShowNavigation(): boolean {
    return this.router.url != '/' && 
           !this.router.url.includes('login') && 
           this.userName != null && 
           !this.router.url.includes('queue%20venue') && 
           !this.router.url.includes('bigwallparticipantdisplay') && 
           !this.router.url.includes('evolutionwishlist') && 
           !this.router.url.includes('customer%20support%20chat') && 
           !this.router.url.includes('eiflixdashboard') && 
           !this.router.url.includes('eiflixepisodes') && 
           !this.router.url.includes('userseries') && 
           !this.router.url.includes('mylist') && 
           !this.router.url.includes('search-list') && 
           !this.router.url.includes('participant-profile');
  }
  */

  filterNavItems() {
    console.log("Profile Roles", this.profileEligibleRoles)
    var favourites = []
    var navItems = []
    console.log(this.searchQuery)
    console.log(this.dashboardDocuments)
    for (let i = 0; i < this.dashboardDocuments.length; i++) {
      var dashboardData = this.dashboardDocuments[i]
      var children = []
      for (let j = 0; j < (dashboardData["children"] ?? []).length; j++) {
        const route = dashboardData["children"][j];
        var filtercheck = route["label"].toLowerCase().includes(this.searchQuery.trim().toLowerCase())
        if (route["showInSidenav"]) {

          if (
            (route["roles"].filter(role => this.profileEligibleRoles.includes(role)).length === 0) &&
            (!route['profileid']?.includes(this.profileData["profileid"]))) {
            continue
          }

          if (filtercheck) {
            children.push(route)
          }
          if ((route["favourites"] || []).includes(this.profileData["profileid"])) {
            favourites.push(route)
          }
        }
      }
      if (this.searchQuery.trim().length != 0) {
        if (children.length != 0) {
          this.expandedDashboard[dashboardData["id"]] = true
        }
        else {
          this.expandedDashboard[dashboardData["id"]] = false
        }
      }
      var newItem = {
        ...dashboardData,
        children
      }
      navItems.push(newItem)
    }
    this.filteredDashboard = navItems
    this.guard.favouriteDashboard = favourites
    console.log(this.filteredDashboard)
  }

  async fetchNavigationItems(): Promise<void> {
    // Try cache first
    const cached = await this.guard.getCache('cache_dashboardItems');
    if (cached) {
      console.log('✅ Dashboard from cache');
      this.dashboardDocuments = cached;
      this.filterNavItems();
    }

    // Still set up listener for real-time updates
    const navItemsCollection = query(
      collection(this.firestore, 'dashboard'),
      where('showInSidenav', '==', true)
    );

    const unsubscribeNavItems = onSnapshot(navItemsCollection, (snapshot) => {
      this.dashboardDocuments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      this.dashboardDocuments.sort((a, b) => (a["order"] ?? 0) - (b["order"] ?? 0));

      // Update cache
      this.guard.setCache('cache_dashboardItems', this.dashboardDocuments);

      this.filterNavItems();
    });

    this.unsubscribeFunctions.push(unsubscribeNavItems);
  }

  // fetchNavigationItems(): void {
  //   const navItemsCollection = query(collection(this.firestore, 'dashboard'), where('showInSidenav','==',true));    
  //   const unsubscribeNavItems = onSnapshot(navItemsCollection, (snapshot) => {

  //     this.dashboardDocuments = snapshot.docs.map(doc => ({
  //       id: doc.id,
  //       ...doc.data()
  //     }));
  //     this.dashboardDocuments.sort((a, b) => (a["order"] ?? 0) - (b["order"] ?? 0))
  //     this.filterNavItems()

  //     // let fetchedItems: NavItem[] = snapshot.docs.map(doc => {
  //     //   const data = doc.data() as NavItem;
  //     //   if (data.children && Array.isArray(data.children)) {
  //     //     data.children = data.children.filter(child => child.showInSidenav === true);
  //     //   }
  //     //   return data;
  //     // });
  //     // fetchedItems.sort((a, b) => {
  //     //   const orderA = (a as any).order !== undefined ? (a as any).order : Infinity; 
  //     //   const orderB = (b as any).order !== undefined ? (b as any).order : Infinity;
  //     //   return orderA - orderB;
  //     // });
  //     // console.log("fetchedItemsfetchedItems", fetchedItems);

  //     // this.leftNavItems = fetchedItems;
  //     // this.rightNavItems = [];

  //     // fetchedItems.forEach(parent => {
  //     //   if (parent.route) {
  //     //     this.rightNavItems.push({
  //     //       icon: parent.icon || 'folder',
  //     //       label: parent.label,
  //     //       action: parent.route,
  //     //     });
  //     //   }
  //     //   if (Array.isArray(parent.children) && parent.children.length > 0) {
  //     //     parent.children.forEach(child => {
  //     //       this.rightNavItems.push({
  //     //         icon: child.icon || 'folder',
  //     //         label: child.label,
  //     //         action: child.route || child.label.toLowerCase().replace(/\s+/g, '_'),
  //     //       });
  //     //     });
  //     //   }
  //     // });

  //     // console.log("Right Nav Items:", this.rightNavItems);

  //     // this.updateFilteredNavItems();
  //     // console.log('Fetched and Sorted Navigation Items:', this.leftNavItems);
  //     // this.updateCurrentPageTitle();

  //     // this.fetchFav();
  //   }, (error) => {
  //     console.error("Error fetching navigation items:", error);
  //   });
  //   this.unsubscribeFunctions.push(unsubscribeNavItems);
  // }

  toggleLeftDrawer(): void {
    if (this.leftDrawer) {
      this.leftDrawer.toggle();
      this.leftDrawerOpened = !this.leftDrawerOpened;
    }
  }

  toggleRightDrawer(): void {
    if (this.rightDrawer) {
      this.rightDrawer.toggle();
      this.rightDrawerOpened = !this.rightDrawerOpened
    }
  }

  closeLeftDrawer(): void {
    if (this.leftDrawer) {
      this.leftDrawer.close();
      this.leftDrawerOpened = false;
    }
  }

  closeRightDrawer(): void {
    if (this.rightDrawer) {
      this.rightDrawer.close();
      this.rightDrawerOpened = false
    }
  }

  onNavItemClick(item: NavItem): void {
    if (item.children && item.children.length > 0) {
      this.expandedDashboard[item["id"]] = !this.expandedDashboard[item["id"]];
    }
    // else if (item.route) {
    //   this.navigateTo(item.route);
    // }
  }

  pinItem(id, item) {
    console.log(id, item)
    var getCategory = this.dashboardDocuments.filter(e => e["id"] == id)
    console.log(getCategory)
    if (getCategory.length != 0) {
      var selectedcategory = getCategory[0]
      var routeIndex = selectedcategory["children"].findIndex(e => e["route"] == item["route"])
      console.log(routeIndex, selectedcategory["children"][routeIndex])
      if (routeIndex != -1) {
        selectedcategory["children"][routeIndex]["favourites"] = selectedcategory["children"][routeIndex]["favourites"] || []
        if (selectedcategory["children"][routeIndex]["favourites"].includes(this.profileData["profileid"])) {
          selectedcategory["children"][routeIndex]["favourites"] = selectedcategory["children"][routeIndex]["favourites"].filter(e => e != this.profileData["profileid"])
        }
        else {
          selectedcategory["children"][routeIndex]["favourites"].push(this.profileData["profileid"])
        }
      }
      updateDoc(doc(this.firestore, "dashboard", id), {
        children: selectedcategory["children"]
      }).catch(err => {
        console.log(err)
      })
    }
  }

  logout(): void {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        title: 'Confirm Logout',
        message: 'Are you sure you want to logout?',
        confirmText: 'Yes',
        cancelText: 'No'
      },
      disableClose: true
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        signOut(this.firebaseAuth).then(async () => {
          console.log("signed out");
          
          await this.guard.clearAllCaches();
          await this.guard.deactivateCurrentUserToken(this.guard['userPreferences']['uid']);
          this.router.navigate(['/login']);
        });
      } else {
        console.log("User cancelled deletion.");
      }
    })
  }

  // notification
  async loadNotifications() {
    try {
      this.loading = true;
      this.notifications = await this.guard.getNotifications();
      this.updateUnreadCount();
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      this.loading = false;
    }
  }
  setupRealtimeNotifications() {
    // Listen for real-time notification updates
    this.notificationSubscription = this.guard.onNotificationReceived()
      .subscribe((notification: NotificationData) => {
        // Add new notification to the beginning of the list
        this.notifications.unshift(notification);
        this.updateUnreadCount();

        // Show browser notification if permission granted
        this.showBrowserNotification(notification);
      });
  }

  private async initializeServiceListener() {
    try {
      console.log('Initializing service listener...');
      this.guard.setupUnreadCountListener();
      console.log('Service listener initialized');
    } catch (error) {
      console.error('Error initializing service listener:', error);
    }
  }

  // Subscribe to the service's observable
  private subscribeToUnreadCount() {
    console.log('Subscribing to unread count changes...');

    this.unreadCountSubscription = this.guard.onUnreadCountChanged().subscribe({
      next: (count: number) => {
        console.log('📨 Received unread count update:', count);
        this.unreadCount = count;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error in unread count subscription:', error);
      }
    });
  }


  trackByNotification(index: number, notification: NotificationData): string {
    return notification.id || index.toString();
  }


  private showBrowserNotification(notification: NotificationData) {
    if (Notification.permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: notification.notificationimage || '/assets/icon.png',
        badge: '/assets/badge.png',
        data: notification
      });

      browserNotification.onclick = () => {
        this.onNotificationClick(notification);
        browserNotification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => browserNotification.close(), 5000);
    }
  }

  onNotificationClick(notification: NotificationData) {
    // Mark as read if unread
    if (!notification.read) {
      this.markAsRead(notification);
    }

    // Handle navigation based on notification type or landing page
    if (notification.landingpage) {
      // Navigate to specific page
      window.open(notification.landingpage, '_blank');
    } else {
      // Handle different notification types
      this.handleNotificationAction(notification);
    }
  }

  private handleNotificationAction(notification: NotificationData) {
    console.log(notification);

    switch (notification.type) {
      case 'supportticket':
        if (notification.metadata?.chatindex && notification.metadata?.issueid) {
          // Navigate to ticket chat
          this.router.navigate(['/customersupportdashboard']);
        }
        break;
      case 'queue':
        this.router.navigate(['/dynamicqueuemanager']);
        break;
      case 'appointment':
        this.router.navigate(['/appointmentcalendar']);
        break;
      default:
        // Default action
        console.log('Notification clicked:', notification);
        break;
    }
  }

  async markAsRead(notification: NotificationData, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    try {
      await this.guard.markAsRead(notification.id!);
      notification.read = true;
      this.updateUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async markAllAsRead() {
    try {
      await this.guard.markAllAsRead();
      this.notifications.forEach(n => n.read = true);
      this.updateUnreadCount();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }



  private updateUnreadCount() {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    console.log(this.unreadCount);

  }

  formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  viewAllNotifications() {
    // Navigate to full notifications page
    // this.router.navigate(['/notifications']);
    console.log('Navigate to full notifications page');
  }

  /*
  navigateTo(route: string): void {
    this.router.navigate([route]);
    this.closeLeftDrawer();
    this.closeRightDrawer();
  }

  navigateToNew(route: string): void {
    window.open(route, '_blank');
    this.closeLeftDrawer();
    this.closeRightDrawer();
  }

  isRouteActive(route: string): boolean {
    return this.router.url.includes(route);
  }

  isParentActive(item: NavItem): boolean {
    if (!item.children) return false;
    return item.children.some(child => child.route && this.isRouteActive(child.route));
  }

  onRightPanelAction(action: string): void {
    this.router.navigate([action]);
    this.closeRightDrawer();
    this.closeLeftDrawer();
  }

  goBack(): void {
    const fullUrl = window.location.href;
    const baseUrl = fullUrl.split('?')[0]; 
    const keyword = baseUrl.substring(baseUrl.lastIndexOf('/') + 1);
    console.log('Current Base URL: ', baseUrl);
  
    if (keyword === 'usertimeline') {
      const navigationurl = 'EISDashboard';
      this.router.navigateByUrl(`/${navigationurl}`); 
      console.log('usertimeline page');
    } else {
      console.log('other page');
      this.location.back();
    }
  }

  updateFilteredNavItems(): void {
    if (!this.searchQuery) {
      this.leftNavItems.forEach(item => item.expanded = false);
      this.filteredNavItems = [...this.leftNavItems];
      return;
    }

    const query = this.searchQuery.toLowerCase();

    this.filteredNavItems = this.leftNavItems.filter(item => {
      const mainMatches = item.label.toLowerCase().includes(query);
      let childMatches = false;
      if (item.children && item.children.length > 0) {
        childMatches = item.children.some(child => child.label.toLowerCase().includes(query));
        if (childMatches) {
          item.expanded = true;
        } else {
          item.expanded = false;
        }
      } else {
        item.expanded = false;
      }

      return mainMatches || childMatches;
    });
  }

  onSearchQueryChange(): void {
    this.updateFilteredNavItems();
    this.selectedNavIndex = -1;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      this.selectedNavIndex = Math.min(this.selectedNavIndex + 1, this.filteredNavItems.length - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      this.selectedNavIndex = Math.max(this.selectedNavIndex - 1, 0);
      event.preventDefault();
    } else if (event.key === 'Enter') {
      if (this.selectedNavIndex >= 0 && this.selectedNavIndex < this.filteredNavItems.length) {
        this.onNavItemClick(this.filteredNavItems[this.selectedNavIndex]);
      }
    }
  }

  setSelectedItem(item: any): void {
    this.selectedItem = item;
    this.selectedItemIsFav = this.rightNavItemsFav?.some(fav =>
      fav.label === item.label && fav.action === item.action
    );
  }

  addtofav(item: any): void {
    if (!this.profileid) {
      console.error('No profile ID set');
      return;
    }
    let foundDocument = null;
    let isChildItem = false;
    let childIndex = -1;
    for (const docData of this.dashboardDocuments) {
      const data = docData.data;
      if (data['route'] === item.action) {
        foundDocument = docData;
        isChildItem = false;
        break;
      }
      if (data['children'] && Array.isArray(data['children'])) {
        for (let index = 0; index < data['children'].length; index++) {
          const child = data['children'][index];
          if (child.route === item.action) {
            foundDocument = docData;
            isChildItem = true;
            childIndex = index;
            break;
          }
        }
        if (foundDocument) break;
      }
    }

    if (!foundDocument) {
      console.error('Navigation item not found in dashboard collection');
      return;
    }

    const docRef = doc(this.firestore, 'dashboard', foundDocument.id);
    
    if (isChildItem) {
      const updatedChildren = [...foundDocument.data.children];
      const currentFavs = updatedChildren[childIndex].favourites || [];
      
      if (currentFavs.includes(this.profileid)) {
        console.log('Profile ID already exists in favourites');
        return;
      }
      
      updatedChildren[childIndex] = {
        ...updatedChildren[childIndex],
        favourites: [...currentFavs, this.profileid]
      };
      
      updateDoc(docRef, {
        children: updatedChildren
      }).then(() => {
        console.log('Profile ID added to child item favourites');
      }).catch((error) => {
        console.error('Error updating child favourites:', error);
      });
      
    } else {
      const currentFavs = foundDocument.data.favourites || [];
      if (currentFavs.includes(this.profileid)) {
        console.log('Profile ID already exists in favourites');
        return;
      }
      
      updateDoc(docRef, {
        favourites: [...currentFavs, this.profileid]
      }).then(() => {
        console.log('Profile ID added to parent item favourites');
      }).catch((error) => {
        console.error('Error updating parent favourites:', error);
      });
    }
  }

  removeFromFav(item: any): void {
    if (!this.profileid) {
      console.error('No profile ID set');
      return;
    }

    let foundDocument = null;
    let isChildItem = false;
    let childIndex = -1;

    for (const docData of this.dashboardDocuments) {
      const data = docData.data;
      if (data['route'] === item.action) {
        foundDocument = docData;
        isChildItem = false;
        break;
      }
      if (data['children'] && Array.isArray(data['children'])) {
        for (let index = 0; index < data['children'].length; index++) {
          const child = data['children'][index];
          if (child.route === item.action) {
            foundDocument = docData;
            isChildItem = true;
            childIndex = index;
            break;
          }
        }
        if (foundDocument) break;
      }
    }

    if (!foundDocument) {
      console.error('Navigation item not found in dashboard collection');
      return;
    }
    const docRef = doc(this.firestore, 'dashboard', foundDocument.id);
    if (isChildItem) {
      const updatedChildren = [...foundDocument.data.children];
      const currentFavs = updatedChildren[childIndex].favourites || [];
      
      const updatedFavs = currentFavs.filter(id => id !== this.profileid);
      
      updatedChildren[childIndex] = {
        ...updatedChildren[childIndex],
        favourites: updatedFavs
      };
      
      updateDoc(docRef, {
        children: updatedChildren
      }).then(() => {
        console.log('Profile ID removed from child item favourites');
      }).catch((error) => {
        console.error('Error removing from child favourites:', error);
      });
      
    } else {
      const currentFavs = foundDocument.data.favourites || [];
      const updatedFavs = currentFavs.filter(id => id !== this.profileid);
      
      updateDoc(docRef, {
        favourites: updatedFavs
      }).then(() => {
        console.log('Profile ID removed from parent item favourites');
      }).catch((error) => {
        console.error('Error removing from parent favourites:', error);
      });
    }
  }

  fetchFav(): void {
    if (this.profileid !== null && this.dashboardDocuments.length > 0) {
      this.rightNavItemsFav = [];
      this.favRouteSet.clear();
      this.dashboardDocuments.forEach((docData) => {
        const data = docData.data;
        if (data['favourites'] && Array.isArray(data['favourites']) && data['favourites'].includes(this.profileid)) {
          if (data['route']) {
            this.favRouteSet.add(data['route']);
            this.rightNavItemsFav.push({
              icon: data['icon'] || 'folder',
              label: data['label'],
              action: data['route'],
            });
          }
        }
        
        if (data['children'] && Array.isArray(data['children'])) {
          data['children'].filter(child => child.showInSidenav === true).forEach(child => {
            if (child.favourites && Array.isArray(child.favourites) && child.favourites.includes(this.profileid)) {
              const actionKey = child.route;
              if (actionKey) {
                this.favRouteSet.add(actionKey);
                this.rightNavItemsFav.push({
                  icon: child.icon || 'folder',
                  label: child.label,
                  action: actionKey,
                });
              }
            }
          });
        }
      });
      
      console.log('Updated favorites from global dashboard data:', this.rightNavItemsFav);
    }
  }

  toggleCurrentRouteFavorite(): void {
    const currentRoute = this.router.url;
    const currentItem = this.rightNavItems.find(item => 
      item.action === currentRoute || 
      item.action === currentRoute.substring(1) ||
      currentRoute.includes(item.action)
    );
    if (!currentItem) {
      console.error('Current route item not found in navigation items');
      return;
    }
    const isCurrentlyFavorite = this.favRouteSet.has(currentRoute) || this.favRouteSet.has(currentRoute.substring(1)) ||this.favRouteSet.has(currentItem.action);
    if (isCurrentlyFavorite) {
      this.removeFromFav(currentItem);
    } else {
      this.addtofav(currentItem);
    }
  }
  */
}

