import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-people-involved',
  imports: [
    ReactiveFormsModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  templateUrl: './people-involved.component.html',
  styleUrl: './people-involved.component.css'
})
export class PeopleInvolvedComponent {
  specialist:FormGroup

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public option: any,
    public dialogref: MatDialogRef<any>
  ) {
    console.log(option);
    
    this.specialist = this.formbuilder.group({
      person: [, {validators: option.type == "general" ? [] : [Validators.required], updateOn: "change"}],
      mentor: [[], {validators: [], updateOn: "change"}],
      shadow: [[], {validators: [], updateOn: "change"}],
    })
    console.log(this.specialist, 'this.specialist');
    
    if(!option["multiperson"] && option.personoption.length == 1){
      this.specialist.patchValue({
        person: option.personoption[0].value
      })
    }
  }

  ngOnInit(): void {
  }

  submit(value){
    console.log(value,'value');
    
    if(value == null){
      this.dialogref.close(null)
    }
    else{
      if(this.specialist.valid){
        this.dialogref.close(value)
      }
    }
  }

}
