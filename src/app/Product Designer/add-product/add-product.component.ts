import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, orderBy, query, updateDoc } from '@angular/fire/firestore';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';


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
    MatFormFieldModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './add-product.component.html',
  styleUrl: './add-product.component.css'
})
export class AddProductComponent {
// ,"category"
  displayedColumns = ["product", "minimumrequiredamount", "atcmodel", "mode", "deliveryplanning", "integrationdays", "performancedays", "extendedperformancedays", "unlimited","originalfee",  "Edit", "Delete"];
  dataSource:MatTableDataSource<any>;
  listofproduct

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  productSubscription:Subscription

  //collection variable
  productsRef;

  /* ── Soft delete ─────────────────────────────────────────────────────
     The toggle writes `isdelete` on the product document rather than removing it: a product is
     referenced by delivery plans and participant records, so a hard delete would strand them. The
     existing dialog `ondelete` (a real deleteDoc) is untouched and stays unreachable, as it was. */

  /** Which rows the table shows. Active is the default — a deleted product is out of the way. */
  view: 'active' | 'deleted' | 'all' = 'active';
  /** The free-text box, kept separately because the filter has to carry both it and `view`. */
  textFilter = '';
  /** Rows mid-write, so a toggle cannot be fired twice before Firestore answers. */
  saving = new Set<string>();

  constructor(public dialog:MatDialog,private afs : Firestore, public guard: AuthguardService, public router: Router,
              private snack: MatSnackBar) {
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

    /* MatTableDataSource takes a single string filter, so both the text and the view are encoded
       into it. It also skips filtering entirely when `filter` is falsy — which is why the encoded
       value is never empty, even with no text typed. */
    this.dataSource.filterPredicate = (row: any, raw: string) => {
      const { text, view } = JSON.parse(raw) as { text: string; view: string };
      const deleted = row.isdelete === true;
      if (view === 'active' && deleted) return false;
      if (view === 'deleted' && !deleted) return false;
      if (!text) return true;
      // Same "match anything on the row" behaviour the default predicate gave.
      return Object.keys(row)
        .filter(k => k !== 'id')
        .map(k => `${row[k]}`)
        .join(' ')
        .toLowerCase()
        .includes(text);
    };
    this.applyFilters();
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
    this.textFilter = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.applyFilters();
  }

  setView(view: 'active' | 'deleted' | 'all') {
    if (!view || view === this.view) return;
    this.view = view;
    this.applyFilters();
  }

  /** The search box is uncontrolled (a template ref), so clearing it has to touch the element. */
  clearSearch(input: HTMLInputElement) {
    input.value = '';
    this.textFilter = '';
    this.applyFilters();
  }

  resetFilters(input: HTMLInputElement) {
    input.value = '';
    this.textFilter = '';
    this.view = 'active';
    this.applyFilters();
  }

  private applyFilters() {
    if (!this.dataSource) return;
    this.dataSource.filter = JSON.stringify({ text: this.textFilter, view: this.view });
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  /** Counts come off the full list, not the filtered view, so the tabs stay meaningful. */
  get activeCount(): number {
    return (this.listofproduct || []).filter((p: any) => p.isdelete !== true).length;
  }

  get deletedCount(): number {
    return (this.listofproduct || []).filter((p: any) => p.isdelete === true).length;
  }

  /**
   * Toggle on = deleted.
   *
   * The local row is updated FIRST, before the write is awaited. `[checked]` is a one-way binding,
   * so without this the next change-detection pass re-reads the old `row.isdelete` — which Firestore
   * has not updated yet — and snaps the toggle straight back to where it was. Writing the value
   * locally means the bound expression already agrees with what the user just did; the snapshot that
   * arrives a moment later simply confirms it. On failure the local value is put back.
   */
  async toggleDeleted(row: any, isdelete: boolean) {
    if (!row?.id || this.saving.has(row.id)) return;
    const previous = row.isdelete === true;
    if (previous === isdelete) return;              // nothing to do; also stops the Undo bouncing

    row.isdelete = isdelete;                        // optimistic — see above
    this.saving.add(row.id);
    this.applyFilters();                            // re-run the view filter against the new value

    try {
      await updateDoc(doc(this.afs, 'products', row.id), { isdelete });
      const ref = this.snack.open(
        `${row.product || 'Product'} ${isdelete ? 'marked deleted' : 'restored'}`,
        'Undo', { duration: 5000 });
      ref.onAction().subscribe(() => this.toggleDeleted(row, !isdelete));
    } catch (e) {
      console.error('products: isdelete', e);
      row.isdelete = previous;                      // put the toggle back where the user found it
      this.applyFilters();
      this.snack.open('Could not update this product — check your access', 'Close', { duration: 5000 });
    } finally {
      this.saving.delete(row.id);
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
