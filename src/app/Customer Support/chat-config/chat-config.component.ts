import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Firestore,doc,collection,collectionData, getDocs ,DocumentReference,getDoc, setDoc} from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-chat-config',
  imports: [
    MatProgressSpinnerModule,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    DragDropModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatTooltipModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './chat-config.component.html',
  styleUrl: './chat-config.component.css'
})
export class ChatConfigComponent {
  profileList = [];
  status = [];

  profileData = {};

  loading: boolean = true;

  // Edit mode flags
  negligenceEditMode: boolean = false;
  categoryEditIndex: number = -1; // -1 means no category is being edited
  isAddingNewCategory: boolean = false;
  automatedMessageEditMode: boolean = false;
  warningMessageEditMode: boolean = false;
  closingMessageEditMode: boolean = false;

  // Backup for cancel functionality
  negligenceBackup: any = null;
  categoryBackup: any = null;
  automatedMessageBackup: any = null;
  warningMessageBackup: any = null;
  closingMessageBackup: any = null;

  searchProfile = '';
  searchvalidator = '';
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  configurationform: FormGroup

  get categories() {
    return this.configurationform.get('categories') as FormArray;
  }

  get messages() {
    return this.configurationform.get('messages') as FormArray;
  }

  get warningmessages() {
    return this.configurationform.get('warningmessages') as FormArray;
  }

  get closingmessages() {
    return this.configurationform.get('closingmessages') as FormArray;
  }

  private firestore = inject(Firestore)
  constructor(
    private formbuilder: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private datePipe: DatePipe,
    public authguard: AuthguardService,
    public dialogRef: MatDialogRef<ChatConfigComponent>
  ) {

    this.configurationform = this.formbuilder.group({
      categories: this.formbuilder.array([this.createFormCategory()]),
      messages: this.formbuilder.array([this.createMessageArray()]),
      warningmessages: this.formbuilder.array([this.createWarningMessageArray()]),
      closingmessages: this.formbuilder.array([this.createClosingMessageArray()]),
      status: [[]],
      validators: [[]],
      negligencecategories: [[]],
    });

    this.authguard.getRoles().then(async (roles) => {
      const profile_dataDocRef: DocumentReference = roles['profile_ref']
      //fetch user data
      getDoc(profile_dataDocRef).then((profileDoc) => {
        this.profileData = profileDoc.data();
      });

      this.authguard.getProfileMap().then((e) => { this.profileList = e.list });

      getDocs(collection(this.firestore, "chat config")).then((sCDocs) => {
        if (sCDocs.docs.length != 0) {
          var supportConfig = sCDocs.docs[0].data();

          this.configurationform.patchValue({
            status: supportConfig['status'] ?? [],
            validators: supportConfig['validators'] ?? [],
            negligencecategories: supportConfig['negligencecategories'] ?? [],
          });

          // Load categories
          supportConfig["categories"].forEach((e: Object, i: number) => {
            i != 0 ? this.addCategory() : null;
            if (supportConfig["categories"][i]['subcategories'].length != 0) {
              supportConfig["categories"][i]['subcategories'].forEach((e: Object, j: number) => {
                j != 0 ? this.addSubCategory(i) : null;
              });
            }

            this.categories.at(i).patchValue({
              category: e['category'],
              assignto: e['assignto'],
              show: e['show'],
              subcategories: e['subcategories']
            });
          });

          // Load automated messages
          supportConfig["messages"].forEach((e: Object, j: number) => {
            j != 0 ? this.addMessage() : null;
            this.messages.at(j).patchValue({
              message: e['message'],
              index: e['index']
            });
          });

          // Load warning messages
          if (supportConfig["warningmessages"] && supportConfig["warningmessages"].length > 0) {
            supportConfig["warningmessages"].forEach((e: Object, j: number) => {
              j != 0 ? this.addWarningMessage() : null;
              this.warningmessages.at(j).patchValue({
                message: e['message'],
                index: e['index']
              });
            });
          }

          // Load closing messages
          if (supportConfig["closingmessages"] && supportConfig["closingmessages"].length > 0) {
            supportConfig["closingmessages"].forEach((e: Object, j: number) => {
              j != 0 ? this.addClosingMessage() : null;
              this.closingmessages.at(j).patchValue({
                message: e['message'],
                index: e['index']
              });
            });
          }

          this.loading = false;

        } else {
          console.log("No Document Found.. :(");
          this.loading = false;
        }
      });

    });

  }

  ngOnInit() {
  }

  // ==================== NEGLIGENCE EDIT MODE ====================

