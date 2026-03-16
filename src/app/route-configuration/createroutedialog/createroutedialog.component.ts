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
    MatProgressSpinner
  ],
  templateUrl: './createroutedialog.component.html',
  styleUrl: './createroutedialog.component.css'
})
export class CreateroutedialogComponent {
  icons = iconList;
  label = '';
  route = '';
  icon = '';
  showInSidenav;
  enabled = false;
  errorMessage = '';
  orderNumber:number;
  private lastRoute: string = '';
  private lastselectedRoles: string[] = [];
  ordernumberValid = true;
  roleList = []
  // allRoutes: string[] = [];
  allRoutes: Map<string, string> = new Map(); 
  editingRoutes: string[] = [];
  selectedRoles: string[] = [];
  loading = true;
  
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore
  ) {
    const docref = doc(this.firestore, 'starlabs roles', 'roles')
    getDoc(docref).then(role => {
      if(role.exists()){
        this.roleList = role.data()["name"].sort((a, b) => a.localeCompare(b))
        this.roleList.push('RootAccess')
      }
      this.loading = false;
    })
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
      this.selectedRoles = edit.roles || [];

      if (this.enabled) {
        this.children = edit.children || [];
        this.route = null;
        this.selectedRoles = []; 
      } else {
        this.route = edit.route || '';
        this.selectedRoles = edit.roles || [];
      }


    } else if (this.data?.fullData?.length) {
      const maxOrder = Math.max(...this.data.fullData.map((item: any) => item.order));
      this.orderNumber = maxOrder + 1;
    } else {
      console.log('No route data available');
    }    
  }

  children: { label: string; route: string; icon: string; roles: string[]; showInSidenav:boolean }[] = [
    { label: '', route: '', icon: '', roles: [], showInSidenav:null }
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
      this.lastselectedRoles = this.selectedRoles
      this.route = null;
      // this.showInSidenav = null              
      this.selectedRoles = [];          
    } else {
      this.route = this.lastRoute || '';
      // this.showInSidenav = this.lastshowInSidenav || null;
      this.selectedRoles =this. lastselectedRoles || [];
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
    this.children.push({ label: '', route: '', icon: '', roles: [],showInSidenav:null });
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
      console.log(this.allRoutes,"allRoutes console in 1");
      const existingLabel = this.allRoutes.get(this.route);
      this.errorMessage = `"${this.route}" is already added in another component: ${existingLabel}.`;
      return;
    }

    if (this.enabled) {
      console.log(this.allRoutes,"allRoutes console in 2");
      const duplicateChild = this.children.find(child => this.allRoutes.has(child.route));
      if (duplicateChild) {
        const existingLabel = this.allRoutes.get(duplicateChild.route);
        this.errorMessage = `"${duplicateChild.route}" is already added in another component: ${existingLabel}.`;
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

    const mainRoute = {
      label: this.label,
      route: this.route,
      icon: this.icon,
      showInSidenav: this.showInSidenav,
      order: this.orderNumber,
      children: this.enabled ? this.children : [],
      roles: this.selectedRoles
    };

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
  close(){
    this.dialogRef.close()
  }
}
