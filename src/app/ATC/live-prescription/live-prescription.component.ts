import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { collection, collectionGroup, collectionSnapshots, doc, docSnapshots, Firestore } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-live-prescription',
  imports : [
    CommonModule,
  ],
  templateUrl: './live-prescription.component.html',
  styleUrls: ['./live-prescription.component.css']
})
export class LivePrescriptionComponent implements OnInit {

  atcReport = {
    date : new Date(),
    product : "",
    atcowner : "",
    atcprescriber : [],
    atcobserver : [],
    atc : [{
      adjustment : "",
      procedure : [{
        name : "",
        mandatory : false,
        changeagent : [],
      }]
    }],
    notes : {
      summary : "",
      points: "",
      notes : "",
      mentornotes: ""
    }
  };
  status:string;

  mapProcedures = {};
  mapProfiles = {};

  private unsubscribe$ = new Subject<void>();

  constructor(public firestore: Firestore, public route: ActivatedRoute) {
    this.atcReport = {
      date : new Date(),
      product : "",
      atcowner : "",
      atcprescriber : [],
      atcobserver : [],
      atc : [],
      notes : {
        summary : "",
        points: "",
        notes : "",
        mentornotes: ""
      }
    }
    this.route.params.subscribe(data=>{
      console.log(data['draft']) 
      this.getDraftATC(data['draft'])
    })
  }

  

  ngOnInit(): void {

    collectionSnapshots(collectionGroup(this.firestore,"authors")).pipe(takeUntil(this.unsubscribe$)).subscribe(prescriberAuthor=>{
      for (let i = 0; i < prescriberAuthor.length; i++) {
        this.mapProfiles[prescriberAuthor[i].ref.path] = prescriberAuthor[i].data()['name']
      }
    })

    collectionSnapshots(collectionGroup(this.firestore, 'authors')).pipe(takeUntil(this.unsubscribe$)).subscribe(authors => {
      authors.forEach(author => {
        this.mapProfiles[author.ref.path] = author.data()['name'];
      });
    });

    collectionSnapshots(collection(this.firestore,"profile_data")).pipe(takeUntil(this.unsubscribe$)).subscribe(profile=>{
      for (let i = 0; i < profile.length; i++) {
        this.mapProfiles[profile[i].ref.path] = profile[i].data()['name']
      }
    })

    collectionSnapshots(collection(this.firestore,"procedures")).pipe(takeUntil(this.unsubscribe$)).subscribe(procedure=>{
      for (let i = 0; i < procedure.length; i++) {
        this.mapProcedures[procedure[i].ref.path] = procedure[i].data()['name']
      }
    })
  }

  getDraftATC(id:string){
    docSnapshots(doc(collection(this.firestore,"temporary_ATC"),id)).pipe(takeUntil(this.unsubscribe$)).subscribe(draft=>{
      if(draft.exists()){
        this.status = null
        var draftATC = draft.data();

        this.atcReport.date = new Date(draftATC['date'])
        this.atcReport.product = draftATC['product']
        this.atcReport.atcowner = "profile_data/"+draftATC['profileid']
        
        var authors = [];
        Object.values(draftATC['author'] ?? []).forEach((element:any) => {
          authors = Array.from(new Set([...authors, ...element]))
        });
        this.atcReport.atcprescriber = authors

        var observerauthors = [];
        Object.values(draftATC['observer'] ?? []).forEach((element: any) => {
          observerauthors = Array.from(new Set([...observerauthors, ...element]))
        });
        this.atcReport.atcobserver = observerauthors

        var transcript = []
        for (let i = 0; i < draftATC['transcript'].length; i++) {
          transcript.push({
            adjustment : "",
            procedure : [],
          })
          
          transcript[i].adjustment = draftATC['transcript'][i].adjustment

          for (let j = 0; j < draftATC['transcript'][i].procedure.length; j++) {
            transcript[i].procedure.push({
              name : "",
              mandatory : false,
              changeagent : [],
            })

            transcript[i].procedure[j].name = draftATC['transcript'][i].procedure[j].name
            transcript[i].procedure[j].mandatory = draftATC['transcript'][i].procedure[j].mandatory
            var procedureagent = []
            Object.values(draftATC['transcript'][i].procedure[j].assignedMap ?? {}).forEach((element:any) => {
              procedureagent = Array.from(new Set([...procedureagent, ...element]))
            });
            transcript[i].procedure[j].changeagent = procedureagent
          }
        }
        this.atcReport.atc = transcript

        this.atcReport.notes.summary = (draftATC['consultationsummary'] ?? "").length == 0 ? "....." : draftATC['consultationsummary']
        this.atcReport.notes.points = (draftATC['consultationpoint'] ?? "").length == 0 ? "....." : draftATC['consultationpoint']
        this.atcReport.notes.notes = (draftATC['notes'] ?? "").length == 0 ? "....." : draftATC['notes']
        this.atcReport.notes.mentornotes = (draftATC['mentornotes'] ?? "").length == 0 ? "....." : draftATC['mentornotes']
      }
      else{
        this.status = "The ATC might be either deleted or yet to start the prescription"
      }
    })
  }

  returnNameList(id:Array<string>):string{
    var value:string
    var list = []
    id.forEach(element=>{
      list.push(this.mapProfiles[element])
    })
    value = list.length != 0 ? list.join(', ') : "Not Selected"
    return value
  }

}
