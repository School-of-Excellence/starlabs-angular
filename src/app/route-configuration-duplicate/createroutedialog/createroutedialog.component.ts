import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { iconList } from '../../icon-list';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { collection, doc, Firestore, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { MatDivider } from '@angular/material/divider';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AuthguardService } from '../../authguard.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-createroutedialog',
  standalone: true,
  imports: [
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatButtonModule,
    CommonModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    MatDivider,
    MatProgressSpinner,
    MatButtonToggleModule,
    NgxMatSelectSearchModule,
    ProfilePictureComponent
  ],
  templateUrl: './createroutedialog.component.html',
  styleUrl: './createroutedialog.component.css'
})
export class CreateroutedialogComponent {
  icons = iconList;
  label = '';
  route = '';
  icon = '';
  profileSearch = ''
  showInSidenav;
  enabled = false;
  // accessType = 'role';
  // lastAccessType = '';
  errorMessage = '';
  orderNumber: number;
  private lastRoute: string = '';
  private lastselectedRoles: string[] = [];
  private lastselectedProfiles: string[] = [];
  ordernumberValid = true;
  roleList = [];
  profilesList = [];
  profilesMap: any = {}
  // allRoutes: string[] = [];
  allRoutes: Map<string, string> = new Map();
  editingRoutes: string[] = [];
  selectedRoles: string[] = [];
  selectedProfiles: string[] = [];
  loading = true;

