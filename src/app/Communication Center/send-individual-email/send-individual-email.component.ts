import { HttpClient } from '@angular/common/http';
import { Component, Inject, Input, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDoc, query, setDoc, where } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: "app-send-individual-email",
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatSelectModule,
  ],
  templateUrl: "./send-individual-email.component.html",
  styleUrls: ["./send-individual-email.component.css"],
})
export class SendIndividualEmailComponent implements OnInit {

  @ViewChild('editor', { static: true }) editorElement: any;

  // Array declarations
  senderEmailID = [];
  templateArray = [];

  // String declarations
  previewMode: string = 'web';
  buttonName: String = "";
  buttonSize: String = "";
  buttonAlign: string = 'center';
  buttonLink: string = "";

  // Null declarations
  selectedImage: HTMLElement | null = null;
  sanitizedHtmlContent: SafeHtml | undefined;

  // Object declarations
  mapProfileUid = {};

  // Boolean declarations
  hideAddButton: boolean = true;

  //Number Declarations
  selectedImageWidth: number = 100;
  selectedImageHeight: number = 100;

  // editorConfig: AngularEditorConfig = {
  //   editable: true,
  //   spellcheck: true,
  //   height: '450px',
  //   minHeight: '0',
  //   maxHeight: 'auto',
  //   width: 'auto',
  //   minWidth: '0',
  //   translate: 'yes',
  //   enableToolbar: true,
  //   showToolbar: true,
  //   placeholder: 'Enter text here...',
  //   defaultParagraphSeparator: '',
  //   defaultFontSize: '16',
  //   defaultFontName: '',
  //   toolbarHiddenButtons: [
  //   ],
  //   customClasses: [
  //     {
  //       name: 'quote',
  //       class: 'quote',
  //     },
  //     {
  //       name: 'redText',
  //       class: 'redText'
  //     },
  //     {
  //       name: 'titleText',
  //       class: 'titleText',
  //       tag: 'h1',
  //     },
  //   ],
  //   sanitize: false,
  //   toolbarPosition: 'top',
  //   outline: false,
  // };

