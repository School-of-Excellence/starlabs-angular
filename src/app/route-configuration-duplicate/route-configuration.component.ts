import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../authguard.service';
import { Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { CreateroutedialogComponent } from './createroutedialog/createroutedialog.component';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ConfirmComponent } from '../DialogBox/confirm/confirm.component';

interface RouteItem {
  order: number | string;
  label: string;
  route: string;
  showInSidenav:boolean;
  icon: string;
  docid: string;
  children?: RouteItem[];
  isExpanded?: boolean;
  isChild?: boolean;
  parentId?: string;
  childIndex?: number;
  showDrag?:boolean;
  roles: [];
}

@Component({
  selector: 'app-route-configuration',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    DragDropModule
  ],
  templateUrl: './route-configuration.component.html',
  styleUrls: ['./route-configuration.component.css']
})
export class RouteConfigurationComponent {
  displayedColumns: string[] = ['expand', 'order', 'label','sidenav','route', 'icon', 'sub','Edit','Delete'];
  dataSource = new MatTableDataSource<RouteItem>();
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) matSort!: MatSort;

  private subscription = new Subject<void>();
  private originalData: RouteItem[] = [];
  private expandedData: RouteItem[] = [];
  isAllExpanded = false;

  constructor(
    public firestore: Firestore, 
    public dialog: MatDialog, 
    public guard: AuthguardService, 
    public router: Router
  ) {
    // guard.getRoles().then(roles =>{
    //   if(roles["developer"]){
    //     this.loadData();
    //   }
    //   else{
    //     router.navigateByUrl("/")
    //   }
    // })
    this.loadData();
  }

  toggleExpandAll(): void {
    this.isAllExpanded = !this.isAllExpanded;
    this.originalData.forEach(item => {
      if (item.children && item.children.length > 0) {
        item.isExpanded = this.isAllExpanded;
      }
    });
    this.buildExpandedData();
  }

  loadData(): void {
    const productRef = collection(this.firestore, "dashboard");
    collectionSnapshots(productRef).pipe(takeUntil(this.subscription)).subscribe(prod => {
      this.originalData = prod.map(doc => {
        const data = doc.data() as any;
          if (typeof data.order === 'string') {
            console.log(`Document ID: ${doc.id}, Order is a string: ${data.order}`);
          } else if (typeof data.order === 'number') {
            console.log(`Document ID: ${doc.id}, Order is a number: ${data.order}`);
          } else {
            console.log(`Document ID: ${doc.id}, Order is of type: ${typeof data.order}`);
          }
        return { 
          docid: doc.id, 
          ...data,
          isExpanded: false,
          isChild: false
        };
      }).sort((a, b) => a.order - b.order);
      
      this.buildExpandedData();
    });
  }
  buildExpandedData(): void {
    this.expandedData = [];
    this.originalData.forEach(item => {
      if (!item.hasOwnProperty('originalRoles')) {
        (item as any).originalRoles = item.roles ? [...item.roles] : [];
      }
      if (item.children && item.children.length > 0 && !item.isExpanded) {
        const childrenRoles = item.children.reduce((allRoles: string[], child: RouteItem) => {
          if (child.roles && Array.isArray(child.roles)) {
            return [...allRoles, ...child.roles];
          }
          return allRoles;
        }, []);
        const parentRoles = (item as any).originalRoles || [];
        const combinedRoles = [...parentRoles, ...childrenRoles];
        item.roles = [...new Set(combinedRoles)] as [];
      }
      else if (item.children && item.children.length > 0 && item.isExpanded) {
        item.roles = (item as any).originalRoles || [];
      }
      this.expandedData.push(item);
      if (item.isExpanded && item.children && item.children.length > 0) {
        item.children.forEach((child, index) => {
          this.expandedData.push({
            ...child,
            // order: item.order,
            order: `${item.order}.${index + 1}`,
            label: `${item.label} / ${child.label}`,
            isChild: true,
            showInSidenav:child.showInSidenav,
            parentId: item.docid,
            docid: item.docid,
            childIndex: index,
            showDrag: item.children.length > 1 
          });
        });
      }
    });
    
    this.dataSource.data = this.expandedData;
  }

  toggleExpand(element: RouteItem): void {
    if (element.children && element.children.length > 0) {
      element.isExpanded = !element.isExpanded;
      this.buildExpandedData();
    }
  }

  hasChildren(element: RouteItem): boolean {
    return element.children && element.children.length > 0;
  }

  onChildRouteDrop(event: CdkDragDrop<RouteItem[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      const droppedItem = this.expandedData[event.previousIndex];
      if (!droppedItem.isChild) {
        return;
      }
      const parentItem = this.originalData.find(item => item.docid === droppedItem.parentId);
      if (!parentItem || !parentItem.children) {
        return;
      }

      const childItems = this.expandedData.filter(item => 
        item.isChild && item.parentId === droppedItem.parentId
      );

      const newChildren = [...parentItem.children];
      
      const draggedChildIndex = droppedItem.childIndex!;
      let targetChildIndex = 0;
      const childItemsBeforeTarget = this.expandedData
        .slice(0, event.currentIndex)
        .filter(item => item.isChild && item.parentId === droppedItem.parentId);
      targetChildIndex = childItemsBeforeTarget.length;
      moveItemInArray(newChildren, draggedChildIndex, targetChildIndex);
      parentItem.children = newChildren;
      const confirmed = confirm(`Are you sure you want to update the order"?`);
      if (confirmed) {
        this.updateFirestoreDocument(parentItem);
        this.buildExpandedData(); 
      }
    }
  }

  async updateFirestoreDocument(parentItem: RouteItem): Promise<void> {
    try {
      const dashboardRef = collection(this.firestore, 'dashboard');
      const dashboardDoc = doc(dashboardRef, parentItem.docid);
      
      await updateDoc(dashboardDoc, {
        children: parentItem.children
      });
      
      console.log('Children order updated successfully in Firestore');
    } catch (error) {
      console.error('Error updating children order in Firestore:', error);
    }
  }

  canDrag(element: RouteItem): boolean {
    return element.isChild === true;
  }

  getTableData(): RouteItem[] {
    return this.expandedData;
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.matSort;
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  createRoute(){
    this.dialog.open(CreateroutedialogComponent,{
      data:{
        fullData:this.originalData
      },
      disableClose:true,
      width:'90%',
      height:'80%'
    })
  }

  editRoute(element: RouteItem){
    let editData = element
    if (![null,undefined].includes(editData['route'])) {
      editData['enabled'] = false
    } else {
      editData['enabled'] = true
    }
    this.dialog.open(CreateroutedialogComponent,{
      data:{
        editData:editData,
        fullData:this.originalData
      },
      width:'90%',
      disableClose:true,
      height:'80%'
    })
  }

  deleteRoute(element: RouteItem){
    console.log(element);
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        title: 'Confirm Delete',
        message: 'Are you sure you want to delete this item?',
        confirmText: 'Yes',
        cancelText: 'No'
      },
      disableClose: true
    });
    dialogRef.afterClosed().subscribe(result =>{
      if (result) {
        const dashboardRef = collection(this.firestore, 'dashboard');
        const dashboardDoc = doc(dashboardRef, element.docid);
        deleteDoc(dashboardDoc).then(() => {
          console.log("Document successfully deleted");
        }).catch(error => {
          console.error("Error deleting document: ", error);
        });
      } else {
        console.log("User cancelled deletion.");
      }
    })
  }
}