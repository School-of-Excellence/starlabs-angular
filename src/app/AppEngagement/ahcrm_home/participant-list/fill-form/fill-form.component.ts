import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  Timestamp
} from '@angular/fire/firestore';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Interfaces
export interface FormField {
  fieldname: string;
  type: string;
  value?: any;
  options?: string[];
  required?: boolean;
  fielddescription?: string;
  fieldnotes?: string;
  array?: FormField[];
}

export interface FormByClient {
  docid: string;
  formname: string;
  profileid: string;
  date: any;
  formarray: FormField[];
}

@Component({
  selector: 'app-fill-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fill-form.component.html',
  styleUrls: ['./fill-form.component.css']
})
export class FillFormComponent implements OnInit, OnDestroy {
  @Input() formDocId: string = '';
  @Input() profileId: string = '';
  @Output() closeForm = new EventEmitter<void>();
  @Output() formSaved = new EventEmitter<void>();

  // State
  loading = true;
  saving = false;
  formData: FormByClient | null = null;
  formFields: FormField[] = [];
  originalFormFields: FormField[] = [];
  hasChanges = false;

  // Expanded sections for array fields
  expandedSections: Set<string> = new Set();

  // Validation
  validationErrors: Map<string, string> = new Map();

  private destroy$ = new Subject<void>();

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {
    if (this.formDocId) {
      this.loadFormData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadFormData(): Promise<void> {
    this.loading = true;

    try {
      const formRef = doc(this.firestore, 'formsByClient', this.formDocId);
      const formSnap = await getDoc(formRef);

      if (formSnap.exists()) {
        this.formData = {
          docid: formSnap.id,
          ...formSnap.data()
        } as FormByClient;

        // Deep clone the form array for editing
        this.formFields = JSON.parse(JSON.stringify(this.formData.formarray || []));
        this.originalFormFields = JSON.parse(JSON.stringify(this.formData.formarray || []));

        // Initialize values for fields that don't have them
        this.initializeFieldValues(this.formFields);
      }
    } catch (error) {
      console.error('Error loading form:', error);
    } finally {
      this.loading = false;
    }
  }

  private initializeFieldValues(fields: FormField[]): void {
    fields.forEach(field => {
      if (field.value === undefined || field.value === null) {
        switch (field.type?.toLowerCase()) {
          case 'checkbox':
          case 'toggle':
          case 'switch':
            field.value = false;
            break;
          case 'number':
          case 'slider':
            field.value = 0;
            break;
          case 'multiselect':
          case 'chips':
            field.value = [];
            break;
          case 'date':
          case 'datetime':
            field.value = null;
            break;
          default:
            field.value = '';
        }
      }

      // Initialize nested array fields
      if (field.array && field.array.length > 0) {
        this.initializeFieldValues(field.array);
      }
    });
  }

  // Field type detection
  getFieldType(field: FormField): string {
    const type = (field.type || 'text').toLowerCase();

    // Map common type variations
    const typeMap: { [key: string]: string } = {
      'string': 'text',
      'textfield': 'text',
      'input': 'text',
      'textarea': 'textarea',
      'longtext': 'textarea',
      'multiline': 'textarea',
      'number': 'number',
      'int': 'number',
      'integer': 'number',
      'float': 'number',
      'double': 'number',
      'decimal': 'number',
      'checkbox': 'checkbox',
      'bool': 'checkbox',
      'boolean': 'checkbox',
      'toggle': 'toggle',
      'switch': 'toggle',
      'dropdown': 'dropdown',
      'select': 'dropdown',
      'picker': 'dropdown',
      'radio': 'radio',
      'radiobutton': 'radio',
      'date': 'date',
      'datepicker': 'date',
      'datetime': 'datetime',
      'time': 'time',
      'timepicker': 'time',
      'multiselect': 'multiselect',
      'chips': 'chips',
      'tags': 'chips',
      'slider': 'slider',
      'range': 'slider',
      'rating': 'rating',
      'stars': 'rating',
      'image': 'image',
      'photo': 'image',
      'file': 'file',
      'upload': 'file',
      'signature': 'signature',
      'array': 'array',
      'group': 'array',
      'section': 'array'
    };

    return typeMap[type] || 'text';
  }

  // Value change handler
  onFieldChange(field: FormField, value: any): void {
    field.value = value;
    this.hasChanges = true;
    this.validateField(field);
  }

  // Toggle for array/section expansion
  toggleSection(fieldName: string): void {
    if (this.expandedSections.has(fieldName)) {
      this.expandedSections.delete(fieldName);
    } else {
      this.expandedSections.add(fieldName);
    }
  }

  isSectionExpanded(fieldName: string): boolean {
    return this.expandedSections.has(fieldName);
  }

  // Multi-select handling
  toggleMultiSelectOption(field: FormField, option: string): void {
    if (!Array.isArray(field.value)) {
      field.value = [];
    }

    const index = field.value.indexOf(option);
    if (index > -1) {
      field.value.splice(index, 1);
    } else {
      field.value.push(option);
    }

    this.hasChanges = true;
  }

  isOptionSelected(field: FormField, option: string): boolean {
    return Array.isArray(field.value) && field.value.includes(option);
  }

  // Validation
  validateField(field: FormField): boolean {
    this.validationErrors.delete(field.fieldname);

    if (field.required) {
      const value = field.value;
      const type = this.getFieldType(field);

      let isEmpty = false;

      switch (type) {
        case 'checkbox':
        case 'toggle':
          // Checkbox/toggle can be false, so no validation
          break;
        case 'multiselect':
        case 'chips':
          isEmpty = !Array.isArray(value) || value.length === 0;
          break;
        case 'number':
        case 'slider':
          isEmpty = value === null || value === undefined || value === '';
          break;
        default:
          isEmpty = !value || (typeof value === 'string' && value.trim() === '');
      }

      if (isEmpty) {
        this.validationErrors.set(field.fieldname, 'This field is required');
        return false;
      }
    }

    return true;
  }

  validateAllFields(): boolean {
    let isValid = true;

    const validateRecursive = (fields: FormField[]): void => {
      fields.forEach(field => {
        if (!this.validateField(field)) {
          isValid = false;
        }

        if (field.array && field.array.length > 0) {
          validateRecursive(field.array);
        }
      });
    };

    validateRecursive(this.formFields);
    return isValid;
  }

  getValidationError(fieldName: string): string | null {
    return this.validationErrors.get(fieldName) || null;
  }

  // Save form
  async saveForm(): Promise<void> {
    if (!this.validateAllFields()) {
      return;
    }

    this.saving = true;

    try {
      const formRef = doc(this.firestore, 'formsByClient', this.formDocId);

      await updateDoc(formRef, {
        formarray: this.formFields,
        date: new Date(),
        lastModified: new Date()
      });

      this.hasChanges = false;
      this.originalFormFields = JSON.parse(JSON.stringify(this.formFields));
      this.formSaved.emit();
    } catch (error) {
      console.error('Error saving form:', error);
    } finally {
      this.saving = false;
    }
  }

  // Reset form to original values
  resetForm(): void {
    this.formFields = JSON.parse(JSON.stringify(this.originalFormFields));
    this.hasChanges = false;
    this.validationErrors.clear();
  }

  // Close form
  onClose(): void {
    if (this.hasChanges) {
      // Could show confirmation dialog here
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        this.closeForm.emit();
      }
    } else {
      this.closeForm.emit();
    }
  }

  // Date formatting
  formatDateForInput(date: any): string {
    if (!date) return '';

    let d: Date;
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return '';
    }

    return d.toISOString().split('T')[0];
  }

