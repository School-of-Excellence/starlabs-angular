import { Component, Inject } from '@angular/core';
import { collection, doc, arrayRemove, Firestore, getDocs, deleteDoc, query, where, writeBatch } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-delete-series',
  imports: [
    MatButtonModule
  ],
  templateUrl: './delete-series.component.html',
  styleUrl: './delete-series.component.css'
})
export class DeleteSeriesComponent {

  delete = false

  constructor(private firestore : Firestore, public dialog: MatDialog, 
    public dialogRef: MatDialogRef<DeleteSeriesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any) { 
      if(this.data.delete){
        this.delete = this.data.delete
      }
    }

  ngOnInit(): void {
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
  ondelete(id: any) {
    console.log(id);
    if (this.data.delete) {
      // Delete the series document
      const seriesRef = doc(this.firestore,'series',id)
      deleteDoc(seriesRef).then(() => {
        console.log('Series document deleted successfully');
        // Delete the series reference in episodes
        const episodesRefe = collection(this.firestore,'episodes')
        const episodeQuery = query(episodesRefe,where('series', 'array-contains',seriesRef))
        getDocs(episodeQuery).then(querySnapshot => {
            const batch = writeBatch(this.firestore);
            querySnapshot.forEach(docs => {
              const episodeRef = doc(this.firestore,'series',docs.id)
              batch.update(episodeRef, {
                series: arrayRemove(doc(this.firestore,'series',id))
              });
            });
            return batch.commit();
          })
          .then(() => {
            console.log('Series reference removed from episodes');
          })
          .catch(error => {
            console.error('Error removing series reference from episodes:', error);
          });
      })
      .catch(error => {
        console.error('Error deleting series document:', error);
      });
    }
    this.dialogRef.close();
  }
  

}