  editNegligence() {
    // Backup current values for cancel
    this.negligenceBackup = {
      validators: [...this.configurationform.controls['validators'].value],
      negligencecategories: [...this.configurationform.controls['negligencecategories'].value]
    };
    this.negligenceEditMode = true;
  }

  saveNegligence() {
    this.negligenceEditMode = false;
    this.negligenceBackup = null;
    this.saveToFirestore();
  }

  cancelNegligence() {
    // Restore backup values
    if (this.negligenceBackup) {
      this.configurationform.patchValue({
        validators: this.negligenceBackup.validators,
        negligencecategories: this.negligenceBackup.negligencecategories
      });
    }
    this.negligenceEditMode = false;
    this.negligenceBackup = null;
  }

  // Get validator names for preview (as comma-separated string)
  getValidatorNames(): string {
    const validatorIds = this.configurationform.controls['validators'].value || [];
    if (validatorIds.length === 0) return 'No validators assigned';
    
    const names = validatorIds.map(id => {
      const profile = this.profileList.find(p => p.id === id);
      return profile ? profile.name : id;
    });
    return names.join(', ');
  }

  // Get validator names as array for chip display
  getValidatorNamesList(): string[] {
    const validatorIds = this.configurationform.controls['validators'].value || [];
    if (validatorIds.length === 0) return [];
    
    return validatorIds.map(id => {
      const profile = this.profileList.find(p => p.id === id);
      return profile ? profile.name : id;
    });
  }

  // Get negligence categories for preview
  getNegligenceCategories(): string[] {
    return this.configurationform.controls['negligencecategories'].value || [];
  }

  // ==================== AUTOMATED MESSAGE EDIT MODE ====================

  editAutomatedMessage() {
    this.automatedMessageBackup = this.messages.value.map(msg => ({ ...msg }));
    this.automatedMessageEditMode = true;
  }

  saveAutomatedMessage() {
    this.automatedMessageEditMode = false;
    this.automatedMessageBackup = null;
    this.saveToFirestore();
  }

  cancelAutomatedMessage() {
    if (this.automatedMessageBackup) {
      // Clear and restore
      while (this.messages.length !== 0) {
        this.messages.removeAt(0);
      }
      this.automatedMessageBackup.forEach((msg: any) => {
        this.messages.push(this.formbuilder.group({
          message: [msg.message, { validators: [Validators.required], updateOn: "change" }],
          index: [msg.index, { validators: [Validators.required], updateOn: "change" }],
        }));
      });
    }
    this.automatedMessageEditMode = false;
    this.automatedMessageBackup = null;
  }

  getAutomatedMessages(): any[] {
    return this.messages.value || [];
  }

  // ==================== WARNING MESSAGE EDIT MODE ====================

  editWarningMessage() {
    this.warningMessageBackup = this.warningmessages.value.map(msg => ({ ...msg }));
    this.warningMessageEditMode = true;
  }

  saveWarningMessage() {
    this.warningMessageEditMode = false;
    this.warningMessageBackup = null;
    this.saveToFirestore();
  }

  cancelWarningMessage() {
    if (this.warningMessageBackup) {
      // Clear and restore
      while (this.warningmessages.length !== 0) {
        this.warningmessages.removeAt(0);
      }
      this.warningMessageBackup.forEach((msg: any) => {
        this.warningmessages.push(this.formbuilder.group({
          message: [msg.message, { validators: [Validators.required], updateOn: "change" }],
          index: [msg.index, { validators: [Validators.required], updateOn: "change" }],
        }));
      });
    }
    this.warningMessageEditMode = false;
    this.warningMessageBackup = null;
  }

  getWarningMessages(): any[] {
    return this.warningmessages.value || [];
  }

  // ==================== CLOSING MESSAGE EDIT MODE ====================

  editClosingMessage() {
    this.closingMessageBackup = this.closingmessages.value.map(msg => ({ ...msg }));
    this.closingMessageEditMode = true;
  }

  saveClosingMessage() {
    this.closingMessageEditMode = false;
    this.closingMessageBackup = null;
    this.saveToFirestore();
  }

  cancelClosingMessage() {
    if (this.closingMessageBackup) {
      // Clear and restore
      while (this.closingmessages.length !== 0) {
        this.closingmessages.removeAt(0);
      }
      this.closingMessageBackup.forEach((msg: any) => {
        this.closingmessages.push(this.formbuilder.group({
          message: [msg.message, { validators: [Validators.required], updateOn: "change" }],
          index: [msg.index, { validators: [Validators.required], updateOn: "change" }],
        }));
      });
    }
    this.closingMessageEditMode = false;
    this.closingMessageBackup = null;
  }

  getClosingMessages(): any[] {
    return this.closingmessages.value || [];
  }

  // ==================== CATEGORY EDIT MODE ====================

