import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-auto-complete-with-chip',
  imports: [
    MatFormFieldModule,
    MatChipsModule,
    MatIconModule,
    MatSelectModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    CommonModule,
    MatInputModule,
    FormsModule, 
  ],
  templateUrl: './auto-complete-with-chip.component.html',
  styleUrl: './auto-complete-with-chip.component.css'
})
export class AutoCompleteWithChipComponent implements OnInit, OnChanges {
  @Input() label: string;
  @Input() form: FormGroup;
  @Input() controlName: string;
  @Input() data: any[];
  @Input() datatype: string;
  @Input() displayname: string;
  @Input() valuetype: string;
  @Input() valuelabel: string;
  @Input() multiple: boolean;

  mapData = {};
  filteredData = [];
  searchText = '';

  constructor() {}

  ngOnInit(): void {}

  ngOnChanges() {
    this.buildMapData();
    this.filteredData = [...this.data];
  }

  private buildMapData() {
    if (this.datatype !== "arrayofstring" && this.data) {
      this.mapData = {};
      for (let i = 0; i < this.data.length; i++) {
        const element = this.data[i];
        if (this.valuetype === 'ref') {
          this.mapData[element[this.valuelabel]?.id] = element[this.displayname];
        }
        if (this.valuetype === 'arrayofid') {
          this.mapData[element[this.valuelabel]] = element[this.displayname];
        }
      }
    }
  }

  hasSelectedValues(): boolean {
    const control = this.form.get(this.controlName);
    const value = control?.value;
    
    if (this.multiple) {
      return value && Array.isArray(value) && value.length > 0;
    } else {
      return value != null && value !== '';
    }
  }

  getDisplayItems(): any[] {
    const control = this.form.get(this.controlName);
    const value = control?.value;
    
    if (this.multiple) {
      return value || [];
    } else {
      return value != null ? [value] : [];
    }
  }

  getDisplayText(item: any): string {
    if (this.datatype === 'arrayofstring') {
      return item;
    } else {
      if (this.valuetype === 'ref') {
        return this.mapData[item?.id] || item;
      } else if (this.valuetype === 'arrayofid') {
        return this.mapData[item] || item;
      } else {
        return item;
      }
    }
  }

  getOptionDisplayText(option: any): string {
    return this.datatype === 'arrayofstring' ? option : option[this.displayname];
  }

  onTextSearch(event: Event) {
    const textvalue = (event.target as HTMLInputElement).value.trim();
    const filtervalue = textvalue ? textvalue.toLowerCase() : "";
    
    this.filteredData = this.data.filter((e: any) => {
      const searchIn = this.datatype === "arrayofstring" ? e : e[this.displayname];
      return searchIn.toLowerCase().includes(filtervalue);
    });
  }

  onAddFromChipList(event: MatAutocompleteSelectedEvent) {
    const control = this.form.get(this.controlName) as FormControl;
    let currentvalue = control.value;
    const selectedValue = this.datatype === 'arrayofstring' 
      ? event.option.value 
      : event.option.value[this.valuelabel];

    if (this.multiple) {
      if (!currentvalue) currentvalue = [];
      // Avoid duplicates
      if (!this.isDuplicate(selectedValue, currentvalue)) {
        currentvalue.push(selectedValue);
      }
    } else {
      currentvalue = selectedValue;
    }
    
    control.setValue(currentvalue);
    this.searchText = ''; // Clear search text
  }

  private isDuplicate(newValue: any, currentValues: any[]): boolean {
    if (this.datatype === 'arrayofstring') {
      return currentValues.includes(newValue);
    } else {
      return currentValues.some(item => {
        if (this.valuetype === 'ref') {
          return item?.id === newValue?.id;
        } else {
          return item === newValue;
        }
      });
    }
  }

  onRemoveItem(index: number) {
    const control = this.form.get(this.controlName) as FormControl;
    
    if (this.multiple) {
      const currentvalue = [...(control.value || [])];
      currentvalue.splice(index, 1);
      control.setValue(currentvalue);
    } else {
      control.setValue(null);
    }
  }

  onInputFocus() {
    const control = this.form.get(this.controlName) as FormControl;
    control?.markAsTouched();
    control?.markAsDirty();
  }

  // Display function for autocomplete input
  displayWith = (option: any): string => {
    if (!option) return '';
    return this.getOptionDisplayText(option);
  }
}
  


