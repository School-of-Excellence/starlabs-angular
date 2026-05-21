import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule,Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-stage-incomplete-confirmation',
  imports: [
    MatRadioModule,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule
],
  templateUrl: './stage-incomplete-confirmation.component.html',
  styleUrl: './stage-incomplete-confirmation.component.css'
})
export class StageIncompleteConfirmationComponent {

  currentStage = null
  participantName = null
  reasonControl = new FormControl('', Validators.required);
  result = {
    reason: "",
    preassign: true
  }

  constructor(@Inject(MAT_DIALOG_DATA) public dialogdata, public dialogref: MatDialogRef<any>){
    this.currentStage = this.dialogdata["currentstage"]
    this.participantName = this.dialogdata["participantname"]
  }

  onsubmit(){
    this.reasonControl.markAsTouched();
    if (this.reasonControl.invalid) return;
    this.result.reason = this.reasonControl.value;
    this.dialogref.close(this.result)
  }

  cancel(){
    this.dialogref.close(null)
  }
}