  editCategory(index: number) {
    // Backup current values for cancel
    this.categoryBackup = JSON.parse(JSON.stringify(this.categories.at(index).value));
    this.categoryEditIndex = index;
    this.isAddingNewCategory = false;
  }

  saveCategory(index: number) {
    this.categoryEditIndex = -1;
    this.categoryBackup = null;
    this.isAddingNewCategory = false;
    this.saveToFirestore();
  }

  cancelCategory(index: number) {
    if (this.isAddingNewCategory) {
      // Remove the newly added category
      this.categories.removeAt(index);
    } else if (this.categoryBackup) {
      // Restore backup values
      this.categories.at(index).patchValue(this.categoryBackup);
      
      // Restore subcategories
      const subcategoriesArray = this.categories.at(index).get('subcategories') as FormArray;
      while (subcategoriesArray.length !== 0) {
        subcategoriesArray.removeAt(0);
      }
      this.categoryBackup.subcategories.forEach((sub: any, j: number) => {
        subcategoriesArray.push(this.formbuilder.group({
          subcategory: [sub.subcategory]
        }));
      });
    }
    this.categoryEditIndex = -1;
    this.categoryBackup = null;
    this.isAddingNewCategory = false;
  }

  deleteCategory(index: number) {
    const confirmDelete = confirm("Are you sure you want to delete this category?");
    if (confirmDelete) {
      this.categories.removeAt(index);
      this.categoryEditIndex = -1;
      this.categoryBackup = null;
      this.isAddingNewCategory = false;
      this.saveToFirestore();
    }
  }

  addNewCategory() {
    this.categories.push(this.createFormCategory());
    this.categoryEditIndex = this.categories.length - 1;
    this.isAddingNewCategory = true;
  }

  // Get assigned names for preview
  getAssignedNames(index: number): string {
    const assignIds = this.categories.at(index).get('assignto').value || [];
    if (assignIds.length === 0) return 'No one assigned';
    
    const names = assignIds.map(id => {
      const profile = this.profileList.find(p => p.id === id);
      return profile ? profile.name : id;
    });
    return names.join(', ');
  }

  // Check if category is enabled
  isCategoryEnabled(index: number): boolean {
    return this.categories.at(index).get('show').value;
  }

  // Get category name
  getCategoryName(index: number): string {
    return this.categories.at(index).get('category').value || 'Unnamed Category';
  }

  // Get subcategories for preview
  getSubcategories(index: number): string[] {
    const subcategories = this.categories.at(index).get('subcategories').value || [];
    return subcategories
      .filter((sub: any) => sub.subcategory && sub.subcategory.trim() !== '')
      .map((sub: any) => sub.subcategory);
  }

  // ==================== SAVE TO FIRESTORE ====================

  saveToFirestore() {
    const formValue = this.configurationform.value;
    
    let category = [];
    for (let i = 0; i < formValue['categories'].length; i++) {
      const element = formValue['categories'][i];
      var map = {};
      map['category'] = element['category']
      map['assignto'] = element['assignto']
      map['show'] = element['show']
      if (element['subcategories'][0]['subcategory'] === '') {
        map['subcategories'] = []
      } else {
        map['subcategories'] = element['subcategories']
      }
      category.push(map);
    }

    setDoc(doc(this.firestore, "chat config", "0jqtiq3sxtbLVcEGMDhW"), {
      docid: "0jqtiq3sxtbLVcEGMDhW",
      createdDate: new Date(),
      updatedDate: new Date(),
      categories: category,
      messages: formValue['messages'],
      warningmessages: formValue['warningmessages'],
      closingmessages: formValue['closingmessages'],
      createdby: this.profileData['profileid'],
      status: formValue['status'],
      negligencecategories: formValue['negligencecategories'],
      validators: formValue['validators'],
    }, { merge: true }).then(() => {
      console.log("Updated Successfully");
      console.log("Warning Messages:", formValue['warningmessages']);
      console.log("Closing Messages:", formValue['closingmessages']);
      this.openSnackBar("Updated Successfully", "OK");
    }).catch((error) => {
      console.log("Oops error", error);
      this.openSnackBar("Oops Error " + error, "OK");
    });
  }

  // ==================== EXISTING FUNCTIONS (UNCHANGED) ====================

  createFormCategory() {
    return this.formbuilder.group({
      category: ['', { validators: [Validators.required], updateOn: "change" }],
      subcategories: this.formbuilder.array([
        this.formbuilder.group({
          subcategory: ['']
        })
      ]),
      show: [false,],
      assignto: ['', { validators: [Validators.required], updateOn: "change" }],
    });
  }

  addCategory() {
    this.categories.push(this.createFormCategory())
  }

