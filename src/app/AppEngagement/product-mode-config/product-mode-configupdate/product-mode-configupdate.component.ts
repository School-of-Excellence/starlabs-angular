import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ENTER } from '@angular/cdk/keycodes';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Firestore, collection, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { inject } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-product-mode-configupdate',
  standalone: true,
  imports: [FormsModule,
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatExpansionModule,
    MatIconModule,
    MatSelectModule,
    MatChipsModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    DragDropModule,
    MatCheckboxModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './product-mode-configupdate.component.html',
  styleUrl: './product-mode-configupdate.component.css'
})

export class ProductModeConfigupdateComponent {
  formbuilder = inject(FormBuilder);
  widgetList = [
    {
      title: "Start Cycle of Evolution",
      widgetid: "cycleofevolution"
    },
    {
      title: "Impact & Non Impact Stats",
      widgetid: "impactstats"
    },
    {
      title: "Extending Impactful Life Value",
      widgetid: "impactfulllifevalue"
    },
    {
      title: "Ads Playlist",
      widgetid: "adsplaylist"
    },
    {
      title: "Solar Voice Playlist",
      widgetid: "solarvoice"
    },
    {
      title: "EiFlix Playlist",
      widgetid: "eiflix"
    },
    {
      title: "General Content",
      widgetid: "generalcontent"
    },
    {
      title: "Evolution Wish List Family & Peers",
      widgetid: "evolutionwishlist"
    },
    {
      title: "Evolution Wish List Self",
      widgetid: "evolutionwishlistself"
    },
    {
      title: "Dos & Don'ts",
      widgetid: "dodont"
    },
    {
      title: "Form",
      widgetid: "form"
    },
    {
      title: "Adjustment Awareness",
      widgetid: "adjustmentawareness"
    },
    {
      title: "Evolution Progress Awareness",
      widgetid: "evolutionprogessawareness"
    },
    {
      title: "Crossover Meter",
      widgetid: "crossovermeter"
    },
    {
      title: "Monthly Ask A&H",
      widgetid: "monthlyaskah"
    },
    {
      title: "Review ATC",
      widgetid: "reviewatc"
    },
  ]
  readonly separatorKeysCodes = [ENTER] as const;
  tipText = ""
  modeconfigForm: FormGroup = this.formbuilder.group({
    modetips: [[], { validators: [], updateOn: "change" }],
    widgets: this.formbuilder.array([])
  });

  // Reference List
  adsPlaylist = []
  solarVoicePlaylist = []
  eiflixPlaylist = []
  generalcontentPlaylist = []
  formtemplatelist = []

  // String declarations 
  filteredReference: string = '';
  filteredWidget: string = '';

  showPreview = false;
  constructor(
    public firestore: Firestore,
    public dialogref: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public dialogdata: any,
  ) { }

  ngOnInit(): void {
    var reference = this.dialogdata["reference"]
    this.adsPlaylist = reference["adsplaylist"]
    this.solarVoicePlaylist = reference["solarvoiceplaylist"]
    this.eiflixPlaylist = reference["eiflixplaylist"]
    this.generalcontentPlaylist = reference["generalcontentplaylist"]
    this.formtemplatelist = reference["formlist"]
    var modeConfig = this.dialogdata["config"]
    var widgets = modeConfig["widgets"] ?? [];

    console.log("wdigets", widgets);
    

    if (widgets.length != 0) {
      for (let i = 0; i < widgets.length; i++) {
        const item = widgets[i];
        this.addWidget()
        this.widgetArray.at(i).patchValue({
          widgetid: item["widgetid"],
          reference: (item["reference"] ?? []).map(e => e.path),
          dos: item["dos"] ?? [],
          donts: item["donts"] ?? [],
          mandatory: item["mandatory"] ?? false,
        })
      }
    } else {
      this.addWidget()
    }

    this.widgetArray.updateValueAndValidity()
    this.modeconfigForm.patchValue({
      modetips: modeConfig["modetips"] ?? []
    })
    this.modeconfigForm.updateValueAndValidity()
  }

  onMessageInput() {
    if (this.tipText.trim().length !== 0) {
      const modetips = this.modeconfigForm.get('modetips')?.value || [];
      this.modeconfigForm.patchValue({
        modetips: [...modetips, this.tipText.trim()]
      });
      this.tipText = "";
    }
  }