  loggedProfileRoles = {}

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    private authguard: AuthguardService
  ) {
    this.loggedProfileRoles = data["profileroles"]
    const docref = doc(this.firestore, 'starlabs roles', 'roles')
    getDoc(docref).then(role => {
      if (role.exists()) {
        this.roleList = role.data()["name"].sort((a, b) => a.localeCompare(b))
        this.roleList.push('RootAccess')
      }
      this.loading = false;
    })
    this.authguard.getProfileMap().then((map) => {
      this.profilesMap = map.docdata;
    }).catch(error => console.log(error))
    console.log(this.data, 'consoling route dialog');
    this.data?.fullData?.forEach((doc: any) => {
      if (doc.route) {
        // this.allRoutes.push(doc.route);
        this.allRoutes.set(doc.route, doc.label);
      }
      if (Array.isArray(doc.children)) {
        doc.children.forEach((child: any) => {
          if (child.route) {
            // this.allRoutes.push(child.route);
            this.allRoutes.set(child.route, doc.label);
          }
        });
      }
    });

    if (this.data?.editData) {
      const doc = this.data.editData;

      if (doc.route) {
        this.editingRoutes.push(doc.route);
      }
      if (Array.isArray(doc.children)) {
        doc.children.forEach((child: any) => {
          if (child.route) {
            this.editingRoutes.push(child.route);
          }
        });
      }
    }
    this.editingRoutes.forEach(route => {
      this.allRoutes.delete(route);
    });
    // this.allRoutes = this.allRoutes.filter(route => !this.editingRoutes.includes(route));
    if (this.data?.editData) {
      const edit = this.data.editData;

      this.label = edit.label || '';
      this.icon = edit.icon || '';
      this.showInSidenav = edit.showInSidenav;
      this.enabled = edit.enabled || false;
      this.orderNumber = edit.order || 0;

      if (this.enabled) {
        const children = edit.children?.map((child) => ({ ...child, profileSearch: '' }))
        this.children = children || [];
        this.route = null;
        this.selectedRoles = [];
        this.selectedProfiles = [];
      } else {
        this.route = edit.route || '';
        this.selectedRoles = edit.roles || [];
        this.selectedProfiles = edit.profileid || [];
      }

    } else if (this.data?.fullData?.length) {
      const maxOrder = Math.max(...this.data.fullData.map((item: any) => item.order));
      this.orderNumber = maxOrder + 1;
    } else {
      console.log('No route data available');
    }

  }

  children: { label: string; route: string; icon: string; roles: string[]; profileid: []; showInSidenav: boolean, profileSearch: string; }[] = [
    { label: '', route: '', icon: '', roles: [], profileid: [], showInSidenav: null, profileSearch: '' }
  ];


  // get isMainValid(): boolean {
  //   const hasLabelAndIcon = this.label.trim() !== '' && this.icon.trim() !== '';
  //   const routeIsValid = this.enabled ? true : this.route.trim() !== '';
  //   if (this.enabled) {
  //     return hasLabelAndIcon && routeIsValid;
  //   }
  //   const hasVisibilitySet = this.showInSidenav === true || this.showInSidenav === false;
  //   return hasLabelAndIcon && routeIsValid && hasVisibilitySet;
  // }
  get isMainValid(): boolean {
    const hasLabelAndIcon = this.label.trim() !== '' && this.icon.trim() !== '';
    const routeIsValid = this.enabled ? true : this.route.trim() !== '';
    const hasVisibilitySet = this.showInSidenav === true || this.showInSidenav === false;
    return hasLabelAndIcon && routeIsValid && hasVisibilitySet;
  }


  get isChildrenValid(): boolean {
    return this.children.length > 0 && this.children.every(
      child =>
        child.label.trim() !== '' &&
        child.route.trim() !== '' &&
        child.icon.trim() !== '' &&
        (child.showInSidenav === true || child.showInSidenav === false)
    );
  }
  onToggleSubComponent(enabled: boolean) {
    this.enabled = enabled;

    if (enabled) {
      this.lastRoute = this.route ?? '';
      // this.lastshowInSidenav = this.showInSidenav ?? null; 
      this.lastselectedRoles = this.selectedRoles;
      this.lastselectedProfiles = this.selectedProfiles;
      this.route = null;
      // this.showInSidenav = null              
      this.selectedRoles = [];
      this.selectedProfiles = [];
    } else {
      this.route = this.lastRoute || '';
      // this.showInSidenav = this.lastshowInSidenav || null;
      this.selectedRoles = this.lastselectedRoles || [];
      this.selectedProfiles = this.lastselectedProfiles || [];
    }
  }


  onOrderNumberChange(value: any) {
    if (value !== null && value !== '') {
      const newOrderNumber = Number(value);
      this.orderNumber = newOrderNumber;
      const duplicates = this.data?.fullData.filter((item: any) =>
        item.order === newOrderNumber && item.docid !== this.data.editData?.docid
      );

      if (duplicates.length > 0) {
        this.ordernumberValid = false
        this.errorMessage = `The order number ${newOrderNumber} is already in use by the following entries: ${duplicates.map(item => item.label).join(', ')}.`;
      } else {
        this.ordernumberValid = true
        this.errorMessage = '';
      }
    } else {
      this.ordernumberValid = true
      this.orderNumber = null;
      this.errorMessage = '';
    }
  }

  addChildField() {
    this.children.push({ label: '', route: '', icon: '', roles: [], profileid: [], showInSidenav: null, profileSearch: '' });
  }


  removeChildField(index: number) {
    this.children.splice(index, 1);
  }
  isValidRoute(route: string): boolean {
    return route.startsWith('/') && !/\s/.test(route);
  }

  async save() {
    this.errorMessage = '';

    if (!this.isMainValid) {
      this.errorMessage = 'Please fill in Label, Route,Show In Sidenav and Icon.';
      return;
    }

    if (!this.enabled && !this.isValidRoute(this.route)) {
      this.errorMessage = 'Main route must start with "/" and contain no spaces.';
      return;
    }


    if (this.enabled) {
      if (!this.isChildrenValid) {
        this.errorMessage = 'All subcomponents must have Label, Route,side nav and Icon filled.';
        return;
      }

      const invalidChild = this.children.find(child => !this.isValidRoute(child.route));
      if (invalidChild) {
        this.errorMessage = 'Each subcomponent route must start with "/" and contain no spaces.';
        return;
      }
    }
    if (!this.enabled && this.allRoutes.has(this.route)) {
      console.log(this.allRoutes, "allRoutes console in 1");
      const existingLabel = this.allRoutes.get(this.route);
      this.errorMessage = `"${this.route}" is already added in another component: ${existingLabel}.`;
      return;
    }

    if (this.enabled) {
      console.log(this.allRoutes, "allRoutes console in 2");
      const duplicateChild = this.children.find(child => this.allRoutes.has(child.route));
      if (duplicateChild) {
        const existingLabel = this.allRoutes.get(duplicateChild.route);
        this.errorMessage = `"${duplicateChild.route}" is already added in another component: ${existingLabel}.`;
        return;
      }
    }

    if (this.enabled) {
      const childMap = new Map();
      let duplicateChild = '';
      this.children.forEach(child => {
        childMap.set(child['route'], (childMap.get(child['route']) || 0) + 1)
      });
      
      for(let route of childMap.entries()){
        if (route[1] > 1) {
          duplicateChild = route[0];
          break
        }
      }
      if (duplicateChild !== '') {
        this.errorMessage = `"${duplicateChild}" is already duplicated`;
        return;
      }
    }

    // if (!this.enabled && this.allRoutes.includes(this.route)) {
    //   console.log(this.allRoutes,"allRoutes console in 1");

    //   this.errorMessage = `"${this.route}" is already added in another component.`;
    //   return;
    // }

    // if (this.enabled) {
    //   console.log(this.allRoutes,"allRoutes console in 2");
    //   const duplicateChild = this.children.find(child => this.allRoutes.includes(child.route));
    //   if (duplicateChild) {
    //     this.errorMessage = `"${duplicateChild.route}" is already added in another component.`;
    //     return;
    //   }
    // }
    const childrens = this.children.map((child) => {
      return {
        label: child.label,
        route: child.route,
        icon: child.icon,
        roles: child.roles || [],
        profileid: child.profileid || [],
        showInSidenav: child.showInSidenav
      }
    })

    const mainRoute = {
      label: this.label,
      route: this.route,
      icon: this.icon,
      showInSidenav: this.showInSidenav,
      order: this.orderNumber,
      children: this.enabled ? childrens : [],
      roles: this.enabled ? [] : this.selectedRoles,
      profileid: this.enabled ? [] : this.selectedProfiles,
    };

    console.log('dashboard data', mainRoute)

    try {
      const dashboardCollection = collection(this.firestore, 'dashboard');

      if (this.data?.editData?.docid) {
        const docRef = doc(dashboardCollection, this.data.editData.docid);
        await updateDoc(docRef, mainRoute);
      } else {
        const newDocRef = doc(dashboardCollection);
        await setDoc(newDocRef, mainRoute);
      }
      this.dialogRef.close();
    } catch (error) {
      this.errorMessage = 'An error occurred while saving. Please try again.';
    }
  }
  close() {
    this.dialogRef.close()
  }

  getProfileNamesFromIds(ids: string[] | null | undefined): string {
    if (!ids || ids.length === 0) return '';
    return ids
      .map(id => this.getProfileFields(id, 'name'))
      .filter(name => !!name)
      .join(', ');
  }

  getProfileFields(profileId: string, key: string) {
    const profile = this.profilesMap[profileId];
    if (profile && Object.prototype.hasOwnProperty.call(profile, key)) {
      return profile[key];
    }
    return '';
  }

  getProfileIds() {
    return Object.keys(this.profilesMap);
  }

  getInitials(profileId: string): string {
    const name = this.profilesMap[profileId]?.name;
    return name ? name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : '';
  }

  filterProfilesIds(searchText: string, profileId: string): boolean {
    const text = (searchText || '').toLowerCase();
    if (text === '') return true;
    return (
      this.getProfileFields(profileId, 'name').toLowerCase().includes(text) ||
      this.getProfileFields(profileId, 'email').toLowerCase().includes(text)
    );
  }
}
