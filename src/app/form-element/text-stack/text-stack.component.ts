import { Component, OnInit, Input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import {CdkDragDrop, CdkDrag, CdkDropList, moveItemInArray, CdkDragPlaceholder, DragDropModule} from '@angular/cdk/drag-drop';
import { MatInputModule } from '@angular/material/input';



@Component({
  selector: 'app-text-stack',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    CdkDropList, 
    CdkDrag,
    CdkDragPlaceholder,
    DragDropModule,
    MatInputModule,
    
  ],
  templateUrl: './text-stack.component.html',
  styleUrl: './text-stack.component.css'
})
export class TextStackComponent {

  @Input()label:string;
  @Input()controlName:string;
  @Input()form:FormGroup;
  @Input()type:string;

  constructor(){}

  ngOnInit(): void {}

  drop(event: CdkDragDrop<string[]>) {
    if (this.type === 'reactive form') {

      const control = this.form.get(this.controlName);
      const items = control?.value || [];
      moveItemInArray(items, event.previousIndex, event.currentIndex);
      control?.setValue(items); // set value after rearranging
    }
  }


  onAddText(event:Event){
    let value = ((event.target as HTMLInputElement).value || "").trim()
    if(value){
      const control = this.form.get(this.controlName) as FormControl;
      const currentValues = control.value || []
      control.setValue([...currentValues,value]);
      (event.target as HTMLInputElement).value = "";
      control.markAsTouched()
    }
  }

  onRemoveText(index:number){
    const control = this.form.get(this.controlName) as FormControl;
    const currentValues = control.value || [];
    currentValues.splice(index, 1);
    control.setValue(currentValues);
    control.markAsTouched();  // Mark as touched to trigger validation
  }

}