  emailform: FormGroup;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<SendIndividualEmailComponent>,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private formbuilder: FormBuilder,
    private sanitizer: DomSanitizer,
    private authguard: AuthguardService,
    private http: HttpClient
  ) {
    this.authguard.getProfileMap().then((data) => {
      (this.mapProfileUid = data.mapUserId)
      this.emailform = this.formbuilder.group({
        from: ["", Validators.required],
        to: ["", Validators.required],
        subject: ["", Validators.required],
        htmlbody: ["", Validators.required],
        notes: ["", Validators.required],
        template: ["",]
      });
    });
  }

  ngOnInit(): void {
    // API Call for Chat Config Collection
    // this.firestore.collection("chat config").doc("0jqtiq3sxtbLVcEGMDhW").get().toPromise()
    getDoc(doc(collection(this.firestore, 'chat config'), '0jqtiq3sxtbLVcEGMDhW')).then((config) => {
      if (config.exists) {
        this.senderEmailID = config.data()["sendermailid"];
      } else {
        this.openSnackBar("No Config data found", "OK");
      }
    });

    // API Call for Email Templates Collection
    collectionData(query(collection(this.firestore, 'email templates'), where("postmarkstatus", "==", "approved"), where("templatevalidated", "==", true), where("templatestatus", "!=", "rejected"), where("type", "==", "email"))).subscribe((templates) => {
      if (templates.length != 0) {
        this.templateArray = templates;
      } else {
        console.log("Templates Not Found");
      }
    })

    this.emailform.patchValue({
      to: this.data['mailid']
    });
  }

  // function to save the email log
  async sendEMail(formValue) {

    var oParser = new DOMParser();
    var oDOM = oParser.parseFromString(formValue['htmlbody'], "text/html");
    var textContent = oDOM.body.innerText;
    const docRef = doc(collection(this.firestore, 'email archive'));
    var x = confirm("Are you sure to send email")

    if (x) {
      var map = {
        docid: docRef.id,
        profileid: [formValue['to']],
        createdby: this.authguard.uid,
        date: new Date(),
        status: 'validated',
        subject: formValue['subject'],
        body: formValue['htmlbody'],
        from: formValue['from'],
        templateid: [null, undefined, ""].includes(formValue['template']) ? null : formValue['template']['templatealias'],
        broadcastname: `Broadcast-Individual-${new Date().toLocaleDateString()}`,
        notes: formValue['notes'],
        postmarktemplateid: [null, undefined, ""].includes(formValue['template']) ? null : formValue['template']['postmarktemplateid'],
        postmark_msgid: []
      }

      setDoc(docRef, map).then(() => {
        this.openSnackBar("EMAIL SENT SUCCESSFULLY", "OK");
        this.dialogRef.close();
      }).catch((error) => {
        this.openSnackBar("ERROR SENDING EMAIL", "OK");
      })
    }
  }

  // async sendTest(value) {
  //   let mailoptions = {
  //     From: [null, undefined, ""].includes(value['from']) ? "support@intl.soexcellence.com" : value['from'], 
  //     To: this.mapProfileUid[this.authguard.uid]['email'],
  //     HtmlBody : value['htmlbody'],
  //     Subject : value['subject']
  //   }

  //   console.log("options", mailoptions);

  //   try {
  //     const url = "https://us-central1-test-environment-841c3.cloudfunctions.net/sendValidationMail";          
  //     const response = await this.http.post(url, { data: mailoptions }).toPromise();
  //     console.log('Success message:', response['message']);
  //     this.snackBar.open(response['message'], 'Close');
  //   } catch (error: any) {
  //     console.error('Error:', error);
  //     this.snackBar.open('Error sending mail', 'Close');
  //   }
  // }

  // function to get current time 
  getCurrentTime() {
    const currentTime = new Date();
    return currentTime.toLocaleTimeString()
  }

  // function to handle when tenplate is selected 
  onTemplateSelect(template) {
    // this.sanitizedHtmlContent = this.sanitizer.bypassSecurityTrustHtml(template.htmlbody);
    this.emailform.patchValue({
      htmlbody: this.sanitizer.bypassSecurityTrustHtml(template.htmlbody),
      subject: template.subject
    })
  }

  // function to resize the image that added to html
  resizeImage() {
    if (this.selectedImage) {
      this.selectedImage.style.width = `${this.selectedImageWidth}px`;
      this.selectedImage.style.height = `${this.selectedImageHeight}px`;
    }
  }

  // function to switch the preview for mobile and web view
  setSize(view: "mobile" | "web") {
    const contentContainer = document.getElementById("contentContainer");
    if (contentContainer) {
      if (view === "mobile") {
        contentContainer.style.fontSize = "14px";
        contentContainer.style.padding = "10px";
        contentContainer.style.width = "412px";
        contentContainer.style.height = "80vh";
      } else if (view === "web") {
        contentContainer.style.fontSize = "18px";
        contentContainer.style.padding = "20px";
        contentContainer.style.width = "100%";
        contentContainer.style.overflow = "auto";
        contentContainer.style.height = "80vh";
      }
    }

    this.previewMode = view;
  }

  // function to disable to submit button
  validateButton() {
    return this.buttonName == "" || this.buttonSize == "" || this.buttonAlign == "" || this.buttonLink == "" ? true : false;
  }

  // function to insert button to html
  insertButton(buttonName, buttonSize, buttonLink, buttonAlign) {
    const sizeStyles = {
      small: "padding: 5px 10px; font-size: 12px;",
      medium: "padding: 10px 20px; font-size: 16px;",
      large: "padding: 15px 30px; font-size: 20px;",
    };

    const alignStyles = {
      left: "text-align: left;",
      center: "text-align: center;",
      right: "text-align: right;",
    };

    const buttonStyle = sizeStyles[buttonSize] || sizeStyles["medium"];
    const alignStyle = alignStyles[buttonAlign] || alignStyles["center"];
    const link = this.buttonLink
      ? `onclick=\"window.open('${buttonLink}', '_blank')\"`
      : "";
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);

    const buttonHtml = `<br><div style="${alignStyle}"><button style="background-color: green; color: white; border-radius: 10px; ${buttonStyle}" ${link}>${buttonName || ""}</button><br><br></div>`;

    if (range) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = buttonHtml;
      const fragment = document.createDocumentFragment();
      let node;
      while ((node = tempDiv.firstChild)) {
        fragment.appendChild(node);
      }
      range.deleteContents();
      range.insertNode(fragment);
    } else {
      var body = this.emailform.get('htmlbody').value
      body += buttonHtml;
      // this.emailform.controls.htmlbody.setValue(body);
    }

    this.buttonName = "";
    this.buttonSize = "";
    this.buttonAlign = "";
    this.buttonLink = "";
    this.hideAddButton = true;
    this.onContentChange();
  }

  // function to sanitize the html body
  onContentChange() {
    this.sanitizedHtmlContent = this.sanitizer.bypassSecurityTrustHtml(this.emailform.get('htmlbody')?.value);
  }

  // function to handle to click event on angular editor
  onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === "IMG") {
      this.selectedImage = target;
      this.selectedImageWidth = parseInt(target.style.width || "100", 10);
      this.selectedImageHeight = parseInt(target.style.height || "100", 10);
    } else {
      this.selectedImage = null;
    }
  }

  // function to open snackbar
  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 3000 });
  }
}
