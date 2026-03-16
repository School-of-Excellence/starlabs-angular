import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-alertbox',
  imports: [],
  templateUrl: './alertbox.component.html',
  styleUrl: './alertbox.component.css'
})
export class AlertboxComponent {

  constructor(public dialogRef: MatDialogRef<any>,) { }

  ngOnInit(): void {
  }

  close(){
    this.dialogRef.close()
  }


}
