import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { collection, doc, Firestore, getDocs, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-event-opportunity-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    CommonModule,
    MatDialogModule,
    MatInputModule
  ],
  templateUrl: './event-opportunity-dialog.component.html',
  styleUrl: './event-opportunity-dialog.component.css'
})
export class EventOpportunityDialogComponent {
  selectedqueueList = []
  stages = []
  // stage
  // notesForm: FormGroup;
  //   initForm() {
  //     this.notesForm = this.fb.group({
  //       name: this.fb.array([this.createNoteControl()]) // FormArray of FormGroups
  //     });
  // }

  notesForm: FormGroup 

  selectedStages 
  mapQueue = {}
  constructor(
    public dialogRef: MatDialogRef<EventOpportunityDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, 
    private firestore: Firestore, 
    private fb: FormBuilder
  ){
    this.selectedqueueList = data['selectedQueueList'] ?? []
    if(this.selectedqueueList.length != 0){
      this.fetchdata()
    }
    this.notesForm = this.fb.group({
      stagename:[null,Validators.required],
      stage:[[],Validators.required]
    })

    if(this.data['type'] === 'edit'){
      this.notesForm.patchValue({
        stagename: this.data.doc['stagename'],
        stage : this.data.doc['stage']
      })
    }
  }

  ngOnInit(): void {
    this.fetchdata()
    // this.initForm()
  }

  fetchdata(){
    getDocs(query(collection(this.firestore,'queue generation'), where("docid","in",this.selectedqueueList))).then(async queueData=>{
      console.log(queueData.docs.length);
      // let allStages = queueData.docs.map(e => e.data()['stages'])
      // this.stages = [...new Set(allStages.flat())];
      // console.log(this.stages);
      let allstages = []
      this.mapQueue = {}
      for (let i = 0; i < queueData.docs.length; i++) {
        const queueDoc = queueData.docs[i].data()
        const stagenamelist = queueDoc['stages'];
        this.mapQueue[queueData.docs[i].id] = queueDoc['queuename']
        for (let j = 0; j < stagenamelist.length; j++) {
          const stagename = stagenamelist[j];
          if(queueDoc['stageproperty'][stagename] && Object.values(queueDoc['stageproperty'][stagename]['compulsoryactivity']).length != 0){
            allstages.push({
              queueid:queueDoc['docid'],
              stagename:stagename,
              status:'queued',
            })
            allstages.push({
              queueid:queueDoc['docid'],
              stagename:stagename,
              status:'waiting',
            })
            allstages.push({
              queueid:queueDoc['docid'],
              stagename:stagename,
              status:'instudio',
            })
          }else{
            allstages.push({
              queueid:queueDoc['docid'],
              stagename:stagename,
              status:null
            })
          }
        }
      }
      this.stages = allstages
    })
  }

  // get notesArray() {
  //   return this.notesForm.get('name') as FormArray;
  // }

  // createNoteControl() {
  //   return this.fb.group({
  //     stagename: ['', Validators.required], 
  //     stage: [[]] 
  //   });
  // }

  // addNote() {
  //   this.notesArray.push(this.createNoteControl());
  // }

  // removeNote(index: number) {
  //   this.notesArray.removeAt(index);
  // }

  compareFnc(c1:any, c2:any): boolean {
    return c1 && c2 ? `${c1.queueid}${c1.stagename}${c1.status}` === `${c2.queueid}${c2.stagename}${c2.status}` : c1 === c2;
  }

  onClose(){
    this.dialogRef.close()
  }

  submit(){
    if(this.data['type'] === 'new'){
      const formValues = this.notesForm.value; 
      console.log(formValues);
      let docid = doc(collection(this.firestore, 'stage opportunity count')).id;
      let docData = {
        queuelist : this.selectedqueueList,
        docid : docid,
        created: new Date()
      }
      docData = {...docData,...formValues}
      // console.log(doc);
      setDoc(doc(this.firestore, 'stage opportunity count', docid), docData)
    }else if(this.data['type'] === 'edit'){
      const formValues = this.notesForm.value; 
      console.log(formValues);
      let docid = this.data.doc['docid'];
      let docData = {
        queuelist : this.selectedqueueList,
        docid : docid,
        created: new Date()
      }
      docData = {...docData,...formValues}
      // console.log(doc);
      updateDoc(doc(this.firestore, 'stage opportunity count', docid), docData)

    }
    this.dialogRef.close()
  }
}
