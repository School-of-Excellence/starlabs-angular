import { CommonModule } from '@angular/common';
import { Component, OnInit,Input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-text',
  imports: [
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    CommonModule
  ],
  templateUrl: './text.component.html',
  styleUrl: './text.component.css'
})
export class TextComponent {
  @Input()label:string;
  @Input()controlName:string;
  @Input()form:FormGroup;
  // @Input()type:string;
  // textvalue = null
  constructor(){ }

  ngOnInit(): void {}

}