  formatDateTimeForInput(date: any): string {
    if (!date) return '';

    let d: Date;
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return '';
    }

    return d.toISOString().slice(0, 16);
  }

  // Rating helper
  getRatingArray(max: number = 5): number[] {
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  setRating(field: FormField, rating: number): void {
    field.value = rating;
    this.hasChanges = true;
  }

  // Get completion percentage
  getCompletionPercentage(): number {
    let total = 0;
    let completed = 0;

    const countFields = (fields: FormField[]): void => {
      fields.forEach(field => {
        const type = this.getFieldType(field);

        // Skip array/section containers
        if (type !== 'array') {
          total++;

          const value = field.value;
          let hasValue = false;

          switch (type) {
            case 'checkbox':
            case 'toggle':
              hasValue = true; // Always considered filled
              break;
            case 'multiselect':
            case 'chips':
              hasValue = Array.isArray(value) && value.length > 0;
              break;
            case 'number':
            case 'slider':
            case 'rating':
              hasValue = value !== null && value !== undefined && value !== 0;
              break;
            default:
              hasValue = value !== null && value !== undefined && value !== '';
          }

          if (hasValue) {
            completed++;
          }
        }

        if (field.array && field.array.length > 0) {
          countFields(field.array);
        }
      });
    };

    countFields(this.formFields);

    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  // Track by function
  trackByFieldName(index: number, field: FormField): string {
    return field.fieldname + index;
  }
}