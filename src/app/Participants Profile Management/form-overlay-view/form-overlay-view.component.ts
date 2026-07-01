import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { doc, getDoc, getFirestore } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-form-overlay-view',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './form-overlay-view.component.html',
  styleUrl: './form-overlay-view.component.css'
})

export class FormOverlayViewComponent {
  firestore = getFirestore();
  firestoreForms = getFirestore('firestore-forms');

  showOverlay = false;
  overlayMode: 'individual' | 'merged' = 'individual';
  overlayTitle = '';
  overlayLoading = false;
  overlayFormData: any = null;
  currentOverlayRow: any = null;

  mapProfile: any = {};
  mapProfileNew: any = {};
  mapQueue: any = {};
  mapWorkshop: any = {};
  mapWorkshopNew: any = {};

  async viewFormOverlay(row: any) {
    console.log("form", row);
    this.currentOverlayRow = row;
    this.overlayMode = 'individual';
    this.overlayTitle = row.formname || 'Form View';
    this.overlayLoading = true;
    this.overlayFormData = null;
    this.showOverlay = true;

    try {
      const [formTemplateDoc, submittedFormDoc] = await Promise.all([
        getDoc(doc(this.firestore, 'delivery forms', row.formid)),
        getDoc(doc(this.firestoreForms, 'formsByClient', row.docid))
      ]);

      if (!formTemplateDoc.exists() || !submittedFormDoc.exists()) {
        this.overlayLoading = false;
        return;
      }

      this.overlayFormData = this.buildFormDisplayData(row, formTemplateDoc.data(), submittedFormDoc.data());
    } catch (err) {
      console.error('Error loading form overlay:', err);
    }

    this.overlayLoading = false;
  }

  private buildFormDisplayData(row: any, formTemplate: any, submittedFormData: any): any {
    const formValues: any = {};
    let controlIndex = 0;
    if (submittedFormData['formarray']) {
      for (const field of submittedFormData['formarray']) {
        if (['label', 'video', 'audio'].includes(field.type)) continue;
        formValues[`control${controlIndex}`] = field.value;
        controlIndex++;
      }
    }

    controlIndex = 0;
    let questionNumber = 0;
    const fields: any[] = [];

    for (const field of formTemplate['formarray']) {
      if (['video', 'audio'].includes(field.type)) continue;

      if (field.type === 'label') {
        fields.push({ type: 'label', fieldname: field.fieldname, fielddescription: field.fielddescription || null });
        continue;
      }

      const fieldValue = formValues[`control${controlIndex}`];
      controlIndex++;
      questionNumber++;

      fields.push({
        type: 'field',
        number: questionNumber,
        fieldname: field.fieldname,
        fielddescription: field.fielddescription || null,
        fieldnotes: field.fieldnotes || null,
        required: field.required || false,
        fieldType: field.type,
        value: this.formatFieldValueForOverlay(field, fieldValue),
        isEmpty: !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
      });
    }

    const participantName = this.mapProfile[row.profileid] || this.mapProfileNew[row.profileid] || 'Unknown';
    const queueName = row.queueref ? this.mapQueue[row.queueref.id] : 'N/A';
    const workshopName = row.workshopref ? (this.mapWorkshop[row.workshopref.id] || this.mapWorkshopNew[row.workshopref.id]) : 'N/A';
    const submittedDate = row.date ? new Date(row.date.toDate()).toLocaleDateString() : 'N/A';

    return {
      participantName,
      formTitle: formTemplate['formname'] || 'Form',
      formDescription: formTemplate['formdescription'] || null,
      queue: queueName,
      workshop: workshopName,
      date: submittedDate,
      fields
    };
  }

  private formatFieldValueForOverlay(field: any, value: any): string {
    if (!value && value !== 0) return 'Not answered';

    switch (field.type) {
      case 'date':
        if (value?.toDate) return value.toDate().toLocaleDateString();
        try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
      case 'Checkbox':
        return value ? 'Yes' : 'No';
      case 'MultiSelect':
      case 'multicheckbox':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'slider':
        let result = String(value);
        if (field.options?.length > 0) result += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`;
        return result;
      case 'array':
        if (Array.isArray(value) && value.length > 0) {
          return value.map((item: any, idx: number) => {
            if (typeof item === 'object' && item !== null) {
              if (field.array && Array.isArray(field.array)) {
                const parts = field.array.map((af: any) => {
                  const v = item[af.fieldname];
                  return v != null && v !== '' ? `${af.fieldname}: ${v}` : null;
                }).filter(Boolean);
                return parts.join('\n');
              }
              const parts = Object.entries(item)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `${k}: ${v}`);
              return parts.join('\n');
            }
            return String(item);
          }).join('\n');
        }
        return 'No items';
      default:
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') {
          try {
            return Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ');
          } catch { return JSON.stringify(value); }
        }
        return String(value);
    }
  }

  closeOverlay() {
    this.showOverlay = false;
    this.overlayFormData = null;
    this.currentOverlayRow = null;
  }
}