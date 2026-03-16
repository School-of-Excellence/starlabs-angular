import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule, formatDate } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-form-template-preview',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './form-template-preview.component.html',
  styleUrl: './form-template-preview.component.css'
})
export class FormTemplatePreviewComponent {
  previewData: any[] = [];

  constructor(public dialogRef: MatDialogRef<FormTemplatePreviewComponent>,@Inject(MAT_DIALOG_DATA) public data: any) {}

  ngOnInit(): void {
    this.preparePreviewData();
  }

  preparePreviewData(): void {
    const formArray = this.data.formData.formarray;
    const formValues = this.data.formValues;
    
    // Filter out fields with values to display
    this.previewData = formArray
      .filter(field => !['label', 'video', 'audio'].includes(field.type))
      .map((field, index) => ({
        fieldname: field.fieldname,
        type: field.type,
        value: formValues[`control${index}`] || null
      }))
      .filter(field => field.value !== null && field.value !== undefined && (field.type === 'Checkbox' ? field.value === true : field.value !== ''));
  }

  isSimpleValue(value: any): boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  isDateValue(value: any): boolean {
    return value instanceof Date;
  }

  isArrayOfStrings(value: any): boolean {
    return Array.isArray(value) && value.length > 0 && typeof value[0] === 'string';
  }

  isFormArray(value: any): boolean {
    return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object';
  }

  formatDate(date: Date): string {
    try {
      return formatDate(date, 'MMM dd, yyyy', 'en-US');
    } catch (error) {
      return 'Invalid Date';
    }
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
