import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { collection, doc, getFirestore, setDoc } from '@angular/fire/firestore';
// Same environment file the workshop dashboard has always used for these send paths (kept as-is on purpose:
// moving the code must not change where it sends).
import { environment } from '../../../../environments/environment.development';
import { SnackbarService } from '../../../shared/snackbar.service';
import { AuthguardService } from '../../../authguard.service';
import { EmailInputComponent } from '../../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../../whatsapp-progress-dialog.component';

/**
 * The side panel's three send paths — Email, WhatsApp, in-app Notification — shared by the workshop
 * dashboard (its side panel and Communication dialog) and the Engagement dashboard v2 (operator 2026-11-03).
 * Moved here unchanged from WorkshopDashboardComponent so every screen opens the same composers and sends
 * the same way. Recipients are `{ profileid, name, metadata }` entries; metadata carries email, name,
 * phonenumber and countryCode / countrycode. Access checks stay with the caller.
 */
@Injectable({ providedIn: 'root' })
export class CommunicationSendersService {
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);
  private snackbarService = inject(SnackbarService);
  private guard = inject(AuthguardService);
  private firestoreDefault = getFirestore();

  private readonly WHATSAPP_CHUNK_SIZE = 200;
  private readonly CHUNK_DELAY_MS = 1000;

  // ============ Email composer (same flow as participants-analytics) ============
  /** Flattens { profileid, name, metadata } entries into what EmailInputComponent reads. */
  toEmailRecipients(list: any[]): any[] {
    return (list || [])
      .filter(p => p?.['metadata']?.['email'])
      .map(p => ({
        ...p['metadata'],
        profileid: p['profileid'],
        name: p['name'] || p['metadata']?.['name'],
        email: p['metadata']?.['email'],
      }));
  }

  /** Email — opens the email composer for everyone in `list` who has an address. */
  email(list: any[]) {
    return this.sendEmailTo(this.toEmailRecipients(list));
  }

  private sendEmailTo(recipients: any[]) {
    if (recipients.length === 0) {
      this.snackbarService.show('No valid recipients found');
      return;
    }

    const dialogRef = this.dialog.open(EmailInputComponent, {
      data: recipients,
      minWidth: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result != null && result != undefined) {
        const docRef = doc(collection(this.firestoreDefault, 'email archive'), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.snackbarService.show(result['status'] == 'queued' ? 'Successfully Added to Queue' : 'Email Sent Successfully');
          }).catch(err => {
            console.log(err);
            this.snackbarService.show('Error Sending Email');
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail';
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail';
          }
          const data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url!, JSON.stringify(data), {
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log('Error: ' + err);
            }
          });
        }
      }
    });
  }

  /** WhatsApp — the template composer, then the chunked send with its progress dialog. */
  async whatsapp(list: any[]) {
    const { SendmessagesComponent } = await import('../sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleWhatsappChunked(result, list);
    });
  }

  private async handleWhatsappChunked(result: any, list: any[]) {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      return;
    }

    const { templateName, customParams } = result;
    const participants = list
      .filter(participant => {
        const metadata = participant['metadata'];
        return metadata && metadata['phonenumber'] && metadata['name'];
      })
      .map(participant => {
        const metadata = participant['metadata'];
        const name = metadata['name'];
        let cc = metadata['countryCode'] || metadata['countrycode'] || '';
        cc = cc.trim();
        if (cc && !cc.startsWith('+')) cc = '+' + cc;
        let phone = metadata['phonenumber']?.toString().trim() || '';
        phone = phone.replace(/^\+/, '');
        const phonenumber = cc ? `${cc}${phone}` : phone;
        const processedParams = customParams.map((param: any) => ({
          name: param.name,
          value: param.value.replace(/\{\{name\}\}/g, name)
        }));
        return { profileid: participant['profileid'], phonenumber, name, customParams: processedParams };
      });

    if (participants.length === 0) {
      this.snackbarService.show('No valid participants found');
      return;
    }

    const progressDialog = this.dialog.open(WhatsappProgressDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        totalParticipants: participants.length,
        templateName: templateName
      } as WhatsAppProgressData
    });
    const progressComponent = progressDialog.componentInstance;
    const chunks = this.chunkArray(participants, this.WHATSAPP_CHUNK_SIZE);
    const totalChunks = chunks.length;
    progressComponent.updateProgress({ totalChunks });

    let totalSuccess = 0;
    let totalFailed = 0;
    let allErrors: string[] = [];
    let isCancelled = false;
    const cancelSubscription = progressComponent.cancel$.subscribe(() => {
      isCancelled = true;
    });

    const url = this.getCloudFunctionUrl('workshopprogressmessage');
    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) {
        console.log('Sending cancelled by user');
        break;
      }

      const chunk = chunks[i];
      const chunkIndex = i + 1;

      progressComponent.updateProgress({
        currentChunk: chunkIndex,
        isProcessingChunk: true
      });

      try {
        const chunkPayload = {
          type: 'whatsapp',
          templateName,
          participants: chunk,
          chunkInfo: {
            chunkIndex,
            totalChunks,
            chunkSize: chunk.length
          }
        };

        const response = await firstValueFrom(
          this.http.post<any>(url, chunkPayload, { responseType: 'json' })
        );

        console.log(`Chunk ${chunkIndex}/${totalChunks} response:`, response);
        const chunkSuccess = response.successCount || chunk.length;
        const chunkFailed = response.failureCount || 0;
        totalSuccess += chunkSuccess;
        totalFailed += chunkFailed;
        if (response.errors && Array.isArray(response.errors)) {
          allErrors = [...allErrors, ...response.errors];
        }

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: response.errors || [],
          watiErrors: response.watiErrors || []
        });

      } catch (error: any) {
        console.error(`Failed to send chunk ${chunkIndex}:`, error);
        totalFailed += chunk.length;
        const errorMessage = `Chunk ${chunkIndex} failed: ${error.message || 'Unknown error'}`;
        allErrors.push(errorMessage);

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: [errorMessage]
        });
      }
      if (i < chunks.length - 1 && !isCancelled) {
        await this.delay(this.CHUNK_DELAY_MS);
      }
    }
    cancelSubscription.unsubscribe();

    let finalStatus: 'success' | 'partial' | 'error';
    if (isCancelled) {
      finalStatus = totalSuccess > 0 ? 'partial' : 'error';
    } else if (totalFailed === 0) {
      finalStatus = 'success';
    } else if (totalSuccess > 0) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'error';
    }
    progressComponent.complete(finalStatus);
    const dialogResult = await firstValueFrom(progressDialog.afterClosed());
    console.log('Final sending result:', dialogResult);
  }

  /** In-app notification — the A&H Update composer, then one notification record for everyone in `list`. */
  async notification(list: any[]) {
    const { AhNotificationComponent } = await import(
      '../../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
      data: list
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result != null && result != undefined) {
        var profileID = list.map(p => p.profileid);
        var notificationimage = null;
        if (result["notificationimage"] != null) {
          const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
          const { getStorage } = await import('firebase/storage');
          const { getApp } = await import('firebase/app');
          const storage = getStorage(getApp());
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(storage, filepath);
            const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (error) {
            console.log('file upload error', error);
          }
        }
        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(() => {
          alert("A&H Update sent to App user " + profileID.length.toString());
        });
      }
    });
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCloudFunctionUrl(functionName: string): string {
    const projectId = environment.firebase.projectId;
    const projectUrlMap: Record<string, string> = {
      'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
      'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
      'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
    };
    return projectUrlMap[projectId] || '';
  }
}
