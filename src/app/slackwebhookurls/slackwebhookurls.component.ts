import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp } from '@angular/fire/firestore';
import { AuthguardService } from '../authguard.service';

interface WebhookDoc {
  id: string; // the document id
  webhookurl: string; // URL only
  channel: string; // name of the slack channel
  webhooktype: 'form' | 'standard'; // how the doc id was chosen
  docid?: string; // stored copy of the document id
  createdby?: string; // logged in profileid, set on create
  editedby?: string; // logged in profileid, set on each edit
}

interface DeliveryForm {
  id: string; // the delivery forms document id
  formname: string; // the "formname" field value
}

@Component({
  selector: 'app-slackwebhookurls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './slackwebhookurls.component.html',
  styleUrls: ['./slackwebhookurls.component.css'],
})
export class SlackwebhookurlsComponent implements OnInit {
  // Matches the collection name shown in the Firestore console
  private collectionName = 'slack webhookurls';
  private formsCollectionName = 'delivery forms';

  webhooks: WebhookDoc[] = [];
  loading = true;
  errorMsg = '';

  // Delivery forms — loaded once on screen entry, used for both the
  // "Integrate Form" dropdown and mapping a form docid to its formname in the table.
  forms: DeliveryForm[] = [];
  private formNameById = new Map<string, string>();

  // Which row ids currently have their URL revealed
  private visibleIds = new Set<string>();

  // Inline edit state
  editingId: string | null = null;
  editUrlValue = '';
  editChannelValue = '';
  savingEdit = false;
  deletingId: string | null = null;

  // Add new webhook state
  showAddForm = false;
  newWebhookType: 'form' | 'standard' | '' = '';
  newWebhookName = ''; // typed doc id when type is "standard"
  selectedFormId = ''; // chosen form doc id when type is "form"
  newWebhookUrl = '';
  newWebhookChannel = '';
  savingAdd = false;

  loggedinProfileid = null

  constructor(public firestore: Firestore, public guard: AuthguardService) {
    guard.getRoles().then(async (roles) => {
      this.loggedinProfileid = roles['profile_ref'].id ?? null
    })
  }

  ngOnInit(): void {
    this.loadForms();

    const ref = collection(this.firestore, this.collectionName);
    collectionData(ref, { idField: 'id' }).subscribe({
      next: (docs) => {
        this.webhooks = (docs as WebhookDoc[]).sort((a, b) =>
          a.id.localeCompare(b.id)
        );
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load webhooks: ' + err.message;
        this.loading = false;
      },
    });
  }

  // ---- Delivery forms ----

  private async loadForms(): Promise<void> {
    try {
      const snap = await getDocs(collection(this.firestore, this.formsCollectionName));
      this.forms = snap.docs
        .map((d) => ({ id: d.id, formname: (d.data() as any)?.formname ?? '' }))
        .sort((a, b) => a.formname.localeCompare(b.formname));
      this.formNameById = new Map(this.forms.map((f) => [f.id, f.formname]));
    } catch (err: any) {
      this.errorMsg = 'Failed to load delivery forms: ' + err.message;
    }
  }

  // Webhook name shown in the table: standard -> docid as-is, form -> mapped formname.
  webhookName(wh: WebhookDoc): string {
    if (wh.webhooktype === 'form') {
      return (this.formNameById.get(wh.id) ?? wh.id) + " (Form)";
    }
    return wh.id;
  }

  // ---- Show/hide URL ----

  isVisible(id: string): boolean {
    return this.visibleIds.has(id);
  }

  toggleVisibility(id: string): void {
    if (this.visibleIds.has(id)) {
      this.visibleIds.delete(id);
    } else {
      this.visibleIds.add(id);
    }
  }

  maskUrl(url: string): string {
    return '*'.repeat(Math.min(url.length, 28)) || '********';
  }

  // ---- Edit existing row ----

  startEdit(wh: WebhookDoc): void {
    this.editingId = wh.id;
    this.editUrlValue = wh.webhookurl;
    this.editChannelValue = wh.channel ?? '';
    this.errorMsg = '';
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editUrlValue = '';
    this.editChannelValue = '';
  }

  saveEdit(wh: WebhookDoc): void {
    const url = this.editUrlValue.trim();
    const channel = this.editChannelValue.trim();
    if (!url) {
      this.errorMsg = 'URL cannot be empty.';
      return;
    }
    if (!channel) {
      this.errorMsg = 'Channel cannot be empty.';
      return;
    }
    this.savingEdit = true;
    const ref = doc(this.firestore, this.collectionName, wh.id);
    setDoc(
      ref,
      {
        webhookurl: url,
        channel,
        editedby: this.loggedinProfileid,
        editedon: serverTimestamp(),
      },
      { merge: true }
    )
      .then(() => {
        this.savingEdit = false;
        this.cancelEdit();
      })
      .catch((err) => {
        this.savingEdit = false;
        this.errorMsg = 'Failed to update: ' + err.message;
      });
  }

  // ---- Delete row ----

  async deleteWebhook(wh: WebhookDoc): Promise<void> {
    const ok = confirm(`Delete webhook "${this.webhookName(wh)}"? This cannot be undone.`);
    if (!ok) {
      return;
    }
    this.deletingId = wh.id;
    this.errorMsg = '';
    try {
      await deleteDoc(doc(this.firestore, this.collectionName, wh.id));
      this.deletingId = null;
    } catch (err: any) {
      this.deletingId = null;
      this.errorMsg = 'Failed to delete: ' + err.message;
    }
  }

  // ---- Add new document ----

  openAddForm(): void {
    this.showAddForm = true;
    this.newWebhookType = '';
    this.newWebhookName = '';
    this.selectedFormId = '';
    this.newWebhookUrl = '';
    this.newWebhookChannel = '';
    this.errorMsg = '';
  }

  cancelAdd(): void {
    this.showAddForm = false;
  }

  async addWebhook(): Promise<void> {
    const type = this.newWebhookType;
    const url = this.newWebhookUrl.trim();
    const channel = this.newWebhookChannel.trim();
    this.errorMsg = '';

    if (type !== 'form' && type !== 'standard') {
      this.errorMsg = 'Please choose a webhook type.';
      return;
    }
    if (!url || !channel) {
      this.errorMsg = 'webhookurl and channel are required.';
      return;
    }

    // Resolve the document id (the webhook name) from the chosen type.
    let docId = '';
    if (type === 'standard') {
      docId = this.newWebhookName.trim();
      if (!docId) {
        this.errorMsg = 'Please enter a webhook name.';
        return;
      }
    } else {
      docId = this.selectedFormId;
      if (!docId) {
        this.errorMsg = 'Please choose a form.';
        return;
      }
    }

    if (this.webhooks.some((w) => w.id === docId)) {
      this.errorMsg = 'A webhook with this name already exists.';
      return;
    }

    this.savingAdd = true;
    try {
      const ref = doc(this.firestore, this.collectionName, docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.errorMsg = 'A webhook with this name already exists.';
        this.savingAdd = false;
        return;
      }
      await setDoc(ref, {
        webhookurl: url,
        channel,
        webhooktype: type,
        docid: docId,
        createdby: this.loggedinProfileid,
        createdon: serverTimestamp(),
        editedby: this.loggedinProfileid,
        editedon: serverTimestamp(),
      });
      this.savingAdd = false;
      this.showAddForm = false;
    } catch (err: any) {
      this.savingAdd = false;
      this.errorMsg = 'Failed to add: ' + err.message;
    }
  }
}
