import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { collection, collectionGroup, doc, Firestore, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { AuthguardService } from '../../../authguard.service';
import { MarkAppointmentProcedureComponent } from '../../mark-appointment-procedure/mark-appointment-procedure.component';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-appointment-status-update',
  imports: [
    CommonModule,
    MatButtonModule,
    FormsModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatOptionModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule
  ],
  templateUrl: './appointment-status-update.component.html',
  styleUrl: './appointment-status-update.component.css'
})
export class AppointmentStatusUpdateComponent {
  // Meeting data
  meetingData: any;
  appointmentData: any;
  mapAppointment = {};

  
  // Appointment fields
  start
  end
  productType: string | null = null;
  appointmentType: string | null = null;
  loading: boolean = true;
  attended: boolean = true;
  cancelledReason:string = null
  cancelledReasonList = ["Client didn't show up", "Cancelled By Specialist", "Cancelled By Client", "Cancelled By Integrator"]
  completedProcedure: any[] = [];

  journeyData = {
    name: null,
    start: null,
    end: null,
    status: null
  }
  
  // UI state
  isUpdating: boolean = false;
  updateProgress: number = 0;
  progressText: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public firestore: Firestore,
    private datepipe: DatePipe,
    private http: HttpClient,
    private guard: AuthguardService 
  ) {
    this.guard.getAppointmentMap().then(data => this.mapAppointment = data.map)
    console.log(this.mapAppointment);
  }

  async ngOnInit() {
    // Get meeting data from URL parameters
    this.route.queryParams.subscribe(async params => {
      if (params['data']) {
        this.meetingData = JSON.parse(decodeURIComponent(params['data']));
        await this.loadAppointmentData();
        await this.performCleanupOperations();
      }
    });
  }

  private async loadAppointmentData() {    
    try {
      const appointmentId = this.meetingData.appointmentid;
      if (appointmentId) {
        const appointmentDoc = await getDoc(doc(this.firestore, 'appointments', appointmentId));
        this.appointmentData = appointmentDoc.data();
      
      }

      if(!this.appointmentData["cancelled"] && !this.appointmentData["attended"]){
        this.start = this.datepipe.transform(this.appointmentData["starttime"].toDate(), "HH:mm")
        this.end = this.datepipe.transform(this.appointmentData["endtime"].toDate(), "HH:mm")

        // Load product type
        await this.loadProductType();
        
        this.loading = false;
      }else {
        this.router.navigateByUrl('/appointmentstudio')
      }
    } catch (error) {
      console.error('Error loading appointment data:', error);
      this.loading = false;
    }
  }

  private async loadProductType() {
    try {
      const productCollection = collection(this.firestore, "products");
      const productSnapshot = await getDocs(productCollection);
      
      for (const productDoc of productSnapshot.docs) {
        const productData = productDoc.data();
        const productName = productData["product"].toLowerCase().replace(" ", "").trim();
        this.appointmentData['appointmenttype'] = this.mapAppointment[this.appointmentData["appointment"].id]
        const appointmentName = this.appointmentData["appointmenttype"].toLowerCase().replace(" ", "").trim();
        console.log(appointmentName, 'appointmentName');
        
        
        if (productName.includes(appointmentName) && (productData["atcmodel"] ?? "").trim().length !== 0) {
          this.productType = productData["atcmodel"];
          break;
        }
      }
      
      console.log("Product Model", this.productType);
    } catch (error) {
      console.error('Error loading product type:', error);
    }
  }

  canSubmit(): boolean {
    if (!this.attended && !this.cancelledReason) {
      return false;
    }
    return true;
  }


  async submit() {
    console.log(this.attended, this.cancelledReason);
    this.isUpdating = true;
   
    console.log(this.attended, this.journeyData.status)
    this.loading = true
    await this.markProcedure()
    this.loading = false
  }

  async markProcedure(){
    var ischangeworkrequired = this.appointmentData["appointmenttype"] ? this.appointmentData["appointmenttype"]["ischangeworkrequired"] : false
    if(ischangeworkrequired && this.attended){
      var procedureStatus = this.dialog.open(MarkAppointmentProcedureComponent,{
        data: {
          profileid: this.appointmentData["bookedby"].id,
          specialist: this.appointmentData["hostpath"].map(e => doc(this.firestore, e).id),
          product: this.productType
        },
        height: "90vh",
        width: "90vw"
      })
      procedureStatus.afterClosed().toPromise().then(data=>{
        console.log(data)
        if(data != null){
          this.completedProcedure = data
          this.updateAppointmentStatus()
        }
      })
    }
    else{
      this.updateAppointmentStatus()
    }
  }

  async updateAppointmentStatus(){
    var splitStart = this.start.split(":")
    var newStart = new Date(new Date(this.appointmentData["starttime"].toDate()).setHours(splitStart[0], splitStart[1]))
    var splitEnd = this.end.split(":")
    var newEnd = new Date(new Date(this.appointmentData["endtime"].toDate()).setHours(splitEnd[0], splitEnd[1]))
    console.log(newStart)
    console.log(newEnd)
    var totalMinutes = ((newEnd.getHours()*60 + newEnd.getMinutes()) - (newStart.getHours()*60 + newStart.getMinutes()))

    var appointmentDoc = doc(this.firestore, "appointments/"+this.appointmentData["docid"])
    await updateDoc(appointmentDoc, {
      attended: this.attended,
      cancelled: !this.attended,
      cancelledon: !this.attended ? serverTimestamp() : null, 
      cancelledreason: !this.attended ? this.cancelledReason : null,
      appointmentstart: newStart,
      appointmentend: newEnd,
      totalminutes: totalMinutes
    })
    var apptStatus = this.attended ? "completed" : "ready"
    await this.guard.updateDeliveryStatus(doc(this.firestore, "appointments/"+this.appointmentData["docid"]).path, apptStatus, {eventRequestRef: null}).then(()=> {
      alert("status updated successfully")
    })

    var batch = writeBatch(this.firestore)
    for (let i = 0; i < this.completedProcedure.length; i++) {
      const procedure = this.completedProcedure[i];
      var procedureDoc = doc(this.firestore, procedure.procedurepath)
      batch.update(procedureDoc, {
        status: "completed",
        autogenralized: procedure.autogenralized
      })
    }
    if(this.completedProcedure.length != 0){
      await batch.commit()
    }
    this.router.navigateByUrl('/appointmentstudio')
  }

  private async performCleanupOperations(): Promise<void> {
    
    const email = this.meetingData?.hostemail;
    if (!email) {
      console.log('❌ No host email found');
      this.updateProgress = 100;
      return;
    }

    try {
      // Update zoom account
      const accountQuery = query(
        collection(this.firestore, 'zoomaccount'),
        where("email", "==", email.toLowerCase())
      );
      
      const accountSnapshot = await getDocs(accountQuery);
      const accountUpdatePromises = accountSnapshot.docs.map(async (docSnapshot) => {
        try {
          await updateDoc(docSnapshot.ref, { inuse: false });
          console.log('✅ Updated zoom account:', docSnapshot.ref.path);
        } catch (err) {
          console.error('❌ Error updating zoom account:', err);
        }
      });
      
      await Promise.all(accountUpdatePromises);
      this.updateProgress = 85;

      this.progressText = 'Updating logs...';

      // Update logs
      const logsQuery = query(
        collectionGroup(this.firestore, "logs"), 
        where("zoomdata.host_email", "==", email)
      );
      
      const logsSnapshot = await getDocs(logsQuery);
      const logsUpdatePromises = logsSnapshot.docs.map(async (docSnapshot) => {
        try {
          await updateDoc(docSnapshot.ref, { read: true })
          console.log('✅ Updated log:', docSnapshot.ref.path);
        } catch (err) {
          console.error('❌ Error updating log:', err);
        }
      });
      
      await Promise.all(logsUpdatePromises);
      this.updateProgress = 100;
      this.progressText = 'Completed successfully!';
      
      console.log('✅ Cleanup operations completed successfully');
    } catch (error) {
      console.error('❌ Error in cleanup operations:', error);
      throw error;
    }
  }
}