import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, setDoc, where } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-validate-template',
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: './validate-template.component.html',
  styleUrls: ['./validate-template.component.css']
})
export class ValidateTemplateComponent implements OnInit {

  // Object declarations
  templateData = {};
  mapProfile = {};

  notificationimage;

  // Boolean declarations
  loading: boolean = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<ValidateTemplateComponent>,
    private firestore: Firestore,
    private sanitizer: DomSanitizer,
  ) {
    this.mapProfile = data['mapprofile'];

    getDocs(query(collection(this.firestore, 'email templates'), where("templatealias", "==", this.data.data['templateid']))).then((template) => {
      if (template.docs.length != 0) {
        this.templateData = template.docs[0].data();
      } else {
        console.log("No Template Found");
      }
      this.loading = false;
    });;
  }

  ngOnInit(): void {
  }

  sanitizeHTML(html) {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  onSubmit() {
    if (confirm("Are you sure want to validate")) {
      this.data.data['status'] = 'validated';
      setDoc(doc(collection(this.firestore, 'email archive'), this.data.data['docid']),this.data.data).then(() => {
        console.log("document submitted");
        this.dialogRef.close();
      }).catch(err => {
        console.log(err);
      })
    }
  }

}
