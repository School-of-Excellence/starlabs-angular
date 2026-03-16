import { CommonModule } from '@angular/common';
import { Component, OnInit, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {MatDatepickerModule} from '@angular/material/datepicker';

@Component({
  selector: 'app-mat-datepicker',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    CommonModule,
    MatDatepickerModule
  ],
  templateUrl: './mat-datepicker.component.html',
  styleUrl: './mat-datepicker.component.css'
})
export class MatDatepickerComponent {


  @Input() label: string;
  @Input() controlName: string;
  @Input() form: FormGroup;

}
