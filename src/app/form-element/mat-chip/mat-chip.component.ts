import { Component, Input } from '@angular/core';
import {MatChipInputEvent, MatChipsModule} from '@angular/material/chips';
import {COMMA, ENTER} from '@angular/cdk/keycodes'; 
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-mat-chip',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    CommonModule
  ],
  templateUrl: './mat-chip.component.html',
  styleUrl: './mat-chip.component.css'
})
export class MatChipComponent {

  @Input()label:string
  @Input()form:FormGroup
  @Input()valuetype:string
  @Input()controlName:string

  selectable = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  constructor() { }

  ngOnInit(): void {
  }

  add(event: MatChipInputEvent) {
    const input = event.input;
    const value = event.value.trim();
  
    if (value) {
      const control = this.form.get(this.controlName) as FormControl;
      const currentValue = control.value || [];
      currentValue.push(value);
      control.setValue(currentValue);
    }
  
    // Clear the input value
    if (input) {
      input.value = '';
    }
  }
  

  remove(index:number): void {
    const control = this.form.get(this.controlName) as FormControl
    const currentValue = control.value
    currentValue.splice(index,1)
    control.setValue(currentValue)
  }


}