  onMessageDelete(index: number) {
    const modetips = this.modeconfigForm.get('modetips')?.value || [];
    modetips.splice(index, 1);
    this.modeconfigForm.patchValue({ modetips });
  }

  drop(event: CdkDragDrop<string[]>) {
    const modetips = this.modeconfigForm.get('modetips')?.value || [];
    moveItemInArray(modetips, event.previousIndex, event.currentIndex);
    this.modeconfigForm.patchValue({ modetips });
  }

  returnWidget() {
    return this.widgetList.filter(e => e.title.toLowerCase().includes(this.filteredWidget?.toLowerCase())).sort((a, b) => a['title'].localeCompare(b['title']));
  }
  
  returnReferenceOption(widgetid) {
    let widgetArray = [];
    if (widgetid == "adsplaylist") {
      widgetArray = this.adsPlaylist
    } else if (widgetid == "solarvoice") {
      widgetArray = this.solarVoicePlaylist
    } else if (widgetid == "eiflix") {
      widgetArray = this.eiflixPlaylist
    } else if (widgetid == "generalcontent") {
      widgetArray = this.generalcontentPlaylist
    } else if (widgetid == "form") {
      widgetArray = this.formtemplatelist
    }

    return widgetArray.filter(e => e.title.toLowerCase().includes(this.filteredReference?.toLowerCase())).sort((a, b) => a['title'].localeCompare(b['title']));
  }

  get widgetArray(): FormArray {
    return this.modeconfigForm.get('widgets') as FormArray
  }

  createWidget() {
    return this.formbuilder.group({
      widgetid: [null, { validators: [Validators.required], updateOn: "change" }],
      reference: [[], { validators: [], updateOn: "change" }],
      dos: [[], { validators: [], updateOn: "change" }],
      donts: [[], { validators: [], updateOn: "change" }],
      mandatory: [false, { validators: [Validators.required], updateOn: "change" }],
    });
  }

  addWidget() {
    this.widgetArray.push(this.createWidget())
  }

  removeWidget(index) {
    if (confirm("Sure, do you want to delete this widget?")) {
      this.widgetArray.removeAt(index)
    }
  }

  addActionItems(index: number, key: 'dos' | 'donts', event: MatChipInputEvent): void {
    const input = event.input;
    const value = (event.value || '').trim();

    if (value) {
      const control = this.widgetArray.controls[index].get(key);
      const currentValues = control.value || [];
      control.setValue([...currentValues, value]); // ✅ triggers change detection
    }

    if (input) {
      input.value = '';
    }
  }

  removeActionItems(index, key, item) {
    var valueindex = this.widgetArray.controls[index].get(key).value.indexOf(item)
    if (valueindex >= 0) {
      this.widgetArray.controls[index].get(key).value.splice(valueindex, 1)
    }
  }

  async updateConfig(value) {
    console.log(value)
    var widget = []
    value["widgets"].forEach(element => {
      element["reference"] = element["reference"].map(e => doc(this.firestore, e));
      element["title"] = this.widgetList.find(e => e["widgetid"] == element["widgetid"])["title"]
      widget.push(element)
    })
    console.log(widget)
    var docid = this.dialogdata["config"]["docid"] ?? doc(collection(this.firestore, "product mode config")).id;
    const docRef = doc(this.firestore, "product mode config", docid);
    await setDoc(docRef, {
      docid: docid,
      productref: this.dialogdata["config"]["productref"],
      mode: this.dialogdata["config"]["mode"],
      widgets: widget,
      modetips: value["modetips"] ?? [],
      lastupdate: serverTimestamp()
    }, { merge: true });

    this.dialogref.close();
  }

    // Add these helper methods for the preview
  getWidgetName(widgetId: string): string {
    const widget = this.widgetList.find(w => w.widgetid === widgetId);
    return widget ? widget.title : 'Unknown';
  }
  
  getReferenceName(widgetId: string, referenceValue: string): string {
    const options = this.returnReferenceOption(widgetId);
    const ref = options.find(o => o.value === referenceValue);
    return ref ? ref.title : referenceValue;
  }
}


