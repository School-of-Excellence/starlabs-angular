import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore, orderBy, query } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { DialogAddProductComponent } from './dialog-add-product/dialog-add-product.component';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ReactiveFormsModule } from '@angular/forms';


@Component({
  selector: 'app-add-product',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    ReactiveFormsModule,
    MatSortModule,
    CommonModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule
  ],
  templateUrl: './add-product.component.html',
  styleUrl: './add-product.component.css'
})
export class AddProductComponent {
// ,"category"
  displayedColumns = ["product", "minimumrequiredamount", "atcmodel", "mode", "deliveryplanning", "integrationdays", "performancedays", "extendedperformancedays", "unlimited","originalfee",  "Edit"];
  dataSource:MatTableDataSource<any>;
  listofproduct

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  productSubscription:Subscription

  //collection variable
  productsRef;

  constructor(public dialog:MatDialog,private afs : Firestore, public guard: AuthguardService, public router: Router) {
    this.productsRef = collection(this.afs,'products')
    // this.guard.getRoles().then(roleData=>{
    //   if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
    //     console.log("Good") 
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // })
  }

  ngOnInit(): void {
    this.dataSource = new MatTableDataSource([]);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    const ref = collection(this.afs,'products')
    const queryProduct = query(ref,orderBy('product'))
    this.productSubscription = collectionData(queryProduct, {idField:'id'}).subscribe(doc =>{
      this.listofproduct = doc;
      this.dataSource.data = doc
    })
  }

  ngOnDestroy(){
    this.productSubscription.unsubscribe()
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  addproductdialog(){
    this.dialog.open(DialogAddProductComponent,{
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
  }
  
  onrowdelete(id){
    // console.log(id);
    this.dialog.open(DialogAddProductComponent,{
      width: '400px',
      data : {
        delete : true ,
        id: id
      }
    })
  }
  
  onrowedit (data){
    // const userobj = this.listofproduct.find( item => {
    //   return item.id === id
    // })
    console.log(data);
    this.dialog.open(DialogAddProductComponent, {
      data : data,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    
  }

}
