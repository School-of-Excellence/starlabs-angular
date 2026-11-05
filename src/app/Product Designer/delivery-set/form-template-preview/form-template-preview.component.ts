import { Component, OnInit, Inject, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule, formatDate } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormGroup, FormBuilder, Validators, FormControl, FormArray, ReactiveFormsModule  , FormsModule} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { timeToString } from '../../../shared/time-value';
import { sliderLabel } from '../../../shared/slider-value';

@Component({
  selector: 'app-form-template-preview',
  imports: [
    CommonModule,
    MatIconModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './form-template-preview.component.html',
  styleUrl: './form-template-preview.component.css'
})
export class FormTemplatePreviewComponent {

  previewData: any[] = [];
  reviewNotes: string = '';
  notesForm: any;
  reviewAccess: boolean;
  participantAssignmentId: string;
  loggedInProfileId: string;
  profileId: string;
  viewOnly: boolean = false;

  constructor(public dialogRef: MatDialogRef<FormTemplatePreviewComponent>,@Inject(MAT_DIALOG_DATA) public data: any, private fb: FormBuilder,) {

    this.reviewAccess = data.reviewaccess;
    this.participantAssignmentId = data.participantassignmentid;
    this.loggedInProfileId = this.data.loginid;
    this.profileId = this.data.profileid;
    this.viewOnly = data.viewOnly || false;

    console.log(this.data);

    console.log(this.loggedInProfileId);
    console.log(this.profileId);
  }

  ngOnInit(): void {
    this.preparePreviewData();
    this.initForm()
  }

  initForm() {
    this.notesForm = this.fb.group({
      notes: this.fb.array([
        this.createNoteControl()
      ])
    });
  }

  get notesArray() {
    return this.notesForm.get('notes') as FormArray;
  }

  createNoteControl() {
    return this.fb.control('', Validators.required);
  }

  addNote() {
    this.notesArray.push(this.createNoteControl());
  }

  removeNote(index: number) {
    this.notesArray.removeAt(index);
  }

  preparePreviewData(): void {
    const formArray = this.data.formData.formarray;
    const formValues = this.data.formValues;

    // Filter out fields with values to display
    this.previewData = formArray
      .filter(field => !['label', 'video', 'audio'].includes(field.type))
      .map((field) => ({
        fieldname: field.fieldname,
        type: field.type,
        array: field.array || null,
        // a time control hands back a Date, and the stored answer is "HH:mm": show the time either way.
        // a slider control hands back the OPTION INDEX, and the fill screen shows the option, so resolve it
        // here too — otherwise the preview reads one apart from the form it is previewing.
        value: (field.type === 'time'
          ? timeToString(formValues[field.formcontrol])
          : field.type === 'slider'
          ? sliderLabel(field.options, formValues[field.formcontrol])
          : formValues[field.formcontrol]) || null,
        // the follow-up slider answers for a flipping question, which this preview never showed
        flipping: this.flippingLines(field)
      }))
      .filter(field => field.value !== null && field.value !== undefined && (field.type === 'Checkbox' ? field.value === true : field.value !== ''));
  }

  /** A flipping question's { option: value } answers, as "option: value" lines, plus its heading and the two
   *  end labels. The number is shown as the fill screen shows it, not resolved through `options`. */
  flippingLines(field: any): { title: string, range: string, lines: string[] } | null {
    const answers = field.flippingquestion?.value;
    if (field.flipping !== true || !answers) return null;
    const chosen = Object.keys(answers);
    if (chosen.length === 0) return null;
    const options = field.flippingquestion?.options;
    return {
      title: field.flippingquestion?.fieldname || 'Follow-up',
      range: options?.length ? `${options[0]} – ${options[options.length - 1]}` : '',
      lines: chosen.map(option => `${option}: ${sliderLabel(options, answers[option])}`)
    };
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

  onConfirm(status): void {
    let data = {
      status: status,
      reviewnotes: this.notesArray.value,
      confirmed: true,
    }
    this.dialogRef.close(data);
  }
}
