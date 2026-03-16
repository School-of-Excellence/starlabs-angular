import { CommonModule } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import { collection, doc, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { AuthguardService } from '../../../authguard.service';
import * as   XLSX from 'xlsx';

interface ParticipantProduct {
  profileId: string;
  participantName: string;
  productId: string;
  productName: string;
  consumedCount: number;
  unconsumedCount: number;
}

interface GroupedParticipant {
  profileId: string;
  products: {
    [key: string]: {
      productId: string;
      consumedCount: number;
      consumedDocuments: any[];
      unConsumedCount: number;
      unConsumedDocuments: any[];
    }
  };
}

@Component({
  selector: 'app-export-with-filters',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    FormsModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatDialogModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    MatInputModule,
    NgxMatSelectSearchModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './export-with-filters.component.html',
  styleUrl: './export-with-filters.component.css'
})
export class ExportWithFiltersComponent {
  // Filter selection
  selectedFilter: string = '';
  isFiltered: boolean = false;

  // Filter values
  filters: any = {
    consumedproducts: [],
    consumedcount: null,
    unconsumedproducts: [],
    unconsumedcount: null,
  };

  resetfilters: any = {
    consumedproducts: [],
    consumedcount: null,
    unconsumedproducts: [],
    unconsumedcount: null,
  };

  filterproductlist: string = '';
  filterunconsumedproductlist: string = '';

  isLoading: boolean = false;
  mapProfile = {};
  productlist: any[] = []
  mapProductName: any = {};
  mapProfileData = {};

  // Table data
  displayedColumns: string[] = ['name'];
  filteredData: any[] = [];
  allData: any[] = [];

  filterForm!: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<ExportWithFiltersComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private fb: FormBuilder,
    private guard: AuthguardService
  ) {
    this.guard.getProfileMap().then(data => {
      this.mapProfile = data.map;
      this.mapProfileData = data.docdata
    });
  }

  async ngOnInit() {
    const [ productsSnap ] = await Promise.all([
      getDocs(collection(this.firestore, "products"))
    ]);

    this.productlist = productsSnap.docs.map(e => {
      const element = e.data();
      this.mapProductName[element['id']] = element['product'];
      return element;
    });

    this.filterForm = this.fb.group({
      consumedProducts: this.fb.array([]),
      unconsumedProducts: this.fb.array([])
    });

    // this.addConsumedProduct();
    // this.addUnconsumedProduct();
  }

  get consumedProducts(): FormArray {
    return this.filterForm.get('consumedProducts') as FormArray;
  }

  createConsumedProductGroup(): FormGroup {
    return this.fb.group({
      productId: ['',],
      count: [0, Validators.required]
    });
  }

  addConsumedProduct(): void {
    this.consumedProducts.push(this.createConsumedProductGroup());
  }

  removeConsumedProduct(index: number): void {
    if (this.consumedProducts.length > 1) {
      this.consumedProducts.removeAt(index);
    }
  }

  // Unconsumed Products FormArray
  get unconsumedProducts(): FormArray {
    return this.filterForm.get('unconsumedProducts') as FormArray;
  }

  createUnconsumedProductGroup(): FormGroup {
    return this.fb.group({
      productId: ['',],
      count: [0, Validators.required]
    });
  }

  addUnconsumedProduct(): void {
    this.unconsumedProducts.push(this.createUnconsumedProductGroup());
  }

  removeUnconsumedProduct(index: number): void {
    if (this.unconsumedProducts.length > 1) {
      this.unconsumedProducts.removeAt(index);
    }
  }

  onfilterproducts() {
    if (this.productlist != null) {
      const filterValue = (this.filterproductlist != null && this.filterproductlist != '') ? this.filterproductlist.trim().toLowerCase() : ''
      return this.productlist.filter(e => e.product.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  onfilterunconsumedproducts() {
    if (this.productlist != null) {
      const filterValue = (this.filterunconsumedproductlist != null && this.filterunconsumedproductlist != '') ? this.filterunconsumedproductlist.trim().toLowerCase() : ''
      return this.productlist.filter(e => e.product.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  async applyFilter(): Promise<void> {

    this.displayedColumns = ['name'];
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.isFiltered = true;

    try {
      // Filter out empty entries (where productId is not selected)
      const consumedData = this.consumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null);
      const unconsumedData = this.unconsumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null);

      // Check if at least one filter is provided
      if (consumedData.length === 0 && unconsumedData.length === 0) {
        alert('Please select at least one product filter');
        this.isLoading = false;
        return;
      }

      await this.fetchAndFilterByDocumentCount(consumedData, unconsumedData);

    } catch (error) {
      console.error('Error applying filter:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async fetchAndFilterByDocumentCount(consumed: any[], unconsumed: any[]): Promise<void> {
    const participantsProductRef = collection(this.firestore, 'participantsproduct');

    // Step 1: Collect all product IDs from both consumed and unconsumed filters
    const productIds = new Set<string>();
    consumed.forEach(c => productIds.add(c.productId));
    unconsumed.forEach(u => productIds.add(u.productId));

    if (productIds.size === 0) {
      this.filteredData = [];
      return;
    }

    const allDocs = [];

    // Fetch documents for each product
    for (const productId of productIds) {
      const q = query(participantsProductRef, where('productref', '==', doc(this.firestore, "products", productId)));
      const querySnapshot = await getDocs(q);

      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if([null, 'completed'].includes(data['status'])) {
          allDocs.push({
            profileId: data['profileid'] || 'N/A',
            status: data['status'],
            productId: data['productref'].id || 'N/A'
          });
        }
      });
    }

    // Step 2: Group by participant and product, count documents
    const grouped = new Map<string, GroupedParticipant>();

    allDocs.forEach(doc => {
      const key = doc.profileId;

      if (!grouped.has(key)) {
        grouped.set(key, {
          profileId: doc.profileId,
          products: {}
        });
      }

      const participant = grouped.get(key)!;

      if (!participant.products[doc.productId]) {
        participant.products[doc.productId] = {
          productId: doc.productId,
          consumedCount: 0,
          consumedDocuments: [],
          unConsumedCount: 0,
          unConsumedDocuments: [],
        };
      }

      if(doc['status'] == 'completed') {
        participant.products[doc.productId].consumedCount++;
        participant.products[doc.productId].consumedDocuments.push(doc);
      } else if(doc['status'] == null) {
        participant.products[doc.productId].unConsumedCount++;
        participant.products[doc.productId].unConsumedDocuments.push(doc);
      }
    });

    // Step 3: Filter based on document count
    const filteredParticipants: any[] = [];

    for (const [participantId, participant] of grouped) {
      // Default to true if no filters provided for that type
      let matchesConsumed = consumed.length === 0; // true if no consumed filters
      let matchesUnconsumed = unconsumed.length === 0; // true if no unconsumed filters

      // Check consumed filters (only if consumed filters exist)
      if (consumed.length > 0) {
        matchesConsumed = consumed.every(filter => {
          const productData = participant.products[filter.productId];
          if (!productData) return false;

          if (filter.count === 0) {
            if(productData.consumedCount > 0) {
              return true;
            } else {
              return false;
            }
          } 
          return productData.consumedCount == filter.count;
        });
      }

      // Check unconsumed filters (only if unconsumed filters exist)
      if (unconsumed.length > 0) {
        matchesUnconsumed = unconsumed.every(filter => {
          const productData = participant.products[filter.productId];
          if (!productData) return false;

          // Count = 0 means get all with that product
          if (filter.count === 0) {
            if(productData.unConsumedCount > 0) {
              return true;
            } else {
              return false;
            }
          } 

          return productData.unConsumedCount == filter.count;
        });
      }

      if (matchesConsumed && matchesUnconsumed) {
        // console.log("Name", participant);
        filteredParticipants.push(participant)
      }
    }

    if(consumed.length > 0) {
      this.displayedColumns.push('consumed')
    }

    if(unconsumed.length > 0) {
      this.displayedColumns.push('unconsumed')
    }

    this.filteredData = filteredParticipants;
  }

  getConsumedCount(products: any): number {
    if (!products) return 0;
    return Object.values(products).filter((p: any) => p.consumedCount > 0).length;
  }

  getUnconsumedCount(products: any): number {
    if (!products) return 0;
    return Object.values(products).filter((p: any) => p.unconsumedCount > 0).length;
  }

  filterConsumption() {
    
  }

  selectFilter(filterType: string): void {
    this.filters = this.resetfilters;
    this.selectedFilter = filterType;
    this.isFiltered = false;
  }


  filterByDateRange(): void {
    if (!this.filters.startDate || !this.filters.endDate) {
      this.filteredData = [...this.allData];
      return;
    }

    this.filteredData = this.allData.filter(item => {
      const itemDate = new Date(item.date);
      const startDate = new Date(this.filters.startDate);
      const endDate = new Date(this.filters.endDate);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }

  filterByStatus(): void {
    if (this.filters.status.length === 0) {
      this.filteredData = [...this.allData];
      return;
    }
    this.filteredData = this.allData.filter(item =>
      this.filters.status.includes(item.status)
    );
  }

  filterByCategory(): void {
    if (!this.filters.category) {
      this.filteredData = [...this.allData];
      return;
    }
    this.filteredData = this.allData.filter(item =>
      item.category === this.filters.category
    );
  }

  filterByCustom(): void {
    if (!this.filters.searchTerm || !this.filters.searchField) {
      this.filteredData = [...this.allData];
      return;
    }
    const searchTerm = this.filters.searchTerm.toLowerCase();
    const field = this.filters.searchField;

    this.filteredData = this.allData.filter(item =>
      item[field]?.toString().toLowerCase().includes(searchTerm)
    );
  }

  exportData(): void {
    
  }

  // Optional: CSV export helper method
  downloadCSV(data: any[]): void {
    const csv = this.convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export_${new Date().getTime()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [];

    // Add header row
    csvRows.push(headers.join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return `"${value}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  getProducts(products : any = {}){
    const productsId = Object.keys(products);
    const consumedProductsName = [];
    const unConsumedProductsName = [];

    for(let productId of productsId){
      const p = products[productId];
      if(p.consumedCount > 0){
        consumedProductsName.push(this.mapProductName[productId]);
      }
      if(p.unConsumedCount > 0){
        unConsumedProductsName.push(this.mapProductName[productId]);
      }
    }

    return [consumedProductsName , unConsumedProductsName];
  }

  exportToExcel() {
      const data = this.filteredData;
      const sheetData: any[][] = [];
  
      // Header
      sheetData.push([
        'S.No',
        'Name',
        'Email',
        'Consumed',
        'Unconsumed'
      ]);
  
      data.forEach((item: any , index) => {
        const [consumed , unconsumed] = this.getProducts(item.products) 
          sheetData.push([
            index + 1,
            this.mapProfile[item.profileId] || '',
            this.mapProfileData[item.profileId]?.email || '',
            consumed.join(','),
            unconsumed.join(',')
          ]);
      });
  
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      // // worksheet['!merges'] = merges;
  
      // // Optional column widths
      worksheet['!cols'] = [
        { wch: 8 },
        { wch: 18 },
        { wch: 30 },
        { wch: 50 },
        { wch: 50 },
      ];
  
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Participant List');
  
      XLSX.writeFile(
        workbook,
        `participant_list_${new Date().toISOString().split('T')[0]}.xlsx`
      );
    }

}
