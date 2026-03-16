import { Component, OnDestroy } from '@angular/core';
import { Subscription, Observable, of, finalize, map, catchError, forkJoin, takeUntil, Subject } from 'rxjs';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytesResumable } from '@angular/fire/storage';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../authguard.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-dashboard',
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatRippleModule,
  ],
  templateUrl: './main-dashboard.component.html',
  styleUrl: './main-dashboard.component.css'
})
export class MainDashboardComponent implements OnDestroy {
  userName: string | null = null;
  profilepic: string | null = null;
  profileid: string | null = null;
  profileData = {};
  favouriteItems = []
  favRouteSet = new Set<string>();
  private subscription = new Subject<void>();

// If getRoles() returns an Observable, use this approach instead:

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    public authguard: AuthguardService,
    private router: Router,
    public snackbar: MatSnackBar,
    private storage: Storage,
  ) {
    // Promise.all([
    //   authguard.getRoles(),
    //   authguard.routeConfig(this.router.url)
    // ]).then(([currentRoles, routeConfig]) => {
    //   let rolesArray =  Object.keys(currentRoles).filter(key => currentRoles[key] === true);
    //   let hasAccess = rolesArray.some(role => routeConfig.includes(role));
    //   if (!hasAccess) {
    //     this.snackbar.open('You do not have permission to access this page', 'Close', {
    //       duration: 3000
    //     });
    //     this.router.navigate(['/routeconfiguration']);
    //     return;
    //   }
      /*
      const profiledataRef = collection(this.firestore, 'profile_data');
      const userrefDoc = doc(this.firestore, 'user_data', this.authguard.uid);
      const profiledataQuery = query(profiledataRef, where("user_ref", "==", userrefDoc));
      getDocs(profiledataQuery).then((profile) => {
        if (profile.docs.length !== 0) {
          this.profileData = profile.docs[0].data();
          this.userName = this.profileData['name'];
          this.profileid = this.profileData['profileid'];
          this.profilepic = this.profileData['profile'];
          console.log(this.profileData, "profileData loaded");
          this.fetchFav();
        }
      });
      */
    // }).catch(error => {
    //   console.error('Error checking route access:', error);
    //   this.router.navigate(['/routeconfiguration']);
    // });
  }

  /*
  fetchFav() {
    if (this.profileid !== null) {
      const dashboardCollection = collection(this.firestore, 'dashboard');
      collectionSnapshots(dashboardCollection).pipe(takeUntil(this.subscription))
      .subscribe({
        next: (snapshot) => {
          this.favouriteItems = [];
          this.favRouteSet.clear();
          snapshot.forEach(doc => {
            const data = doc.data();
            if (data['favourites'] && Array.isArray(data['favourites']) && data['favourites'].includes(this.profileid)) {
              if (data['route']) {
                const actionKey = data['route'];
                this.favRouteSet.add(actionKey);
                this.favouriteItems.push({
                  icon: data['icon'] || 'folder',
                  label: data['label'],
                  action: actionKey,
                });
              }
            }
            if (data['children'] && Array.isArray(data['children'])) {
              data['children'].forEach(child => {
                if (child.favourites && Array.isArray(child.favourites) && child.favourites.includes(this.profileid)) {
                  const actionKey = child.route;
                  if (actionKey) {
                    this.favRouteSet.add(actionKey);
                    this.favouriteItems.push({
                      icon: child.icon || 'folder',
                      label: child.label,
                      action: actionKey,
                    });
                  }
                }
              });
            }
          });
          
          console.log('Updated favorites from dashboard collection:', this.favouriteItems);
        },
        error: (error) => {
          console.error('Error fetching favorites from dashboard collection:', error);
        }
      });
    }
  }
  */

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  navigateToRoute(action: string) {
    this.router.navigate([action]);
  }

  trackByAction(index: number, item: any): string {
    return item.action;
  }
}