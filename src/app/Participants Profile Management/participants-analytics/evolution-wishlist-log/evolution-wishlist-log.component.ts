import { NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { Firestore, query, where,getDocs, writeBatch, doc , serverTimestamp, collection} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { AuthguardService } from '../../../authguard.service';
import { Storage } from '@angular/fire/storage';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

@Component({
  selector: 'app-evolution-wishlist-log',
  imports: [
    MatProgressBarModule,
    MatButtonModule,
    NgIf,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule
  ],
  templateUrl: './evolution-wishlist-log.component.html',
  styleUrl: './evolution-wishlist-log.component.css'
})
export class EvolutionWishlistLogComponent {
   selectedProfile = []
  loading = true
  filteredProfile = []
  selectedType:string ='';

  constructor(
    public firestore: Firestore, 
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EvolutionWishlistLogComponent>,
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    public router: Router,
  ) {  
    this.selectedProfile = dialogData;
    
    const collRef = collection(this.firestore,"evolutionwishlistlog")
    const q = query(collRef,where("status", "in", ["initiated","sent","sended"]))
    getDocs(q).then(report => {
      console.log("Total wishlist", report.size);      
      const wishlistProfiles = new Set();
      report.docs.forEach(doc => {
        const data = doc.data();
        wishlistProfiles.add(data['profileid']);
      });
      this.filteredProfile = this.selectedProfile.filter(profileId => 
        !wishlistProfiles.has(profileId)
      );
      console.log("Filtered Profiles:", this.filteredProfile);
      this.loading = false
    })
  }

  ngOnInit(): void {
    console.log("evolution mapping profiles",this.dialogData); 
  }
  async createLog() {
    console.log(this.filteredProfile);
    if (!this.selectedType) { 
      alert('Select the type');
      return;
    }
    const batch = writeBatch(this.firestore);
    for (const profileid of this.filteredProfile) {
      const docId = doc(collection(this.firestore,"evolutionwishlistlog")).id;
      const data = {
        docid: docId,
        profileid: profileid,
        type: this.selectedType,
        status: "initiated",
        created: serverTimestamp(),
      };
      batch.set(doc(this.firestore,"evolutionwishlistlog",docId), data);
    }
  
    this.loading = true;
    try {
      await batch.commit();
      this.dialogRef.close();
    } catch (error) {
      console.error("Error saving wishlist log:", error);
      alert("Failed to save wishlist log. Please try again.");
    }
    this.loading = false;
  }
}
