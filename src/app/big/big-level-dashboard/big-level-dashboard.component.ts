import { CommonModule } from '@angular/common';
import { Component, Input, ViewChild } from '@angular/core';
import { collection, Firestore, getDocs } from '@angular/fire/firestore';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-big-level-dashboard',
  imports: [
    MatTableModule,
    CommonModule,
  ],
  templateUrl: './big-level-dashboard.component.html',
  styleUrl: './big-level-dashboard.component.css'
})
export class BigLevelDashboardComponent  {
  //Gettting data from bigProfile Compoenent
  @Input() bigAggregateLevel: any = {};
  //table 
  dataSource = new MatTableDataSource()
  @ViewChild(MatPaginator) paginator : MatPaginator
  @ViewChild(MatSort) sort : MatSort
  displayedColumns:String [] = ["atcmodel",'levelup',"levelupname","fasttrack","regular"]
  //biglevel
  bigLevel:any={};
  
  constructor(
    private firestore:Firestore,
  ){ 
    getDocs(collection(this.firestore,"biglevel")).then((value)=>{
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        this.bigLevel[element["docid"]] = element
      }
    })
  }

  ngOnInit(): void {}

  ngOnChanges(){
    const bigdata=[];
    for (const key in this.bigAggregateLevel) {
      if (this.bigAggregateLevel.hasOwnProperty(key)) {
        bigdata.push(this.bigAggregateLevel[key]);
        console.log("data",bigdata);  
      }
    }
    if(bigdata != null){
      this.dataSource.data =bigdata
      this.dataSource.sort = this.sort
      this.dataSource.paginator = this.paginator
    }
  }

}

