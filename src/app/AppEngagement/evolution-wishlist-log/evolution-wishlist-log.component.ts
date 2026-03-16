import { Component, Inject, OnInit } from '@angular/core';
import { Firestore,collection, query, where, getDocs,writeBatch, doc, serverTimestamp } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-evolution-wishlist-log',
  standalone:true,
  imports: [CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule],
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
    private storage: AngularFireStorage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EvolutionWishlistLogComponent>,
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    public router: Router,
  ) {  
    this.selectedProfile = dialogData;
    const q = query( collection(this.firestore, "evolutionwishlistlog"),where("status", "in", ["initiated", "sent", "sended"]));
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
      const docRef = doc(collection(this.firestore, "evolutionwishlistlog"));
      const data = {
        docid: docRef.id,
        profileid: profileid,
        type: this.selectedType,
        status: "initiated",
        created:serverTimestamp(),
      };
      batch.set(docRef, data);
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