  removeCategory(i: number) {
    this.categories.removeAt(i)
  }

  getSubCategoryItems(index: number) {
    return (this.categories.at(index).get('subcategories') as FormArray).controls;
  }

  addSubCategory(index: number) {
    (this.categories.at(index).get('subcategories') as FormArray).push(this.formbuilder.group({
      subcategory: ['']
    })
    );
  }

  removeSubCategory(categoryIndex: number, itemIndex: number) {
    (this.categories.at(categoryIndex).get('subcategories') as FormArray).removeAt(itemIndex);
  }

  createMessageArray() {
    return this.formbuilder.group({
      message: ['', { validators: [Validators.required], updateOn: "change" }],
      index: [0, { validators: [Validators.required], updateOn: "change" }],
    });
  }

  createWarningMessageArray() {
    return this.formbuilder.group({
      message: ['We are going to close your ticket in 24 hrs. Please reply if you still need assistance.', { validators: [Validators.required], updateOn: "change" }],
      index: [0, { validators: [Validators.required], updateOn: "change" }],
    });
  }

  createClosingMessageArray() {
    return this.formbuilder.group({
      message: ['This ticket has been automatically closed due to no response. Feel free to raise a new ticket if you need further assistance.', { validators: [Validators.required], updateOn: "change" }],
      index: [0, { validators: [Validators.required], updateOn: "change" }],
    });
  }

  addMessage() {
    this.messages.push(this.createMessageArray())
  }
  removeMessage(i: number) {
    this.messages.removeAt(i)
  }

  addWarningMessage() {
    this.warningmessages.push(this.createWarningMessageArray())
  }
  removeWarningMessage(i: number) {
    this.warningmessages.removeAt(i)
  }

  addClosingMessage() {
    this.closingmessages.push(this.createClosingMessageArray())
  }
  removeClosingMessage(i: number) {
    this.closingmessages.removeAt(i)
  }

  add(event: MatChipInputEvent) {
    const value = (event.value || '').trim();
    if (value) {
      this.configurationform.controls['status'].value.push(value);
    }
    event.input.value = '';
  }

  remove(status: String) {
    const index = this.configurationform.controls['status'].value.indexOf(status);
    if (index >= 0) {
      this.configurationform.controls['status'].value.splice(index, 1);
    }
  }

  addNegligence(event: MatChipInputEvent) {
    const value = (event.value || '').trim();
    if (value) {
      this.configurationform.controls['negligencecategories'].value.push(value);
    }
    event.input.value = '';
  }
   
  removeNegligence(cat: String) {
    const index = this.configurationform.controls['negligencecategories'].value.indexOf(cat);
    if (index >= 0) {
      this.configurationform.controls['negligencecategories'].value.splice(index, 1);
    }
  }

  dropCategory(event: any) {
    moveItemInArray(this.categories.controls, event.previousIndex, event.currentIndex);
    this.categories.setValue(this.categories.controls.map(control => control.value));
  }

  returnProfile() {
    return this.profileList.filter((e) => e['name'].trim().toLocaleLowerCase().includes(this.searchProfile.trim().toLocaleLowerCase()))
  }

  returnvalidators() {
    return this.profileList.filter((e) => e['name'].trim().toLocaleLowerCase().includes(this.searchvalidator.trim().toLocaleLowerCase()))
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  submit(formValue: FormData) {

    const check = confirm("Are you sure want to update Configuration");

    let category = [];
    for (let i = 0; i < formValue['categories'].length; i++) {
      const element = formValue['categories'][i];
      var map = {};
      map['category'] = element['category']
      map['assignto'] = element['assignto']
      map['show'] = element['show']
      if (element['subcategories'][0]['subcategory'] === '') {
        map['subcategories'] = []
      } else {
        map['subcategories'] = element['subcategories']
      }
      category.push(map);
    }

    if (check) {
      setDoc(doc(this.firestore, "chat config", "0jqtiq3sxtbLVcEGMDhW"), {
        docid: "0jqtiq3sxtbLVcEGMDhW",
        createdDate: new Date(),
        updatedDate: new Date(),
        categories: category,
        messages: formValue['messages'],
        warningmessages: formValue['warningmessages'],
        closingmessages: formValue['closingmessages'],
        createdby: this.profileData['profileid'],
        status: formValue['status'],
        negligencecategories: formValue['negligencecategories'],
        validators: formValue['validators'],
      }, { merge: true }).then(() => {
        console.log("Updated Successfully");
        this.openSnackBar("Updated Successfully", "OK");
        this.dialogRef.close(true);
      }).catch((error) => {
        console.log("Oops error", error);
        this.openSnackBar("Oops Error " + error, "OK");
      });
    }

  }

}