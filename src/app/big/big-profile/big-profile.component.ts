import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, where } from '@angular/fire/firestore';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';
import { BigLevelDashboardComponent } from "../big-level-dashboard/big-level-dashboard.component";
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCard, MatCardContent, MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBar } from '@angular/material/progress-bar';

@Component({
  selector: 'app-big-profile',
  imports: [
    CommonModule,
    MatTableModule,
    MatFormFieldModule,
    MatCardModule,
    MatChipsModule,
    BigLevelDashboardComponent
],
  templateUrl: './big-profile.component.html',
  styleUrl: './big-profile.component.css'
})
export class BigProfileComponent {
  selectedData:any={};
  profileData:any={};
  bigAggregateLevel:any={};
  participantDashboard:any={};
  queueActivitylog:any={};
  videoAsk:any=[];
  selectedVideoIndex: number | null = null;
  profileid: string ;
  //AHSpace
  ahSpace:any=[];
  ahSpaceName:any={};
  ahSpaceType:any={};
  dataSource = new MatTableDataSource()
  @ViewChild(MatPaginator) paginator : MatPaginator
  @ViewChild(MatSort) sort : MatSort
  displayedColumns:String [] = ["event","date","time","spaceType","summary"]

  

  colorMap: any = [
    "#4CAF50", 
    "#E91E63",
    "#1E88E5",
    "#9C27B0",
  ];
  
  constructor(
    private route: ActivatedRoute,
    private firestore:Firestore,
  ) { 
    
    //bigdashboard profile selected data
    this.route.queryParams.subscribe(params => {
      const selectedvalue = JSON.parse(params['data']);
      this.selectedData=selectedvalue;
    });

   //profileData
   getDoc(doc(this.firestore,"profile_data",this.selectedData["profileid"])).then(value=>{
    var element=value.data()
    this.profileData=element
  })

    //level
    getDocs(query(collection(this.firestore, "big aggregate level"),where("profileid", "==", this.selectedData.profileid))).then(async value=>{
      let x = []
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        await getDoc(element["level"]).then((bigdocs)=>{
          var bigdata=bigdocs.data();
          console.log("biglevel",bigdata);
          element["levelname"]=bigdata["level"];
          x[element["id"]]=element
        })
      }
      this.bigAggregateLevel = x
    })

    //participantdashboard
     getDoc( doc(this.firestore, "participantdashboard", this.selectedData['profileid'])).then(value=>{
      var element=value.data()
      if ( element["subscriptionend"]) {
        element["subscriptionend"] = element["subscriptionend"].toDate().getTime();
        element["remainingDays"] = this.calculateRemainingDays(element["subscriptionend"]);
      } else {
        element["remainingDays"] = 0; 
      }

      if (element["evolutionprogress"]) {
        const processedEvolution = this.processEvolutionMap(element["evolutionprogress"]);
        element["evolutionprogress"] = processedEvolution;
        console.log("elemnt",processedEvolution);
      }
      this.participantDashboard=element      
    })

    //queue activity log
    getDocs(query(collection(this.firestore, "queue activity log"),where("profileid", "==", this.selectedData.profileid))).then(async value=>{
      let mapActvity = {}
      await getDocs(collection(this.firestore,"bigactivity")).then(values=>{
        for (let i = 0; i < values.docs.length; i++) {
          const element = values.docs[i].data();
          mapActvity[values.docs[i].id] = element['activity']
        }
      })      
      var map ={};
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        if(mapActvity[element["activity"]] !="Changework solo" && mapActvity[element["activity"]] !="Changework Mentee"){
          map[mapActvity[element["activity"]]] = map[mapActvity[element["activity"]]] || { count:0 }
          map[mapActvity[element["activity"]]]["count"] += 1;
        }
      }
      this.queueActivitylog=map
    })

    //VIDEOASK
    getDocs(query(collection(this.firestore, "participantvideoask"),where("profileid", "==", this.selectedData.profileid))).then(async value=>{
      for (let index = 0; index < value.docs.length; index++) {
        this.videoAsk.push(value.docs[index].data());
      }
    })

   //A&H-Space
     getDocs(query(collection(this.firestore, "A&H-Space"),where("participants", "array-contains", this.selectedData["profileid"]))).then(async (value)=>{
      var x=[];
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        element["createdData"] = element["created"].toDate(); 
        if(element["type"] && element["type"][this.selectedData["profileid"]]){
          const arrayValue = element["type"][this.selectedData["profileid"]]; 
          for (let i = 0; i < arrayValue.length; i++) {
            const someString = arrayValue[i]; 
            if (element["summary"] && element["summary"][someString]) {
              x.push(element["summary"][someString]);
              element["summaryData"]=x;
            } 
          }
        }
          
        await getDocs(query(collection(this.firestore, "queue generation"),where("docid", "==", element["queue"]))).then((queuedocs)=>{
          var queuedata=queuedocs.docs[0].data();
          element["queuename"]=queuedata["queuename"];
          this.ahSpace.push(element);
        })
      }    
      this.dataSource.data = this.ahSpace
    })
    //A&H_Space_Name
    getDocs(collection(this.firestore,"A&H_Space_Name")).then((value)=>{
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        this.ahSpaceName[element["docid"]]= element;
      }
    })
    //A&H_Space_Type
    getDocs(collection(this.firestore,"A&H_Space_Type")).then((value)=>{
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        this.ahSpaceType[element["docid"]]= element;
      }
    })
  }

  ngAfterViewInit(){
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  calculateRemainingDays(subscriptionEnd: number): number {
    if (!subscriptionEnd) return 0; 
    const endDate = new Date(subscriptionEnd);
    const currentDate = new Date();
    const differenceInMs = endDate.getTime() - currentDate.getTime();
    const remainingDays = Math.ceil(differenceInMs / (1000 * 60 * 60 * 24));
    return remainingDays < 0 ? 0 : remainingDays;
  }

  processEvolutionMap(evolutionMap: any): any {
    return Object.keys(evolutionMap).reduce((result, key) => {
      const lowerKey = key.toLowerCase();
      if (result[lowerKey]) {
          result[lowerKey] += evolutionMap[key]; 
      } else {
          result[lowerKey] = evolutionMap[key];
      }
      return result;
    }, {});
  }

  playVideo(index: number) {
    this.selectedVideoIndex = index;
  }

  ngOnInit(): void {}
}