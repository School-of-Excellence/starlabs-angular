import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import {Firestore,collection, doc, writeBatch, serverTimestamp} from '@angular/fire/firestore';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common'; 
import { MatOptionModule } from '@angular/material/core';  
import { ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-review-participant-ael',
  standalone: true,
  imports:[MatSelectModule,
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    MatOptionModule,
    FormsModule,],
  templateUrl: './review-participant-ael.component.html',
  styleUrls: ['./review-participant-ael.component.css']
})
export class ReviewParticipantAELComponent implements OnInit {
  levelList = []
  reviewAEL = []
  loggedinProfile: string = '' 
  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    public dialogref: MatDialogRef<any>,
    public firestore: Firestore,
    public guard: AuthguardService
  ) {
    this.levelList = dialogData["level"]
    this.reviewAEL = dialogData["selectedAEL"]
    for (let i = 0; i < this.reviewAEL.length; i++) {
      const ael = this.reviewAEL[i];
      ael["originalmetric"] = ael["crossovermetric"] ?? {}
      var crossoverMetric = ael["crossovermetric"] ?? {}
      Object.keys(crossoverMetric).forEach(key =>{
         if (!ael["crossovermetric"][key]["displayValue"]) {
          ael["crossovermetric"][key]["displayValue"] = 
            ael["crossovermetric"][key]["startpoint"] + "---" + ael["crossovermetric"][key]["endpoint"]
        }
      })
      ael["crossoverList"] = Object.keys(crossoverMetric).map(key => ({
       key, value: crossoverMetric[key]
      }));
    }
  }
  
  async ngOnInit(): Promise<void> {
    try {
      const roles = await this.guard.getRoles();
      this.loggedinProfile = roles["profile_ref"].id;
      console.log("Logged in profile:", this.loggedinProfile);
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  }

  close(){
    this.dialogref.close()
  }

  async submit() {
    console.log(this.reviewAEL);
    const batch = writeBatch(this.firestore);
    const crossoverCollection = collection(this.firestore, 'interim crossover');

    var reviewed = false

    for (let i = 0; i < this.reviewAEL.length; i++) {
      const participantAEL = this.reviewAEL[i];
      const newDocRef = doc(crossoverCollection);
      const crossoverdata = {
        docid: newDocRef.id,
        aelid: participantAEL["docid"],
        created: serverTimestamp(),
        metric: {},
        profileid: participantAEL["profileid"],
        validatedby: this.loggedinProfile
      };

      Object.keys(participantAEL["crossovermetric"]).forEach(key => {
        const metric = participantAEL["crossovermetric"][key];
        var original = participantAEL["originalmetric"][key]
        let startpoint = metric["startpoint"];
        let endpoint = metric["endpoint"];
        if (metric["displayValue"]) {
          const parts = metric["displayValue"].split("---");
          if (parts.length === 2) {
            startpoint = parts[0].trim();
            endpoint = parts[1].trim();
          }
        }
        crossoverdata.metric[key] = {
          startpoint,
          endpoint,
          metric: metric["metric"] ?? null
        };
        if(original["startpoint"] != startpoint || original["endpoint"] != endpoint){
          reviewed = true
        }
      });
      batch.set(newDocRef, crossoverdata);

      var newAELdata = {
        "status": "ongoing",
        "flag": "validated",
        "tentativestart": participantAEL["created"],
        "crossovermetric": crossoverdata.metric,
        "validatedby": this.loggedinProfile
      };
      if(reviewed){
        newAELdata["updated"] = true
      }
      batch.update(doc(this.firestore, "participant AEL", crossoverdata.aelid), newAELdata)
      console.log(newAELdata, crossoverdata)
    }

    try {
      await batch.commit();
      this.dialogref.close();
    } catch (error) {
      console.error(" Error during batch commit:", error);
    }
  }
}
