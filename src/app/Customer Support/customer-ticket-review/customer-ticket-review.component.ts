import { Component, Inject } from '@angular/core';
import { doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-customer-ticket-review',
  imports: [
    MatButtonModule,
  ],
  templateUrl: './customer-ticket-review.component.html',
  styleUrl: './customer-ticket-review.component.css'
})
export class CustomerTicketReviewComponent {
  selectedValue;

  constructor(
    public dialogRef: MatDialogRef<CustomerTicketReviewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore
  ) {
   }

  ngOnInit(): void {

  }

  // function to add rating for closed tickets 
  async addRating() {
    const clientissueDoc = doc(this.firestore,'clientissue',this.data.data['id'])
    if(this.data.type == 'happinessindex') {
      await updateDoc(clientissueDoc,{
        happinessindex: this.selectedValue
      }).then(()=>{
        this.dialogRef.close();
      }).catch((error)=>{
        console.log('error',error);
      });
    } else if(this.data.type == 'validator') {
      await updateDoc(clientissueDoc,{
        validator: this.selectedValue
      }).then(()=>{
        this.dialogRef.close();
      }).catch((error)=>{
        console.log('error',error);
      });
    }
  }
}
