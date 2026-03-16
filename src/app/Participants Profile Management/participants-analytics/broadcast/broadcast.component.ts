import { Component, Inject } from '@angular/core';
import { Firestore,collection,query,collectionData, orderBy } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MatExpansionModule } from '@angular/material/expansion';
import { CommonModule, DatePipe } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { DomSanitizer } from '@angular/platform-browser';
import { LinebreaksPipe,LinkPipe } from '../../../custompipe.pipe';

@Component({
  selector: 'app-broadcast',
  imports: [
    MatExpansionModule,
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    DatePipe,
    LinebreaksPipe,
    LinkPipe,
    
  ],
  templateUrl: './broadcast.component.html',
  styleUrl: './broadcast.component.css'
})
export class BroadcastComponent {
  templateList = [];
  selectedbroadcast=null;
  loading:boolean=true;
  panelOpenState:boolean = true
  private destroy$ = new Subject<void>()
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef :MatDialogRef<BroadcastComponent>,
    private firestore : Firestore,
    private santizer : DomSanitizer) 
  { 
    const collRef = collection(this.firestore,"broadcast_templates")
    const q = query(collRef,orderBy("date","desc"))
    collectionData(q).pipe(takeUntil(this.destroy$)).subscribe((broadcast)=>{
      this.templateList = [];
      for (let i = 0; i < broadcast.length; i++) {
        const element = broadcast[i];
        element['body'] = element['body']?.replace(/\n/g, '<br>')
        this.templateList.push(element)
      }
      console.log(this.templateList);
      this.loading = false;
    });

  }

  ngOnInit():void{}

  ngOnDestroy(){
    this.destroy$.next();
    this.destroy$.complete()
  }

  createtemplate(){
    if(window.location.href.includes("localhost")){
      window.open("http://localhost:4200/broadcast-template/null/new",'_blank').focus();
    }else if(environment.firebase.projectId == "fir-sample-aae4a"){
      window.open("http://breakthroughs.app/broadcast-template/null/new",'_blank').focus();
    }else if (environment.firebase.projectId == "test-environment-841c3"){
      window.open("http://star-labs-test.web.app/broadcast-template/null/new",'_blank').focus();
    }
  }

  openDupliacte(docid){
    if(window.location.href.includes("localhost")){
      window.open("http://localhost:4200/broadcast-template/"+docid+"/"+"duplicate",'_blank').focus();
    }else if(environment.firebase.projectId == "fir-sample-aae4a"){
      window.open("http://breakthroughs.app/broadcast-template/"+docid+"/"+"duplicate",'_blank').focus();
    }else if (environment.firebase.projectId == "test-environment-841c3"){
      window.open("http://star-labs-test.web.app/broadcast-template/"+docid+"/"+"duplicate",'_blank').focus();
    }
  }

  trustedurl(data){
    console.log(data);
    return this.santizer.bypassSecurityTrustResourceUrl(data.url)
  }

  onDialogCancel(){
    this.dialogRef.close(null)
  }

  onSubmit(){
    this.selectedbroadcast['body'] = this.selectedbroadcast['body'].replace(/<br\s*\/?>/gi, '\n')
    this.dialogRef.close(this.selectedbroadcast);
  }
}
