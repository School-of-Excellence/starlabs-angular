import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Firestore, collectionData, collection, doc, updateDoc, getDoc, addDoc, Timestamp } from '@angular/fire/firestore';
import { MatCardModule } from '@angular/material/card';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EiflixBannerComponent } from '../eiflix-banner/eiflix-banner.component';

@Component({
  selector: 'app-workshops',
  imports: [
    MatCardModule,
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './workshops.component.html',
  styleUrl: './workshops.component.css'
})
export class WorkshopsComponent {
  displayedColumns: string[] = ['active', 'title', 'type', 'created', 'startDate', 'endDate', 'status', 'edit'];
  workshops$: Observable<any[]>;

  statusFilter: 'all' | 'active' | 'inactive' | 'completed' = 'all';
  sortField: 'created' | 'startDate' | 'endDate' = 'created';
  sortDirection: 'asc' | 'desc' = 'desc';
  filteredWorkshops: any[] = [];

  constructor(
    private firestore: Firestore,
    private router: Router,
    private snackBar: MatSnackBar,
    public dialog: MatDialog,
  ) {
    const workshopRef = collection(this.firestore, 'workshopconfiguration');
    this.workshops$ = collectionData(workshopRef, { idField: 'id' });
  }

  applyFilters(): void { 
  }

  setSortField(field: 'created' | 'startDate' | 'endDate'): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'desc';
    }
  }

  applyAllFilters(workshops: any[]): any[] {
    let result = [...workshops];
    if (this.statusFilter === 'active') {
      result = result.filter(w => w.active && !w.workshopcompleted);
    } else if (this.statusFilter === 'inactive') {
      result = result.filter(w => !w.active);
    } else if (this.statusFilter === 'completed') {
      result = result.filter(w => w.workshopcompleted);
    }

    result.sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (this.sortField === 'created') {
        aVal = a['created']?.toDate?.()?.getTime() ?? 0;
        bVal = b['created']?.toDate?.()?.getTime() ?? 0;
      } else if (this.sortField === 'startDate') {
        aVal = a['detailpage']?.workshopStartDate?.toDate?.()?.getTime() ?? 0;
        bVal = b['detailpage']?.workshopStartDate?.toDate?.()?.getTime() ?? 0;
      } else if (this.sortField === 'endDate') {
        aVal = a['detailpage']?.workshopEndDate?.toDate?.()?.getTime() ?? 0;
        bVal = b['detailpage']?.workshopEndDate?.toDate?.()?.getTime() ?? 0;
      }
      return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    this.filteredWorkshops = result;
    return result;
  }

  route(routeto: string, id?: any) {
    if (routeto === 'create') {
      window.open('/create-workshop', '_blank');
    } else if (routeto === 'edit') {
      window.open(`/workshopconfig/${id.docid}`, '_blank');
    }
  }

  async dashboardNavigation(workshop: any): Promise<void> {
    try {
      console.log(workshop);
      window.open(`/workshop_dashboard/${workshop['id']}`, '_blank');
    } catch (error) {
      console.error('Error:', error);
    }
  }

  openEiflixBannerDialog() {
    this.dialog.open(EiflixBannerComponent, {
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      autoFocus: false,
      panelClass: 'eiflix-banner-dialog'
    });
  }

  routeToProducts(): void {
    window.open('/productpageworkshop', '_blank');
  }

  async onWorkshopStatusChange(workshop: any, event: any): Promise<void> {
    const isActive = event.checked;
    const title = workshop?.detailpage?.title || 'this workshop';
    const confirmed = window.confirm(
      `Are you sure you want to ${isActive ? 'activate' : 'deactivate'} "${title}"?`
    );
    if (!confirmed) {
      event.source.checked = !isActive;
      return;
    }
    try {
      const workshopRef = doc(this.firestore, `workshopconfiguration/${workshop.docid}`);
      await updateDoc(workshopRef, { active: isActive });
      this.snackBar.open(
        `Workshop ${isActive ? 'activated' : 'deactivated'} successfully!`,
        'Close', { duration: 2000 }
      );
      workshop.active = isActive;
    } catch (error) {
      console.error('Error updating workshop status:', error);
      event.source.checked = !isActive;
      this.snackBar.open('Error updating workshop status. Please try again.', 'Close', { duration: 3000 });
    }
  }

  async onWorkshopCompletedChange(workshop: any, event: any): Promise<void> {
    const isCompleted = event.checked;
    const title = workshop?.detailpage?.title || 'this workshop';
    const confirmed = window.confirm(
      `Are you sure you want to mark "${title}" as ${isCompleted ? 'completed' : 'pending'}?`
    );
    if (!confirmed) {
      event.source.checked = !isCompleted;
      return;
    }
    try {
      const workshopRef = doc(this.firestore, `workshopconfiguration/${workshop.docid}`);
      await updateDoc(workshopRef, { workshopcompleted: isCompleted });
      this.snackBar.open(
        `Workshop marked as ${isCompleted ? 'completed' : 'pending'} successfully!`,
        'Close', { duration: 2000 }
      );
      workshop.workshopcompleted = isCompleted;
    } catch (error) {
      console.error('Error updating completion status:', error);
      event.source.checked = !isCompleted;
      this.snackBar.open('Error updating completion status. Please try again.', 'Close', { duration: 3000 });
    }
  }

  async duplicateWorkshop(workshop: any): Promise<void> {
    const confirmed = window.confirm('Are you sure you want to duplicate ' + workshop['detailpage']['title'] + ' workshop?');
    if (!confirmed) return;
    try {
      const workshopRef = doc(this.firestore, `workshopconfiguration/${workshop.docid}`);
      const workshopSnap = await getDoc(workshopRef);
      if (workshopSnap.exists()) {
        const workshopData = workshopSnap.data();
        const newDocRef = await addDoc(collection(this.firestore, 'workshopconfiguration'), {
          ...workshopData,
          created: Timestamp.now(),
          active: false,
        });
        await updateDoc(newDocRef, { docid: newDocRef.id });
        this.snackBar.open('Workshop duplicated successfully!', 'Close', { duration: 2000 });
      }
    } catch (error) {
      console.error('Error duplicating workshop:', error);
      this.snackBar.open('Error duplicating workshop. Please try again.', 'Close', { duration: 3000 });
    }
  }
}