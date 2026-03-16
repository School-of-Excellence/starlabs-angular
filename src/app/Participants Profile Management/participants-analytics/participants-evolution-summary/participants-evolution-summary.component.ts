import { Component, ViewChild } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { DataTransferService } from '../data-transfer.service';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-participants-evolution-summary',
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './participants-evolution-summary.component.html',
  styleUrl: './participants-evolution-summary.component.css'
})
export class ParticipantsEvolutionSummaryComponent {
  tableData = []
  dataSource = new MatTableDataSource()
  @ViewChild(MatSort) sort:MatSort
  @ViewChild(MatPaginator) paginator:MatPaginator
  displayedColumns: string[] = ['name','atcmodel','total','ongoingaelcount','completedaelcount','ongoingaellist','recentcompletedaeldoc',
  'not updated','No Change','Somewhat change','Changed','Changed improvement','Completely changed','evolutionyearwasted','evolutionyearsaved',
  'extendedlifeimpact','totalbigopportunitiesused','totaladjustmentaware','totaladjustmentunaware'];
  routeParameters = []
  constructor(
    private route : ActivatedRoute,
    private firestore : Firestore,
    private auth : AuthguardService,
    public dataTransferService :DataTransferService,
    public router : Router
  ) {
    this.routeParameters = JSON.parse(localStorage.getItem(this.route.snapshot.queryParams['localStorageItemName']));
    console.log(this.routeParameters);
    if(this.routeParameters && this.routeParameters.length != 0){
      this.tableData = this.routeParameters.map((e:any) => {
        let element = e
        element['ongoingaellist'] = (element['ongoingaellist'] || []).map(doc => {
          let docElement = doc
          docElement['created'] = docElement['created'] ? docElement['created'].toDate() : docElement['created']['created']
          return docElement['created']
        })
        if(element['recentcompletedaeldoc']){
          element['recentcompletedaeldoc']['created'] = element['recentcompletedaeldoc']['created'] ? element['recentcompletedaeldoc']['created'].toDate()  : element['recentcompletedaeldoc']['created']
        }
        element['evolutionyearsaved'] = element['evolutionyearsaved'] ? Math.round(element['evolutionyearsaved']) : element['evolutionyearsaved']
        element['evolutionyearwasted'] = element['evolutionyearwasted'] ? Math.round(element['evolutionyearwasted']) : element['evolutionyearwasted']
        return element
      })
      this.ngAfterViewInit()
    }else{
      this.router.navigateByUrl("/")
    }
  }

  ngOnInit(): void {}

  ngOnDestroy() {
    localStorage.removeItem(this.route.snapshot.queryParams['localStorageItemName']);
    console.log('Component destroyed, localStorage cleared.');
  }
  
  ngAfterViewInit(){
    console.log(this.tableData);
    this.dataSource.data = this.tableData
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  async exportCSV(){
    var data = []
    for (let i = 0; i < this.tableData.length; i++) {
      const e = this.tableData[i];
      let currentCrossover = "";
      let prevCrossover = "";
      (e['ongoingaellist'] || []).forEach((a:any,i:number) => {
        currentCrossover = currentCrossover + `${i} -`
        for (const key in a['crossovermetric']) {
          currentCrossover = currentCrossover + ` ${key}:${a['crossovermetric'][key]['startpoint']} to ${a['crossovermetric'][key]['endpoint']} `
        }
      });
      if(e['recentcompletedaeldoc']){
        [e['recentcompletedaeldoc']].forEach((a:any,i:number) => {
          for (const key in a['crossovermetric'] ?? {}) {
            prevCrossover = prevCrossover + ` ${key}:${a['crossovermetric'][key]['startpoint']} to ${a['crossovermetric'][key]['endpoint']} `
          }
        })
      }
      data.push({
        name:e['name'],
        'atcmodel ongoing' : Array.from(new Set((e['ongoingaellist'] || []).map((a:any) => a['atcmodel']))).join(" "),
        "total" : (e['ongoingaelcount'] ?? 0) + (e['completedaelcount'] ?? 0),
        ongoing:e['ongoingaelcount'] ?? 0,  
        completed:e['completedaelcount'] ?? 0,
        'not updated(adj)': typeof(e['evolutionprogress']) === 'object'  ?  e['evolutionprogress']['not updated'] ?? 0 : 0,
        'No Change(adj)' : typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['No Change'] ?? 0 : 0,
        'Somewhat change(adj)': typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Somewhat change'] ?? 0 : 0,
        'Changed(adj)' : typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Changed'] ?? 0 : 0,
        'Changed improvement(adj)' : typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Changed improvement'] ?? 0 : 0,
        'Completely changed(adj)' : typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Completely changed'] ?? 0 : 0,
        'Potential Years' : e['evolutionyearwasted'] ? e['evolutionyearwasted'] :  0,
        'Saved Years' : e['evolutionyearsaved'] ? e['evolutionyearsaved']: 0,
        'Extended Life Impact' : e['extendedlifeimpact'] ? e["extendedlifeimpact"] :0,
        'B!G opportunities used' : e['totalbigopportunitiesused'] ? e["totalbigopportunitiesused"] :  0,
        'Total Adjustment Aware' : e['totaladjustmentaware'] ? e["totaladjustmentaware"] :  0,
        'Total Adjustment UnAware' : e['totaladjustmentunaware'] ? e["totaladjustmentunaware"] :  0,
        'current crossover' : currentCrossover,
        'previous crossover' : prevCrossover
      })
    }
    console.log(JSON.stringify(data))
    this.downloadFile(data, new Date().toDateString() + "participant evolution summary")
  }

  downloadFile(data,filename = 'data') {
    // "current crossover","previous crossover"
    let csvData = this.ConvertToCSV(data, ["name","atcmodel ongoing","total","ongoing","completed",,"not updated(adj)","No Change(adj)","Somewhat change(adj)","Changed(adj)","Changed improvement(adj)","Completely changed(adj)",
      "Potential Years","Saved Years","Extended Life Impact","B!G opportunities used","Total Adjustment Aware","Total Adjustment UnAware","current crossover","previous crossover"]);
    // console.log(csvData)
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
      dwldLink.setAttribute("target", "_blank");
    }
    dwldLink.setAttribute("href", url);
    dwldLink.setAttribute("download", filename + ".csv");
    dwldLink.style.visibility = "hidden";
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = 'Index,';

    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = (i + 1) + '';
      for (let index in headerList) {
        let head = headerList[index];
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    return str;
  }
}
