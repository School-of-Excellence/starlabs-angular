import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, getDoc } from '@angular/fire/firestore';

interface WebhookDoc {
  id: string; // the document id, e.g. "slackDevTest"
  webhookurl: string; // the "webhookurl" field value
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

  webhooks: WebhookDoc[] = [];
  loading = true;
  errorMsg = '';

  // Which row ids currently have their URL revealed
  private visibleIds = new Set<string>();

  // Inline edit state
  editingId: string | null = null;
  editUrlValue = '';
  savingEdit = false;

  // Add new webhook state
  showAddForm = false;
  newWebhookName = '';
  newWebhookUrl = '';
  savingAdd = false;

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {
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
    this.errorMsg = '';
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editUrlValue = '';
  }

  saveEdit(wh: WebhookDoc): void {
    const url = this.editUrlValue.trim();
    if (!url) {
      this.errorMsg = 'URL cannot be empty.';
      return;
    }
    this.savingEdit = true;
    const ref = doc(this.firestore, this.collectionName, wh.id);
    setDoc(ref, { webhookurl: url }, { merge: true })
      .then(() => {
        this.savingEdit = false;
        this.cancelEdit();
      })
      .catch((err) => {
        this.savingEdit = false;
        this.errorMsg = 'Failed to update: ' + err.message;
      });
  }

  // ---- Add new document ----

  openAddForm(): void {
    this.showAddForm = true;
    this.newWebhookName = '';
    this.newWebhookUrl = '';
    this.errorMsg = '';
  }

  cancelAdd(): void {
    this.showAddForm = false;
  }

  async addWebhook(): Promise<void> {
    const name = this.newWebhookName.trim();
    const url = this.newWebhookUrl.trim();
    this.errorMsg = '';

    if (!name || !url) {
      this.errorMsg = 'Both webhook name and URL are required.';
      return;
    }
    if (this.webhooks.some((w) => w.id === name)) {
      this.errorMsg = 'A webhook with this name already exists.';
      return;
    }

    this.savingAdd = true;
    try {
      const ref = doc(this.firestore, this.collectionName, name);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.errorMsg = 'A webhook with this name already exists.';
        this.savingAdd = false;
        return;
      }
      await setDoc(ref, { webhookurl: url });
      this.savingAdd = false;
      this.showAddForm = false;
    } catch (err: any) {
      this.savingAdd = false;
      this.errorMsg = 'Failed to add: ' + err.message;
    }
  }
}
