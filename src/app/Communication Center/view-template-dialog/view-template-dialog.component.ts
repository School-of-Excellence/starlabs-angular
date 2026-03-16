import { Component, OnInit, Inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-view-template-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
  ],
  templateUrl: './view-template-dialog.component.html',
  styleUrls: ['./view-template-dialog.component.css']
})
export class ViewTemplateDialogComponent implements OnInit {

  templateHtml: SafeHtml | string = "";
  notificationimage;
  templateData = {};
  constructor(
    private firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<ViewTemplateDialogComponent>,
    private auth: AuthguardService,
    private sanitizer: DomSanitizer,
  ) {
    this.templateData = data;
    this.templateHtml = this.sanitizer.bypassSecurityTrustHtml(data.htmlbody);
  }

  ngOnInit(): void {
  }

  onSubmit() {
    this.dialogRef.close({
      type: this.templateData['type'],
      template : this.templateData,
      status: "approved"
    })
  }

  onDialogCancel() {
    this.dialogRef.close({
      type: this.templateData['type'],
      status: "rejected"
    })
  }

}
