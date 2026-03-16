import { Component, OnInit } from '@angular/core';
import { Firestore, collection, getDocs ,doc, getDoc} from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-view-upgraded-atc',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
  ],
  templateUrl: './view-upgraded-atc.component.html',
  styleUrls: ['./view-upgraded-atc.component.css']
})
export class ViewUpgradedAtcComponent implements OnInit {
  profileID:string
  profileRoles:string
  atcdata: {
  status?: string;
  atcref?: any;
  author?: { id: string }[];
  validator?: { id: string }[];
  prescription?: any[];
  prescription_date?: any;
  [key: string]: any; 
  } = {};
  mapProcedures = {}
  mapProfile = {}
  get loading(){
    return this.matdialog.open(LoadingProgressComponent,{
      data:{msg: 'Fetching data please wait ....'}
    })
  }
  constructor(
    public firestore: Firestore, 
    public router: Router, 
    public guard: AuthguardService, 
    public matdialog: MatDialog,
    private route : ActivatedRoute
  ){
    let loading = this.loading
    guard.getRoles().then(async roles=>{
      this.profileID = roles.profile_ref.id
      this.profileRoles = roles
      // if(this.profileRoles["ah"] || this.profileRoles["admin"] || this.profileRoles["developer"] || this.profileRoles["mentor"]){
        this.route.queryParams.subscribe(async context => {
          if(context['atcpath']){
            guard.getProfileMap().then(e => this.mapProfile = e.map)
            getDoc(doc(this.firestore, context['atcpath'])).then(async atcsnap => {
            const atcelement = atcsnap.exists() ? atcsnap.data() : null;
            atcelement['atcref'] = doc(this.firestore, context['atcpath']);
            if (atcelement != null) {
              const atcElementRef = doc(this.firestore, context['atcpath']);
                atcelement['prescription'] = []
                await getDocs(collection(atcElementRef, "corrections")).then(async correctionsnap => {
                  for (let j = 0; j < correctionsnap.docs.length; j++) {
                    const correctionelement = correctionsnap.docs[j].data();
                    const correctionElementRef = correctionsnap.docs[j].ref
                    correctionelement['procedures'] = []
                    await getDocs(collection(correctionElementRef, "procedures")).then(async proceduresnap => {
                      for (let k = 0; k < proceduresnap.docs.length; k++) {
                        const procedureelement = proceduresnap.docs[k].data();
                        correctionelement['procedures'].push(procedureelement)
                      }
                    })
                    atcelement['prescription'].push(correctionelement)
                  }
                })
              }
              console.log("close");
              this.atcdata = atcelement
              loading.close()
            })
            //getproceduresname
            const proceduresRef = collection(this.firestore, 'procedures');
            const snap = await getDocs(proceduresRef);
              for (let i = 0; i < snap.docs.length; i++) {
                const element = snap.docs[i].data();
                const elementid = snap.docs[i].id
                this.mapProcedures[elementid] = element['name']
              }
          }else{
            loading.close()
            this.navigateToHome()
          }
        })
      // }else{
      //   loading.close()
      //   this.navigateToHome()
      // }
    }).catch(err=>{
      console.log(err)
    })
  }

  ngOnInit(): void {}
  navigateToHome(){
    console.log("navigating to home ");
    this.router.navigateByUrl("/")
  }

}
