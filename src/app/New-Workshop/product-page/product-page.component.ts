// import { Component, OnInit, ViewChild } from '@angular/core';
// import { MatDialog } from '@angular/material/dialog';
// import {
//   Firestore,
//   doc,
//   getDoc,
//   updateDoc,
//   setDoc
// } from '@angular/fire/firestore';
// import { MatTableDataSource, MatTableModule } from '@angular/material/table';
// import { MatButtonModule } from '@angular/material/button';
// import { CommonModule } from '@angular/common';
// import { MatIconModule } from '@angular/material/icon';
// import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
// import { AddProductWebComponent } from './add-product-web/add-product-web.component';
// import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
// import { MatSort, MatSortModule } from '@angular/material/sort';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import { MatTabsModule } from '@angular/material/tabs';

// @Component({
//   selector: 'app-product-page',
//   standalone: true,
//   imports: [
//     CommonModule,
//     MatTableModule,
//     MatButtonModule,
//     MatIconModule,
//     MatSnackBarModule,
//     MatPaginatorModule,
//     MatFormFieldModule,
//     MatInputModule,
//     MatSortModule,
//     MatTabsModule
//   ],
//   templateUrl: './product-page.component.html',
//   styleUrl: './product-page.component.css'
// })
// export class ProductPageComponent implements OnInit {
//   displayedColumns: string[] = [
//     'productname',
//     'shortdescription',
//     'claimlink',
//     'productimage',
//     'actions'
//   ];

//   dataSource = new MatTableDataSource<any>([]);

//   @ViewChild(MatPaginator) paginator!: MatPaginator;
//   @ViewChild(MatSort) sort!: MatSort;

//   constructor(
//     private firestore: Firestore,
//     private dialog: MatDialog,
//     private snackBar: MatSnackBar
//   ) {}

//   ngOnInit() {
//     this.loadProducts();
//   }


//   async loadProducts() {
//     const docRef = doc(this.firestore, 'static meta data', 'Product Page');
//     const docSnap = await getDoc(docRef);

//     const products = docSnap.exists() ? docSnap.data()['products'] : [];

//     this.dataSource = new MatTableDataSource(products);

//     setTimeout(() => {
//       this.dataSource.paginator = this.paginator;
//       this.dataSource.sort = this.sort;
//     });
//   }

//   applyFilter(event: any) {
//     const filterValue = event.target.value.trim().toLowerCase();
//     this.dataSource.filter = filterValue;
//   }

//   openAddDialog() {
//     const dialogRef = this.dialog.open(AddProductWebComponent, {
//       width: '600px',
//       data: null
//     });

//     dialogRef.afterClosed().subscribe((res) => {
//       if (res) this.loadProducts();
//     });
//   }

//   openEditDialog(product: any, index: number) {
//     const dialogRef = this.dialog.open(AddProductWebComponent, {
//       width: '600px',
//       data: { product, index }
//     });

//     dialogRef.afterClosed().subscribe((res) => {
//       if (res) this.loadProducts();
//     });
//   }

//   async deleteProduct(index: number) {
//     const confirmDelete = confirm('Are you sure you want to delete this product?');

//     if (!confirmDelete) return;

//     try {
//       const docRef = doc(this.firestore, 'static meta data', 'Product Page');

//       const currentProducts = this.dataSource.data;
//       currentProducts.splice(index, 1);

//       await updateDoc(docRef, { products: currentProducts });

//       this.snackBar.open('Product deleted', 'Close', { duration: 3000 });
//       this.loadProducts();
//     } catch (e) {
//       console.error(e);
//       this.snackBar.open('Delete failed', 'Close', { duration: 3000 });
//     }
//   }
// }

import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc
} from '@angular/fire/firestore';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AddProductWebComponent } from './add-product-web/add-product-web.component';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSortModule,
    MatTabsModule,
    DragDropModule
  ],
  templateUrl: './product-page.component.html',
  styleUrl: './product-page.component.css'
})
export class ProductPageComponent implements OnInit {
  displayedColumns: string[] = [
    'drag',
    'productname',
    'shortdescription',
    'claimlink',
    'buttonname',
    'productimage',
    'actions'
  ];

  dataSource = new MatTableDataSource<any>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadProducts();
  }

  async loadProducts() {
    const docRef = doc(this.firestore, 'static meta data', 'Product Page');
    const docSnap = await getDoc(docRef);
    const products = docSnap.exists() ? docSnap.data()['products'] : [];
    this.dataSource = new MatTableDataSource(products);
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  applyFilter(event: any) {
    const filterValue = event.target.value.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(AddProductWebComponent, {
      width: '600px',
      data: null
    });
    dialogRef.afterClosed().subscribe((res) => {
      if (res) this.loadProducts();
    });
  }

  openEditDialog(product: any, index: number) {
    const dialogRef = this.dialog.open(AddProductWebComponent, {
      width: '600px',
      data: { product, index }
    });
    dialogRef.afterClosed().subscribe((res) => {
      if (res) this.loadProducts();
    });
  }

  async deleteProduct(index: number) {
    const confirmDelete = confirm('Are you sure you want to delete this product?');
    if (!confirmDelete) return;
    try {
      const docRef = doc(this.firestore, 'static meta data', 'Product Page');
      const currentProducts = this.dataSource.data;
      currentProducts.splice(index, 1);
      await updateDoc(docRef, { products: currentProducts });
      this.snackBar.open('Product deleted', 'Close', { duration: 3000 });
      this.loadProducts();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Delete failed', 'Close', { duration: 3000 });
    }
  }

  async drop(event: CdkDragDrop<any[]>) {
    const data = this.dataSource.data;
    moveItemInArray(data, event.previousIndex, event.currentIndex);
    this.dataSource.data = data;
    try {
      const docRef = doc(this.firestore, 'static meta data', 'Product Page');
      await updateDoc(docRef, { products: data });
      this.snackBar.open('Product order updated', 'Close', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Update failed', 'Close', { duration: 3000 });
    }
  }
}
