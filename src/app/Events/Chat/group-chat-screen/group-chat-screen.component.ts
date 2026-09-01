import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Firestore, CollectionReference, collection, collectionData, collectionSnapshots, doc, getDocs,
  query, where, orderBy, getDoc, setDoc, updateDoc, serverTimestamp, arrayRemove, arrayUnion, deleteField,
  startAt, endAt, startAfter, limit,
} from '@angular/fire/firestore';
import { writeBatch } from 'firebase/firestore';
import { Storage } from '@angular/fire/storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { NavDrawerService } from '../../../nav-drawer.service';
import { AddIssueComponent } from '../../../Customer Support/add-issue/add-issue.component';
import { ChannelCommunicationComponent } from '../../../Channel Communication/channel-communication/channel-communication.component';
import { ChatAudioComponent } from './audio-player.component';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface Member { id: string; name: string; journey?: string | null; }

/** A file chosen in the composer but not yet uploaded. */
export interface PendingFile {
  file: File; name: string; size: number; mime: string;
  type: Attachment['type'];
  /** Object URL for image/video previews; revoked when the file is removed or sent. */
  previewUrl?: string;
}

export interface Attachment {
  type: 'image' | 'video' | 'voice' | 'file';
  dataUrl: string;
  name?: string;
  size?: number;
  duration?: number;
  /** Original filetype/mediatype as stored, so <audio>/<video> can be given a type hint. */
  mime?: string;
}

export interface Receipt { name: string; at: string; }

export interface Seg { kind: 'text' | 'bold' | 'link' | 'mention'; text: string; href?: string; }
export interface Block { type: 'p' | 'ul' | 'ol'; segs?: Seg[]; items?: Seg[][]; }
export interface Cta { label: string; href: string; }
export interface Parsed { blocks: Block[]; ctas: Cta[]; }

export interface ChatMessage {
  id: string;
  from: 'team' | 'member';
  senderName: string;
  text: string;
  at: string;
  kind?: 'announcement';
  pinned?: boolean;
  edited?: boolean;
  editedAt?: string;
  attachment?: Attachment;
  replyTo?: {
    senderName: string;
    text: string;
    /** `reply_to.messageid` — the message this one answers, for tap-to-jump. */
    messageId?: string;
    senderUid?: string;
    /** First file on the quoted message, for the thumbnail. */
    thumbUrl?: string;
    isMedia?: boolean;
  };
  reactions?: { [emoji: string]: string[] };
  mentions?: string[];
  readBy?: Receipt[];
  deliveredTo?: Receipt[];
  /** Every file on the message; `attachment` stays the first one for the side panels. */
  attachments?: Attachment[];
  /** Firestore doc ref when this message came from `supportchat/{id}/messages`. */
  _ref?: any;
  /** `buttons` on the doc — [{label,url}], the same field channel broadcasts use. */
  buttons?: Cta[];
  /** Raw stored `message` and `files`, needed verbatim when this message is quoted in a reply. */
  _rawMessage?: string;
  _files?: any[];
  /** Sender / reader uids, kept so names can be re-resolved when profile_data arrives late. */
  _senderUid?: string;
  _readerUids?: string[];
  /**
   * Channel broadcasts only. The broadcast job writes a rich card rather than a chat line:
   * an optional header image/video, an HTML body, file cards, link chips, CTA buttons and a
   * footer — plus the profile-doc-id audiences that drive the delivery panel.
   */
  _broadcast?: Broadcast;
  /** First message of a same-sender run — the only one that shows the avatar and the name. */
  _runStart?: boolean;
  /** Set on the first message of each day; renders the sticky date separator above it. */
  _dayLabel?: string;
  // template-side parse cache
  _parsedFor?: string;
  _parsed?: Parsed;
}

/** The `supportchat/{channelId}/messages` shape written by the channel broadcast job. */
export interface Broadcast {
  html: string;
  headerType: string | null;
  headerValue: string | null;
  footer: string | null;
  files: { name: string; url: string }[];
  links: { label: string; url: string }[];
  /** All three are profile_data DOC IDS, not uids — channels address people by profile. */
  sentTo: string[];
  readBy: string[];
  pending: string[];
}

export interface DeletedEntry {
  id: string; kind: string; name: string;
  sentBy: string; sentAt: string; deletedBy: string; deletedAt: string;
}

export interface ChatItem {
  id: string;
  name: string;
  emoji?: string;
  /** `group_profile` from Firestore — the real group picture, shown instead of the emoji. */
  photoUrl?: string | null;
  description?: string;
  category?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  createdBy?: string;
  members?: Member[];
  followers?: number;
  messages: ChatMessage[];
  lastMessage: string;
  lastAt: string;
  unread: number;
  deletedLog: DeletedEntry[];
  archived?: boolean;
  /** `pinned` on the supportchat doc — chat-screen's existing chat-pin flag. */
  pinned?: boolean;
  /** `group_admin` — uids (same identifier as `members`) allowed to administer the group. */
  adminUids?: string[];
  _coll?: string;
  _kind?: 'group' | 'channel';
  /** True for a group backed by Firestore (`supportchat`), false for the static demo rows. */
  _live?: boolean;
  /** Firestore doc ref for a live group. */
  _ref?: any;
  /** Member uids exactly as stored on the doc — names are resolved through `profile_data`. */
  _memberUids?: string[];
  /**
   * Channels store `members` as profile_data doc ids, not uids (see ChannelCommunication's
   * createChannel). Kept separately so nothing mistakes one identifier for the other.
   */
  _memberProfileIds?: string[];
  /** `admins` on a channel doc — profile doc ids allowed to broadcast. */
  _channelAdmins?: string[];
  _creatorUid?: string;
}

export interface Person {
  id: string; name: string;
  journey?: string | null; photoUrl?: string | null; role?: string;
  source?: 'team' | 'participant';
  email?: string; phone?: string; city?: string; status?: string;
  mode?: string; marathon?: string; joinDate?: string; subscriptionEnd?: string; payment?: string;
}

export interface Ticket {
  id: string; issueNumber: string; title: string;
  category: string; categoryLabel: string; priority: string; status: string;
  participantName: string; participantId?: string | null; journey?: string | null;
  notes?: string; date: string; raisedBy?: string;
  source?: string; sourceChat?: string; sourceMessageId?: string; sourceMessageText?: string;
}

export interface ParticipantEvent {
  id: string; participantName?: string; participantId?: string;
  eventName?: string; eventDate?: string; status?: string; mainMode?: string;
}

export interface EventRef { id: string; title: string; }

type TabKey = 'groups' | 'channels' | 'archived';

interface Features {
  sender: boolean; reply: boolean; react: boolean;
  oneWay: boolean; info: boolean; attach: boolean; readOnly: boolean;
}

interface MentionOption {
  name: string; display: string; sub: string; team?: boolean;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const JOURNEY_META: { [k: string]: { label: string; full: string; bg: string; color: string } } = {
  up:  { label: 'uP!', full: 'uP!',                bg: '#E8F5FC', color: '#0076C8' },
  lyl: { label: 'LYL', full: 'Launch Your Legacy', bg: '#FAE5F2', color: '#BE1484' },
  big: { label: 'B!G', full: 'B!G',                bg: '#EFE3F7', color: '#6D029A' },
};
const SENDER_COLORS = ['#D4537E', '#1D9E75', '#378ADD', '#BA7517', '#7F77DD', '#993C1D', '#0284C7', '#BE1484'];
const CTA_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const MENTION_TOKEN_RE = /@([A-Za-z]*(?: [A-Za-z]*)?)$/;

@Component({
  selector: 'app-group-chat-screen',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, ChatAudioComponent],
  templateUrl: './group-chat-screen.component.html',
  styleUrl: './group-chat-screen.component.css'
})
export class GroupChatScreenComponent implements OnInit, AfterViewInit, OnDestroy {

  /* ── Static config exposed to the template ──────────────────────────── */
  readonly TEAM_NAME = 'A&H Team';
  /** Display name for "me" — the signed-in profile on live groups, the demo team otherwise. */
  get selfName(): string { return this.currentProfile?.['name'] || this.TEAM_NAME; }
  readonly QUICK_EMOJIS = ['👍', '❤️', '😂', '🙏', '🎉', '👏'];
  readonly AVATAR_EMOJIS = ['💬', '🎪', '🧠', '✨', '⚡', '📣', '🌟', '🔥', '🎯', '🤝'];
  readonly TABS: { k: TabKey; label: string }[] = [
    { k: 'groups', label: 'Groups' },
    { k: 'channels', label: 'Channels' },
    { k: 'archived', label: 'Archived' },
  ];

  /** Archived is split in two: deleted groups and deleted channels. */
  archivedSub: 'groups' | 'channels' = 'groups';
  readonly ARCHIVED_TABS: { k: 'groups' | 'channels'; label: string }[] = [
    { k: 'groups', label: 'Groups' },
    { k: 'channels', label: 'Channels' },
  ];
  readonly ATTACH_OPTIONS = [
    { label: 'Image',      icon: 'image',       color: '#7C3AED', bg: '#EDE9FE', pick: 'image' },
    { label: 'Video',      icon: 'movie',       color: '#BE1484', bg: '#FAE5F2', pick: 'video' },
    { label: 'Audio',      icon: 'music_note',  color: '#16A34A', bg: '#ECFDF5', pick: 'audio' },
    { label: 'Document',   icon: 'description', color: '#0076C8', bg: '#E8F5FC', pick: 'doc' },
    { label: 'Voice note', icon: 'mic',         color: '#D97706', bg: '#FEF3C7', pick: 'rec' },
  ];

  /* ── Data ───────────────────────────────────────────────────────────── */
  groups: ChatItem[] = [];
  channels: ChatItem[] = [];

  /* ── Channel paging ──────────────────────────────────────────────────
     Groups stream live because a chat is conversational. Channels are broadcast archives —
     the old screen paged them 10 at a time with getDocs and no listener, and this does the same:
     a channel can hold years of sends, and none of them change after they land. */
  private readonly CHANNEL_PAGE = 10;
  private lastChannelDoc: { active: any; archived: any } = { active: null, archived: null };
  hasMoreChannels = { active: false, archived: false };
  loadingMoreChannels = false;

  /** Broadcasts inside an open channel page the same way, newest first. */
  private readonly BROADCAST_PAGE = 10;
  private oldestBroadcastDoc: any = null;
  hasMoreBroadcasts = false;
  loadingMoreBroadcasts = false;

  /** The delivery panel for one broadcast — sent to / read / pending. */
  broadcastInfo: ChatMessage | null = null;
  broadcastTab: 'sent' | 'read' | 'pending' = 'read';

  /** Broadcast composer: pick the audience here, then hand off to ChannelCommunication. */
  audienceOpen = false;
  audienceSearch = '';
  audiencePicked: string[] = [];
  directory: { [name: string]: Person } = {};
  participants: Person[] = [];
  team: Person[] = [];
  events: EventRef[] = [];
  tickets: Ticket[] = [];
  pEvents: ParticipantEvent[] = [];
  loading = true;

  /* ── Screen state ───────────────────────────────────────────────────── */
  tab: TabKey = 'groups';
  activeIds: { [k in TabKey]: string | null } = { groups: null, channels: null, archived: null };
  search = '';
  draft = '';
  replyTo: ChatMessage | null = null;
  showInfo = false;
  infoMsg: ChatMessage | null = null;
  person: { name: string; doc: Person | null } | null = null;
  lightbox: string | null = null;
  attachError = '';
  /** True while staged attachments are uploading. */
  uploadingFiles = false;
  attachMenu = false;
  linkForm: { label: string; url: string } | null = null;
  announceMode = false;
  catFilter = 'all';
  selectMode = false;
  selectedIds: string[] = [];
  editing: ChatMessage | null = null;
  pinnedOpen = false;
  mentionQuery: string | null = null;
  msgSearch = '';
  msgSearchUser = 'all';
  showMsgSearch = false;
  confirmDelete: { group?: boolean; msgs?: ChatMessage[] } | null = null;
  toastMsg: string | null = null;
  hoverId: string | null = null;
  pickerId: string | null = null;

  /* Recording */
  recording = false;
  recSecs = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private recChunks: BlobPart[] = [];
  private recTimer: any = null;

  /* Create modal */
  createOpen = false;
  cName = '';
  /** Demo rows still render an icon; live groups use their picture (or the default). */
  cEmoji = '💬';
  /** No description input any more — demo rows just carry an empty one. */
  readonly cDesc = '';
  cEventId = '';
  cSaving = false;
  /** Everyone in one list — no team/participants split in the create dialog. */
  cAdminIds: string[] = [];
  cImageFile: File | null = null;
  cImagePreview: string | null = null;
  cSearch = '';
  cSelected: Member[] = [];

  /* Add-members modal */
  addingMembers = false;
  aSearch = '';
  aPicked: Member[] = [];

  /* Ticket modal */

  @ViewChild('composer') composerRef?: ElementRef<HTMLTextAreaElement>;

  /** Grows the composer with its content up to COMPOSER_MAX_ROWS lines, then it scrolls. */
  private static readonly COMPOSER_MAX_ROWS = 8;

  /**
   * Clearing `draft` in code does not fire (ngModelChange), so the textarea kept the inline height it
   * had grown to and stayed tall after sending. Every programmatic clear goes through here.
   */
  private clearDraft(): void {
    this.draft = '';
    // The resize measures the DOM, and Angular has not pushed the empty value into the textarea yet at
    // this point — measuring here would still see the old text and keep the grown height. Clear the
    // element directly, then let a frame pass before re-measuring.
    const el = this.composerRef?.nativeElement;
    if (el) el.value = '';
    requestAnimationFrame(() => this.autoGrowComposer());
    setTimeout(() => this.autoGrowComposer(), 60);
  }

  autoGrowComposer(): void {
    const el = this.composerRef?.nativeElement;
    if (!el) return;

    // An EMPTY textarea reports a nonsense scrollHeight here (543px against a 38px clientHeight —
    // it is a flex item with `flex: 1` and `height: auto` at measure time), which is why the box
    // stayed tall after sending. With no content there is nothing to measure: drop the inline height
    // and let the CSS min-height define the resting size.
    if (!el.value) { el.style.height = ''; return; }

    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 22;
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
                 + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = line * GroupChatScreenComponent.COMPOSER_MAX_ROWS + chrome;
    const wasAtBottom = this.isNearBottom();
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    // Growing the composer shortens the thread pane; hold the newest message in view.
    if (wasAtBottom) this.scrollToBottomSoon();
  }
  @ViewChild('messagePane') messagePane?: ElementRef<HTMLDivElement>;
  @ViewChild('imgInput') imgInput?: ElementRef<HTMLInputElement>;
  @ViewChild('vidInput') vidInput?: ElementRef<HTMLInputElement>;
  @ViewChild('audInput') audInput?: ElementRef<HTMLInputElement>;
  @ViewChild('docInput') docInput?: ElementRef<HTMLInputElement>;

  private toastTimer: any = null;
  private flashTimer: any = null;

  /* ── Appearance ─────────────────────────────────────────────────────
     The design ships light and dark token sets. The attribute is set on THIS component's host, not on
     <html>, so the rest of the app — which has no dark styling — is unaffected. */
  theme: 'light' | 'dark' = 'light';
  private static readonly THEME_KEY = 'groupChatTheme';

  /** This screen hides the app toolbar, so it carries the app-navigation trigger itself. */
  openAppNav(): void { this.navDrawer.toggle(); }

  toggleTheme(): void {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
    try { localStorage.setItem(GroupChatScreenComponent.THEME_KEY, this.theme); } catch { /* private mode */ }
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.hostEl.nativeElement.setAttribute('data-theme', theme);
  }

  private restoreTheme(): void {
    let saved: string | null = null;
    try { saved = localStorage.getItem(GroupChatScreenComponent.THEME_KEY); } catch { /* SSR / private mode */ }
    this.applyTheme(saved === 'dark' ? 'dark' : 'light');
  }

  /** Height of the screen in px — measured, so the whole UI fits with no page scroll. */
  screenHeight: number | null = null;
  private resizeObserver?: ResizeObserver;

  /* ── Firestore backend state (Groups only — ported from chat-screen) ── */
  private supportchat!: CollectionReference;
  private destroy$ = new Subject<void>();
  private messagesSub?: Subscription;
  /** uid of the signed-in user, i.e. their `user_data` doc id — the same key `members` holds. */
  currentUid = '';
  currentProfile: any = null;
  /** profile_data doc id for the signed-in user — the identifier channels address people by. */
  currentProfileDocId = '';
  chatAdmin = false;
  adminRole = false;
  /** `developer` on the roles doc — the escape hatch that can appoint the first admin. */
  developerRole = false;
  /** True once `profile_data` resolved and the group subscriptions are attached. */
  liveMode = false;
  messagesLoading = false;
  messagesError = '';
  /** uid → profile_data doc. */
  private profilesByUid: { [uid: string]: any } = {};
  /** profileid → display name, for expanding stored `@profileid` mentions back to names. */
  private profileIdToName: { [profileId: string]: string } = {};
  /** Keyed by profile_data DOC id — the identifier channel audiences are stored under. */
  private profileByDocId: { [docId: string]: { name: string; photoUrl: string | null; uid: string } } = {};
  private nameToProfileId: { [name: string]: string } = {};
  private rolesByProfileId: { [profileId: string]: any } = {};

  /* Inputs the Customer Support "add issue" dialog expects — loaded exactly as
     customer-support-dashboard loads them, so the dialog behaves identically here. */
  private ticketCategories: any[] = [];
  private ticketStatusList: any[] = [];
  private journeyList: any[] = [];
  private profileMapByDocId: any = {};
  private recentTicketNumber = 0;

  constructor(
    private hostEl: ElementRef<HTMLElement>,
    private firestore: Firestore,
    private storage: Storage,
    private guard: AuthguardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private navDrawer: NavDrawerService,
  ) {
    this.supportchat = collection(this.firestore, 'supportchat');
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  ngOnInit(): void {
    this.restoreTheme();
    // Static rows first so the screen is never blank; live groups replace them once auth resolves.
    this.seedDemoData();
    this.loading = false;
    this.bootstrapLive();
  }

  ngAfterViewInit(): void {
    this.fitToViewport();
    // The app shell (header, drawer) can settle after first paint — re-measure when it does.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitToViewport());
      const parent = this.hostEl.nativeElement.parentElement;
      if (parent) this.resizeObserver.observe(parent);
    }
    setTimeout(() => this.fitToViewport(), 0);
  }

  ngOnDestroy(): void {
    clearInterval(this.recTimer);
    clearTimeout(this.toastTimer);
    this.resizeObserver?.disconnect();
    this.messagesSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
  }

  /* ══════════════════════════════════════════════════════════════════════
     Firestore backend — GROUPS ONLY
     Ported from src/app/Events/Chat/chat-screen/chat-screen.component.ts so
     both screens read and write exactly the same documents:
       supportchat            · type='group', isdelete, members[uid], group_name,
                                group_profile, last_message, last_sender_uid,
                                last_modification, last_pending[uid], creator_uid
       supportchat/{id}/messages · messageid, message, sender_uid, time, type,
                                files[], read_by[], pending[], mentions[], pinned
       profile_data           · name, profile (picture), profileid, user_ref
       users_roles            · admin / chatxadmin, keyed by profile_ref
     Channels, and every feature with no field behind it (reactions, replies,
     announcements, categories, tickets, journey profiles), stay static.
     ══════════════════════════════════════════════════════════════════════ */

  /** A live group is backed by a `supportchat` doc; demo rows are not. */
  isLive(item?: ChatItem | null): boolean { return !!item?._live; }

  private async bootstrapLive(): Promise<void> {
    try {
      const roles = await this.guard.getRoles();
      this.chatAdmin = roles?.['chatxadmin'] ?? false;
      this.adminRole = roles?.['admin'] ?? false;
      this.developerRole = roles?.['developer'] ?? false;

      const userRef = doc(this.firestore, 'user_data', this.guard.uid);
      const profileSnap = await getDocs(query(collection(this.firestore, 'profile_data'), where('user_ref', '==', userRef)));
      if (profileSnap.empty) return;  // not a chat user — stay on the static demo rows

      this.currentProfile = profileSnap.docs[0].data();
      this.currentProfileDocId = profileSnap.docs[0].id;
      this.currentUid = this.currentProfile['user_ref']?.id || '';
      if (!this.currentUid) return;

      this.watchDirectory();
      this.watchRoles();
      this.loadTicketConfig();
      this.loadGroups();
      this.loadChannels(false);
      this.loadChannels(true);
      this.liveMode = true;
    } catch (e) {
      console.error('group-chat: live bootstrap failed, staying on demo data', e);
    }
  }

  /** Everything the shared add-issue dialog needs, mirroring customer-support-dashboard. */
  private async loadTicketConfig(): Promise<void> {
    try {
      const [config, profileMap, journeyMap] = await Promise.all([
        getDocs(collection(this.firestore, 'chat config')),
        this.guard.getProfileMap(),
        this.guard.getJourneyMap(),
      ]);
      if (config.docs.length) {
        this.ticketCategories = config.docs[0].data()['categories'] || [];
        this.ticketStatusList = config.docs[0].data()['status'] || [];
      }
      this.profileMapByDocId = profileMap?.docdata || {};
      this.journeyList = Object.keys(journeyMap || {})
        .map(id => ({ id, journey: journeyMap[id] }))
        .sort((a, b) => a.journey.localeCompare(b.journey));

      const latest = await getDocs(query(
        collection(this.firestore, 'clientissue'), orderBy('reporteddate', 'desc'), limit(1)));
      this.recentTicketNumber = latest.docs.length ? latest.docs[0].data()['issueno'] : 0;
    } catch (e) {
      console.error('group-chat: could not load ticket config', e);
    }
  }

  /** profile_data powers member names, avatars and the mention list. */
  private watchDirectory(): void {
    collectionSnapshots(query(collection(this.firestore, 'profile_data'), orderBy('name', 'asc')))
      .pipe(takeUntil(this.destroy$))
      .subscribe(docs => {
        this.profilesByUid = {};
        this.profileByDocId = {};
        this.profileIdToName = {};
        this.nameToProfileId = {};
        const people: Person[] = [];
        docs.forEach(d => {
          const data: any = d.data();
          const uid = data['user_ref']?.id;
          if (!uid || !data['name']) return;
          const profileId = data['profileid'] || data['profile_id'] || d.id;
          data['_profileId'] = profileId;
          this.profileByDocId[d.id] = { name: data['name'], photoUrl: data['profile'] || null, uid };
          this.profilesByUid[uid] = data;
          this.profileIdToName[profileId] = data['name'];
          this.nameToProfileId[data['name']] = profileId;
          people.push({
            id: uid, name: data['name'], photoUrl: data['profile'] || null,
            journey: null, source: 'participant',
          });
        });
        this.applyDirectory(people);
        this.refreshLiveNames();
      });
  }

  /** users_roles decides who is listed under Team vs Participants. */
  private watchRoles(): void {
    collectionData(query(collection(this.firestore, 'users_roles'), orderBy('name', 'asc')))
      .pipe(takeUntil(this.destroy$))
      .subscribe((roles: any[]) => {
        this.rolesByProfileId = {};
        roles.forEach(r => { if (r?.['profile_ref']?.id) this.rolesByProfileId[r['profile_ref'].id] = r; });
        this.applyDirectory();
      });
  }

  /** Merge the live directory into the pickers and the name→person lookup. */
  private applyDirectory(people?: Person[]): void {
    if (people) this.livePeople = people;
    const team: Person[] = [];
    const participants: Person[] = [];
    this.livePeople.forEach(p => {
      const profile = this.profilesByUid[p.id];
      const role = profile ? this.rolesByProfileId[profile['_profileId']] : null;
      const isTeam = !!(role?.['admin'] || role?.['chatxadmin']);
      const person: Person = { ...p, source: isTeam ? 'team' : 'participant', role: role?.['name'] || undefined };
      this.directory[person.name] = person;
      (isTeam ? team : participants).push(person);
    });
    if (this.liveMode || this.livePeople.length) { this.team = team; this.participants = participants; }
  }
  private livePeople: Person[] = [];

  private nameOfUid(uid: string): string { return this.profilesByUid[uid]?.['name'] || 'Unknown User'; }

  /** Same query shape as chat-screen: admins see every group, everyone else only their own. */
  private loadGroups(): void {
    const baseFilter = (this.chatAdmin || this.adminRole)
      ? []
      : [where('members', 'array-contains', this.currentUid)];

    const groupQuery = (isdelete: boolean) => query(
      this.supportchat, ...baseFilter, where('type', '==', 'group'), where('isdelete', '==', isdelete));

    this.loading = true;
    collectionSnapshots(groupQuery(false)).pipe(takeUntil(this.destroy$)).subscribe({
      next: docs => { this.mergeGroups(docs, false); this.loading = false; },
      error: e => { console.error('active groups', e); this.loading = false; },
    });
    collectionSnapshots(groupQuery(true)).pipe(takeUntil(this.destroy$)).subscribe({
      next: docs => this.mergeGroups(docs, true),
      error: e => console.error('archived groups', e),
    });
  }

  /** Replace the demo groups with live ones, keeping any messages already streamed in. */
  private mergeGroups(docs: any[], archived: boolean): void {
    const mapped = docs.map(d => this.mapGroupDoc(d, archived));
    // Keep the other bucket (active vs archived) as it is; demo groups drop out once live data lands.
    const kept = this.groups.filter(g => g._live && !!g.archived !== archived);
    this.groups = [...kept, ...mapped].sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  }

  private mapGroupDoc(d: any, archived: boolean): ChatItem {
    const data: any = d.data();
    const uids: string[] = data['members'] || [];
    const existing = this.groups.find(g => g.id === d.id);
    const pending: string[] = data['last_pending'] || [];
    return {
      id: d.id,
      name: data['group_name'] || 'Untitled group',
      photoUrl: this.imageUrl(data['group_profile']),
      // No emoji/description/category field exists in supportchat — these stay UI-only defaults.
      emoji: '💬',
      description: '',
      category: null,
      eventId: null,
      eventName: null,
      createdBy: this.nameOfUid(data['creator_uid']),
      members: uids.map(uid => ({ id: uid, name: this.nameOfUid(uid), journey: null })),
      messages: existing?.messages || [],
      lastMessage: data['last_message'] || '',
      lastAt: this.tsToIso(data['last_modification']),
      unread: pending.includes(this.currentUid) ? 1 : 0,
      pinned: !!data['pinned'],
      adminUids: data['group_admin'] || [],
      deletedLog: existing?.deletedLog || [],
      archived,
      _live: true,
      _ref: d.ref,
      _memberUids: uids,
      _creatorUid: data['creator_uid'],
      _coll: 'supportchat',
      _kind: 'group',
    };
  }

  /* ── Channels ───────────────────────────────────────────────────────
     Same `supportchat` collection as groups, separated by `type`. Two things differ from the
     group path and both are deliberate:

     1. No listener. chat-screen fetched channels with getDocs in pages of 10 because a broadcast
        archive only ever grows at one end, and re-reading the whole thing on every write is waste.
     2. Membership is a profile_data DOC ID, not a uid. ChannelCommunication.createChannel() writes
        `members: adminIds` where adminIds are profile ids, so the group filter
        (members array-contains uid) matches nothing on a channel — which is why non-admins could
        never see a channel on the old screen. Filtering by profile doc id fixes that here. */
  private async loadChannels(archived: boolean, more = false): Promise<void> {
    if (more && (this.loadingMoreChannels || !this.lastChannelDoc[archived ? 'archived' : 'active'])) return;
    const key = archived ? 'archived' : 'active';
    const baseFilter = (this.chatAdmin || this.adminRole)
      ? []
      : [where('members', 'array-contains', this.currentProfileDocId)];

    const parts: any[] = [
      ...baseFilter,
      where('type', '==', 'channel'),
      where('isdelete', '==', archived),
      orderBy('last_modification', 'desc'),
    ];
    if (more) parts.push(startAfter(this.lastChannelDoc[key]));
    parts.push(limit(this.CHANNEL_PAGE));

    if (more) this.loadingMoreChannels = true;
    try {
      const snap = await getDocs(query(this.supportchat, ...parts));
      const mapped = snap.docs.map(d => this.mapChannelDoc(d, archived));
      const kept = more
        ? this.channels
        : this.channels.filter(c => c._live && !!c.archived !== archived);
      this.channels = [...kept, ...mapped];
      this.lastChannelDoc[key] = snap.docs[snap.docs.length - 1] ?? this.lastChannelDoc[key];
      this.hasMoreChannels[key] = snap.docs.length === this.CHANNEL_PAGE;
    } catch (e) {
      console.error(archived ? 'archived channels' : 'active channels', e);
    } finally {
      this.loadingMoreChannels = false;
    }
  }

  /** Channels run on the pink accent — including the archived sub-tab that lists deleted ones. */
  get channelTheme(): boolean {
    return this.tab === 'channels' || (this.tab === 'archived' && this.archivedSub === 'channels');
  }

  /** The paging control only belongs under a channel list that actually has another page. */
  get showChannelPaging(): boolean {
    if (this.tab === 'channels') return this.hasMoreChannels.active;
    if (this.tab === 'archived' && this.archivedSub === 'channels') return this.hasMoreChannels.archived;
    return false;
  }

  loadMoreChannels(): void {
    this.loadChannels(this.tab === 'archived', true);
  }

  /** Re-read both channel buckets from page one — used after a restore/delete flips `isdelete`. */
  private reloadChannels(): void {
    this.lastChannelDoc = { active: null, archived: null };
    this.loadChannels(false);
    this.loadChannels(true);
  }

  private mapChannelDoc(d: any, archived: boolean): ChatItem {
    const data: any = d.data();
    const profileIds: string[] = data['members'] || [];
    const existing = this.channels.find(c => c.id === d.id);
    return {
      id: d.id,
      name: data['group_name'] || 'Untitled channel',
      photoUrl: this.imageUrl(data['group_profile']),
      emoji: '📣',
      // Channels DO carry a description — ChannelCommunication writes one at create time.
      description: data['description'] || '',
      category: null,
      eventId: null,
      eventName: null,
      createdBy: this.nameOfUid(data['creator_uid']),
      members: profileIds.map(id => ({ id, name: this.nameOfProfileDoc(id), journey: null })),
      followers: profileIds.length,
      messages: existing?.messages || [],
      lastMessage: data['last_message'] || '',
      lastAt: this.tsToIso(data['last_modification']),
      unread: 0,
      pinned: !!data['pinned'],
      adminUids: [],
      deletedLog: [],
      archived,
      _live: true,
      _ref: d.ref,
      _memberProfileIds: profileIds,
      _channelAdmins: data['admins'] || [],
      _creatorUid: data['creator_uid'],
      _coll: 'supportchat',
      _kind: 'channel',
    };
  }

  /** Names for channel audiences, which are keyed by profile_data doc id. */
  private nameOfProfileDoc(docId: string): string {
    return this.profileByDocId[docId]?.name
      || this.profileMapByDocId?.[docId]?.['name']
      || 'Unknown User';
  }

  private photoOfProfileDoc(docId: string): string | null {
    return this.profileByDocId[docId]?.photoUrl
      || this.profileMapByDocId?.[docId]?.['profile']
      || null;
  }

  /**
   * Broadcasts, newest page first then reversed so the thread still reads oldest→newest.
   * Deliberately a one-shot read, not a listener — see loadChannels().
   */
  private async loadBroadcasts(channel: ChatItem, more = false): Promise<void> {
    if (more && (this.loadingMoreBroadcasts || !this.oldestBroadcastDoc)) return;
    const col = collection(this.supportchat, channel.id, 'messages');
    const parts: any[] = [orderBy('time', 'desc')];
    if (more) parts.push(startAfter(this.oldestBroadcastDoc));
    parts.push(limit(this.BROADCAST_PAGE));

    if (more) this.loadingMoreBroadcasts = true;
    else { this.messagesLoading = true; this.messagesError = ''; }
    try {
      let snap = await getDocs(query(col, ...parts));
      let ordered = true;

      /* Firestore drops any document that is MISSING the orderBy field. If the broadcast job stamps
         its own timestamp under a different name, `orderBy('time')` returns an empty page while the
         subcollection is full — indistinguishable from an empty channel. So: if the first page comes
         back empty, re-read it unordered and sort on the client. Costs one extra read only in the
         case that would otherwise show nothing. */
      if (!more && snap.empty) {
        // Wider page here: with no order there is no cursor to page from, so this read is the
        // whole view, and it may also contain per-recipient duplicates to collapse.
        snap = await getDocs(query(col, limit(60)));
        ordered = false;
        if (!snap.empty) {
          console.warn('group-chat: channel messages have no usable `time` field; fell back to an '
            + 'unordered read. Fields on the first doc:', Object.keys(snap.docs[0].data() || {}));
        }
      }

      const target = this.channels.find(c => c.id === channel.id) || channel;
      const docsOldestFirst = ordered ? [...snap.docs].reverse() : snap.docs;
      const older = docsOldestFirst.map(d => {
        try { return this.mapBroadcastDoc(d); }
        catch (e) { console.error('group-chat: skipped a broadcast', d?.id, e); return null; }
      }).filter(Boolean) as ChatMessage[];
      if (!ordered) older.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      // channel-record queries these by `messageid` and iterates the result, so a broadcast is not
      // guaranteed to be one document. Collapse by messageid — one card per send, either way.
      const byId = new Map<string, ChatMessage>();
      older.forEach(m => { if (!byId.has(m.id)) byId.set(m.id, m); });
      const page = [...byId.values()];
      target.messages = more ? [...page, ...target.messages] : page;
      // docs came back newest-first, so the LAST one is the oldest — the cursor for the next page.
      this.oldestBroadcastDoc = snap.docs[snap.docs.length - 1] ?? this.oldestBroadcastDoc;
      // Paging needs the cursor to be meaningful; without an order there is nothing to page from.
      this.hasMoreBroadcasts = ordered && snap.docs.length === this.BROADCAST_PAGE;
      if (!more) this.scrollToBottomSoon();
    } catch (e: any) {
      console.error('channel broadcasts', e);
      if (!more) {
        this.messagesError = e?.code === 'permission-denied'
          ? 'You do not have permission to read this channel.'
          : `Could not load broadcasts${e?.code ? ' (' + e.code + ')' : ''}.`;
      }
    } finally {
      this.messagesLoading = false;
      this.loadingMoreBroadcasts = false;
    }
  }

  loadMoreBroadcasts(): void {
    if (this.active) this.loadBroadcasts(this.active, true);
  }

  /**
   * A broadcast doc is a card, not a chat line: `htmlbody` holds the body, and header/footer/
   * files/links/buttons hang off it. Everything lands on _broadcast so the normal bubble
   * renderer is never asked to make sense of raw HTML.
   */
  private mapBroadcastDoc(d: any): ChatMessage {
    const data: any = d.data();
    const uid = data['sender_uid'] || '';
    const files: any[] = data['files'] || [];
    const links: any[] = data['links'] || [];
    /* Field names are not guaranteed across the broadcast job's versions, and a card with no body is
       worse than a plainly-rendered one. Fall through the known spellings rather than showing blank. */
    const html: string = data['htmlbody'] || data['html_body'] || '';
    const plain: string = data['textbody'] || data['text_body'] || data['message'] || '';
    return {
      id: data['messageid'] || d.id,
      // Broadcasts have no "me" — chat-screen blanked isMyMessage on channels for the same reason.
      from: 'member',
      senderName: uid ? this.nameOfUid(uid) : this.TEAM_NAME,
      text: plain,
      at: this.tsToIso(data['time'] ?? data['createdat'] ?? data['created_on'] ?? data['senton']),
      pinned: !!data['pinned'],
      buttons: this.parseButtons(data['buttons']),
      readBy: [],
      deliveredTo: [],
      _ref: d.ref,
      _senderUid: uid,
      _broadcast: {
        html,
        headerType: data['headertype'] ?? null,
        headerValue: data['headervalue'] ?? null,
        footer: data['footer'] ?? null,
        files: files.map(f => ({ name: f?.['name'] || 'File', url: f?.['url'] || f?.['fileurl'] || '' }))
                    .filter(f => !!f.url),
        links: links.map(l => typeof l === 'string'
          ? { label: l, url: l }
          : { label: l?.['label'] || l?.['title'] || l?.['url'] || 'Link', url: l?.['url'] || '' })
          .filter(l => !!l.url),
        sentTo: data['members'] || [],
        readBy: data['read_by'] || [],
        pending: data['pending'] || [],
      },
    };
  }

  isBroadcast(m: ChatMessage): boolean { return !!m._broadcast; }

  /** Member and sender names come from profile_data, which can arrive after the groups do. */
  private refreshLiveNames(): void {
    this.channels.filter(c => c._live).forEach(c => {
      c.members = (c._memberProfileIds || []).map(id => ({ id, name: this.nameOfProfileDoc(id), journey: null }));
      c.createdBy = this.nameOfUid(c._creatorUid || '');
      c.messages.forEach(m => { if (m._senderUid) m.senderName = this.nameOfUid(m._senderUid); });
    });
    this.groups.filter(g => g._live).forEach(g => {
      g.members = (g._memberUids || []).map(uid => ({ id: uid, name: this.nameOfUid(uid), journey: null }));
      g.createdBy = this.nameOfUid(g._creatorUid || '');
      // Sender/reader names are resolved from the uids kept on the message.
      g.messages.forEach(m => {
        if (m._senderUid) m.senderName = this.nameOfUid(m._senderUid);
        if (m._readerUids) m.readBy = m._readerUids.map(u => ({ name: this.nameOfUid(u), at: '' }));
      });
    });
  }

  /** `group_profile` holds an image URL on real groups; older rows can hold junk or an emoji. */
  private imageUrl(value: any): string | null {
    return typeof value === 'string' && /^(https?:|data:)/.test(value.trim()) ? value.trim() : null;
  }

  private tsToIso(ts: any): string {
    if (!ts) return '';
    if (typeof ts?.toDate === 'function') return ts.toDate().toISOString();
    if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000).toISOString();
    if (typeof ts === 'string') return ts;
    return '';
  }

  /** Live thread: real-time messages, ordered oldest→newest, exactly as chat-screen reads them. */
  private subscribeMessages(group: ChatItem): void {
    this.messagesSub?.unsubscribe();
    this.markedRead.clear();
    this.messagesLoading = true;
    this.messagesError = '';
    this.messagesSub = collectionSnapshots(
      query(collection(this.supportchat, group.id, 'messages'), orderBy('time', 'asc'))
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: docs => {
        const target = this.groups.find(g => g.id === group.id) || group;
        const before = target.messages.length;
        // Pin/edit/react re-emit the whole thread; only a genuinely NEW message should move the
        // viewport, and only when the reader is already at the bottom.
        const wasAtBottom = this.isNearBottom();
        // One malformed doc must not take the whole thread down with it.
        target.messages = docs.map(d => {
          try { return this.mapMessageDoc(d); }
          catch (e) { console.error('group-chat: skipped a message', d?.id, e); return null; }
        }).filter(Boolean) as ChatMessage[];
        this.messagesLoading = false;
        // Anything that lands while this thread is open counts as read.
        this.markArrivalsRead(docs);
        const isFirstLoad = before === 0;
        const grew = target.messages.length > before;
        // Your own send always jumps to the bottom; someone else's message only if you were already there.
        if (isFirstLoad || this.justSent || (grew && wasAtBottom)) {
          this.scrollToBottomSoon();
          if (grew) this.justSent = false;
        }
      },
      error: e => {
        console.error('group messages', e);
        this.messagesLoading = false;
        this.messagesError = e?.code === 'permission-denied'
          ? 'You do not have permission to read this group’s messages.'
          : `Could not load messages${e?.code ? ' (' + e.code + ')' : ''}.`;
      },
    });
  }

  private mapMessageDoc(d: any): ChatMessage {
    const data: any = d.data();
    const uid = data['sender_uid'];
    const files: any[] = data['files'] || [];
    const attachments = files.map(f => this.fileRecordToAttachment(f));
    const readers: string[] = (data['read_by'] || []).filter((u: string) => u !== uid);
    return {
      id: data['messageid'] || d.id,
      from: uid === this.currentUid ? 'team' : 'member',
      senderName: this.nameOfUid(uid),
      text: this.expandMentions(data['message'] || '', data['mentions'] || []),
      at: this.tsToIso(data['time']),
      pinned: !!data['pinned'],
      attachment: attachments[0],
      attachments,
      mentions: (data['mentions'] || []).map((pid: string) => '@' + (this.profileIdToName[pid] || pid)),
      readBy: readers.map(u => ({ name: this.nameOfUid(u), at: '' })),
      deliveredTo: [],
      buttons: this.parseButtons(data['buttons']),
      replyTo: this.mapReplyTo(data['reply_to']),
      _ref: d.ref,
      _rawMessage: data['message'] || '',
      _files: files,
      _senderUid: uid,
      _readerUids: readers,
    };
  }

  /**
   * `reply_to` as written by the Flutter participant app:
   *   { message, sender_uid, messageid, files }
   * Same shape is written back from here, so a reply made on either client renders on both.
   */
  private mapReplyTo(raw: any): ChatMessage['replyTo'] | undefined {
    if (!raw) return undefined;
    const files: any[] = raw['files'] || [];
    const first = files[0];
    const mime: string = first?.['filetype'] || first?.['mediatype'] || '';
    const isMedia = /^image\/|^video\/|^(image|video)$/.test(mime);
    return {
      senderName: this.nameOfUid(raw['sender_uid']),
      text: this.plainPreview(this.expandMentions(raw['message'] || '')),
      messageId: raw['messageid'] || undefined,
      senderUid: raw['sender_uid'],
      // Flutter prefers filethumbnail and falls back to fileurl — match that.
      thumbUrl: isMedia ? (first?.['filethumbnail'] || first?.['fileurl'] || undefined) : undefined,
      isMedia,
    };
  }

  /**
   * Channel messages store CTAs in a `buttons` array; group messages now do the same.
   * Mirrors chat-screen's parseChannelButtons(), which accepts an array, an object map or a JSON
   * string — older records were evidently written inconsistently.
   */
  private parseButtons(raw: any): Cta[] {
    const take = (arr: any[]): Cta[] => arr
      .filter(b => b?.url && b?.label)
      .map(b => ({ label: b.label, href: b.url }));
    if (!raw) return [];
    if (Array.isArray(raw)) return take(raw);
    if (typeof raw === 'object') return take(Object.values(raw));
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? take(parsed) : [];
    } catch { return []; }
  }

  /**
   * Works out what a stored file actually is. Records are inconsistent across the apps that wrote
   * them: `filetype` is usually a MIME type, but `mediatype` is sometimes a bare word ("image",
   * "video") — that is what the Flutter app checks — and either can be missing, in which case the
   * filename extension is the only clue. Getting this wrong renders every attachment as a
   * generic file, which is what made older audio unplayable.
   */
  private fileRecordToAttachment(f: any): Attachment {
    const raw = `${f?.filetype || ''} ${f?.mediatype || ''}`.toLowerCase();
    const ext = (f?.filename || f?.fileurl || '').toLowerCase().split('?')[0].split('.').pop() || '';

    const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'svg'];
    const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', '3gp', 'ogv'];
    const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'weba', 'amr', 'flac'];

    let type: Attachment['type'] = 'file';
    if (/^image\/|(^|\s)image(\s|$)/.test(raw) || IMAGE_EXT.includes(ext)) type = 'image';
    else if (/^video\/|(^|\s)video(\s|$)/.test(raw) || VIDEO_EXT.includes(ext)) type = 'video';
    else if (/^audio\/|(^|\s)audio(\s|$)|voice/.test(raw) || AUDIO_EXT.includes(ext)) type = 'voice';
    // A webm can be either; treat it as video only when the record says so.
    if (ext === 'webm' && /audio/.test(raw)) type = 'voice';

    return { type, dataUrl: f?.fileurl || '', name: f?.filename || '', mime: f?.filetype || f?.mediatype || '' };
  }

  /** Stored as `@profileid` (chat-screen convention) — shown as `@Name`. */
  private expandMentions(text: string, mentionIds: string[] = []): string {
    let out = text || '';
    if (!out.includes('@')) return out;
    // Only the ids this message actually mentions — never a scan of the whole directory.
    for (const pid of mentionIds) {
      const name = this.profileIdToName[pid];
      if (name) out = out.split('@' + pid).join('@' + name);
    }
    return out;
  }

  /** Inverse of expandMentions, applied on the way into Firestore. */
  private collapseMentions(text: string, group?: ChatItem): { message: string; mentions: string[] } {
    let message = text || '';
    const mentions: string[] = [];
    if (!message.includes('@')) return { message, mentions };
    const candidates = (group?.members || []).map(m => m.name).filter(n => this.nameToProfileId[n]);
    (candidates.length ? candidates : Object.keys(this.nameToProfileId))
      .sort((a, b) => b.length - a.length)
      .forEach(name => {
        const token = '@' + name;
        if (!message.includes(token)) return;
        const pid = this.nameToProfileId[name];
        message = message.split(token).join('@' + pid);
        if (!mentions.includes(pid)) mentions.push(pid);
      });
    return { message, mentions };
  }

  /**
   * Search normalisation, operator's spec: lowercase with every space removed. The same function runs
   * on the stored copy and on the query, so "payment link" matches "Payment  Link".
   * Stored beside `message` as `message_search` — ADDITIVE; the old screen ignores it.
   */
  private normalizeForSearch(text: string): string {
    return (text || '').toLowerCase().replace(/\s+/g, '');
  }

  private otherMembers(group: ChatItem): string[] {
    return (group._memberUids || []).filter(uid => uid !== this.currentUid);
  }

  /**
   * Opening a thread marks it read, the same way the Flutter participant app does:
   *   group doc  → last_pending drops me, and my `pendingcount` entry is deleted
   *   each message where `pending` contains me → read_by: arrayUnion(me), pending: arrayRemove(me)
   *
   * chat-screen only ever cleared the group-level flag, so a read on web was never recorded per
   * message and the receipts under-reported the web side.
   */
  private async markRead(group: ChatItem): Promise<void> {
    try {
      await updateDoc(group._ref, {
        last_pending: arrayRemove(this.currentUid),
        [`pendingcount.${this.currentUid}`]: deleteField(),
      });
    } catch (e) { console.error('mark read (group)', e); }

    // Firestore batches cap at 500 writes; loop in case a thread has more unread than that.
    try {
      for (let round = 0; round < 5; round++) {
        const snap = await getDocs(query(
          collection(this.supportchat, group.id, 'messages'),
          where('pending', 'array-contains', this.currentUid),
          limit(400),
        ));
        if (snap.empty) return;
        const batch = writeBatch(this.firestore);
        snap.docs.forEach(d => {
          batch.update(d.ref, {
            read_by: arrayUnion(this.currentUid),
            pending: arrayRemove(this.currentUid),
          });
          this.markedRead.add(d.id);
        });
        await batch.commit();
        if (snap.size < 400) return;
      }
    } catch (e) { console.error('mark read (messages)', e); }
  }

  /** Message ids already receipted this session, so a live snapshot cannot re-write them in a loop. */
  private markedRead = new Set<string>();

  /**
   * Messages that arrive while the thread is open are receipted too — the app keeps a listener doing
   * the same. Guarded by `markedRead` so the write's own snapshot does not trigger another write.
   */
  private markArrivalsRead(docs: any[]): void {
    const unread = docs.filter(d => {
      const data = d.data();
      return !this.markedRead.has(d.id) && (data['pending'] || []).includes(this.currentUid);
    });
    if (!unread.length) return;
    const batch = writeBatch(this.firestore);
    unread.slice(0, 400).forEach(d => {
      batch.update(d.ref, { read_by: arrayUnion(this.currentUid), pending: arrayRemove(this.currentUid) });
      this.markedRead.add(d.id);
    });
    batch.commit().catch(e => console.error('mark arrivals read', e));
  }

  private async writeMessage(group: ChatItem, body: string, files: any[], replyTarget?: ChatMessage | null,
                             buttons: Cta[] = []): Promise<void> {
    const messageId = doc(collection(this.firestore, 'temp')).id;
    const { message, mentions } = this.collapseMentions(body, group);
    const pending = this.otherMembers(group);
    const payload: any = {
      messageid: messageId,
      message,
      sender_uid: this.currentUid,
      time: serverTimestamp(),
      type: files.length > 0 ? 'media' : 'text',
      files,
      message_search: this.normalizeForSearch(message),
      // Same {label,url} shape channel broadcasts store, so one renderer serves both.
      buttons: buttons.map(b => ({ label: b.label, url: b.href })),
      links: [],
      read_by: [this.currentUid],
      pending,
      mentions,
    };
    if (replyTarget) {
      // Exactly the Flutter app's reply_to shape — no extra keys.
      payload.reply_to = {
        message: replyTarget._rawMessage ?? this.collapseMentions(replyTarget.text || '', group).message,
        sender_uid: replyTarget._senderUid ?? this.currentUid,
        messageid: replyTarget.id,
        files: replyTarget._files ?? [],
      };
    }
    await setDoc(doc(collection(this.supportchat, group.id, 'messages'), messageId), payload);
    await updateDoc(group._ref, {
      last_message: body.trim() || (files.length ? '📎 Attachment' : ''),
      last_sender_uid: this.currentUid,
      last_modification: serverTimestamp(),
      last_pending: pending,
    });
  }

  /** Storage path matches chat-screen so both screens serve the same files. */
  private async uploadToStorage(groupId: string, file: File | Blob, filename: string, mime: string): Promise<any> {
    const storageRef = ref(this.storage, `chat-files/${groupId}/${Date.now()}_${filename}`);
    const snapshot = await uploadBytes(storageRef, file);
    const fileurl = await getDownloadURL(snapshot.ref);
    // Exactly chat-screen's file record — filename / filetype / fileurl / mediatype, nothing more.
    return { filename, filetype: mime, fileurl, mediatype: mime };
  }

  private notify(msg: string): void { this.snackBar.open(msg, 'Close', { duration: 2000 }); }

  @HostListener('window:resize')
  onWindowResize(): void { this.fitToViewport(); }

  /** Fill exactly the space between the top of the component and the bottom of the window. */
  private fitToViewport(): void {
    // A hidden/background tab reports innerHeight 0 — keep the last good value rather than collapsing.
    if (!window.innerHeight) return;
    const top = this.hostEl.nativeElement.getBoundingClientRect().top;
    const next = Math.max(320, Math.round(window.innerHeight - top));
    if (next !== this.screenHeight) this.screenHeight = next;
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */

  slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * The console design drops the per-sender rainbow: names are plain ink, and identity is carried by
   * the avatar (blue for team/admins, neutral for everyone else).
   */
  senderColor(_name: string): string { return 'var(--ink)'; }

  initials(name: string): string {
    return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  avatarBg(name: string): string {
    // --chip-low is a mid grey in BOTH themes; --ink2 flips light/dark and white initials vanish on it.
    return this.isAdminSender(name) || this.directory[name]?.source === 'team' ? 'var(--blue)' : 'var(--chip-low)';
  }

  timeLabel(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  /** Message stamps always carry the clock time; older messages get the date in front of it. */
  msgTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return time;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const date = d.toLocaleDateString([], sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
    return `${date}, ${time}`;
  }

  /** In-bubble stamp: clock only — the date is carried by the sticky day separator. */
  clockTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** Separator label: weekday, day, full month and year — e.g. "Monday, 24 August 2026". */
  dayLabel(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  kb(size: number): string {
    return size >= 1024 * 1024 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  fmtSecs(s: number): string {
    s = Math.max(0, Math.round(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  journeyMeta(journey?: string | null) { return journey ? JOURNEY_META[journey] : null; }

  photoOf(name: string): string | null { return this.directory[name]?.photoUrl || null; }

  isTeamMember(name: string): boolean { return this.directory[name]?.source === 'team'; }

  plainPreview(text?: string): string {
    return (text || '')
      .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '');
  }

  /* ── Rich text: *bold* · "- " bullets · "1. " numbers · @mentions · [Label](url) ── */

  /** Only real people are taggable — there is no @channel / @all broadcast tag. */
  private mentionSource(names: string[]): string {
    if (!names || !names.length) return '@[A-Z][a-z]+(?: [A-Z][a-z]+)?';
    const esc = [...names].sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return `@(?:${esc.join('|')})`;
  }

  private inlineTokenRe(names: string[]): RegExp {
    return new RegExp(
      '\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)' +   // 1 label · 2 href
      '|\\*([^*\\n]+)\\*' +                                  // 3 bold — one star each side
      '|(https?:\\/\\/[^\\s<>"\')]+)' +                     // 4 bare url
      '|(' + this.mentionSource(names) + ')',                // 5 mention
      'g');
  }

  private renderInline(text: string, names: string[]): Seg[] {
    const out: Seg[] = [];
    const src = text || '';
    const re = this.inlineTokenRe(names);
    let last = 0;
    for (const m of Array.from(src.matchAll(re))) {
      const idx = m.index ?? 0;
      if (idx > last) out.push({ kind: 'text', text: src.slice(last, idx) });
      const [, label, href, bold, url, mention] = m;
      if (href) out.push({ kind: 'link', text: label, href });
      else if (bold) out.push({ kind: 'bold', text: bold });
      else if (url) out.push({ kind: 'link', text: url, href: url });
      else if (mention) out.push({ kind: 'mention', text: mention });
      last = idx + m[0].length;
    }
    if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
    return out;
  }

  private splitCtas(text: string): { body: string; ctas: Cta[] } {
    const ctas: Cta[] = [];
    const body = (text || '').replace(CTA_RE, (_m, label, href) => { ctas.push({ label, href }); return ''; })
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { body, ctas };
  }

  private parse(text: string, names: string[]): Parsed {
    const { body, ctas } = this.splitCtas(text);
    const blocks: Block[] = [];
    let list: { type: 'ul' | 'ol'; items: Seg[][] } | null = null;
    const flush = () => { if (list) { blocks.push({ type: list.type, items: list.items }); list = null; } };
    body.split('\n').forEach(line => {
      const bullet = line.match(/^\s*[-•]\s+(.*)$/);
      const number = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (bullet) {
        if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; }
        list!.items.push(this.renderInline(bullet[1], names));
      } else if (number) {
        if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; }
        list!.items.push(this.renderInline(number[1], names));
      } else {
        flush();
        if (line.trim()) blocks.push({ type: 'p', segs: this.renderInline(line, names) });
      }
    });
    flush();
    return { blocks, ctas };
  }

  /** Parsed message body, cached on the message so the template keeps stable references. */
  parsedOf(m: ChatMessage): Parsed {
    const names = this.mentionNames;
    const key = (m.text || '') + '¦' + names.join(',');
    if (m._parsedFor !== key) {
      m._parsed = this.parse(m.text || '', names);
      m._parsedFor = key;
    }
    return m._parsed!;
  }

  mentionsOf(text: string, names: string[]): string[] {
    const re = new RegExp('(' + this.mentionSource(names) + ')', 'g');
    return [...new Set((text || '').match(re) || [])];
  }

  mentionsMe(m: ChatMessage): boolean {
    return (m.mentions || []).some(x => x === `@${this.selfName}` || x === `@${this.TEAM_NAME}`);
  }

  /* ── Lists · tabs · filters ─────────────────────────────────────────── */

  get lists(): { [k in TabKey]: ChatItem[] } {
    return {
      groups: this.groups.filter(g => !g.archived),
      channels: this.channels.filter(c => !c.archived),
      archived: (this.archivedSub === 'channels'
        ? this.channels.filter(c => c.archived)
        : this.groups.filter(g => g.archived)
            .map(g => g._live ? g : { ...g, _coll: 'webchatGroups', _kind: 'group' as const })
      ).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')),
    };
  }

  get list(): ChatItem[] { return this.lists[this.tab]; }

  get active(): ChatItem | null { return this.list.find(c => c.id === this.activeIds[this.tab]) || null; }

  /** Unused by the sidebar now (chips removed); kept only for the demo channel rows' pills. */
  get categories(): string[] {
    return [...new Set([...this.groups, ...this.channels].map(c => c.category).filter(Boolean) as string[])].sort();
  }

  get activeCat(): string {
    return this.catFilter !== 'all' && !this.categories.includes(this.catFilter) ? 'all' : this.catFilter;
  }

  get filtered(): ChatItem[] {
    const q = this.search.toLowerCase();
    return this.list
      .filter(c =>
        (!q || (c.name || '').toLowerCase().includes(q)) &&
        (this.activeCat === 'all' || c.category === this.activeCat))
      // Same order as chat-screen: pinned chats first, then most recent.
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.lastAt || '').localeCompare(a.lastAt || '');
      });
  }

  /* ── Sidebar search: by group name, or across every group's messages ── */

  messageHits: { group: ChatItem; msg: ChatMessage }[] = [];
  searchingMessages = false;
  private searchDebounce: any = null;

  /** One box: group names filter instantly, message hits arrive debounced underneath. */
  onSearchChange(value: string): void {
    this.search = value;
    clearTimeout(this.searchDebounce);
    const q = this.normalizeForSearch(value);
    if (!q) { this.messageHits = []; this.searchingMessages = false; return; }
    this.searchingMessages = true;
    this.searchDebounce = setTimeout(() => this.runMessageSearch(q), 300);
  }

  /**
   * Live groups are queried on the stored `message_search` field. Firestore can only range over a
   * single field, so that query finds messages that START with the query; anything already streamed
   * into the client is also matched mid-message, which is why both paths run.
   */
  private async runMessageSearch(q: string): Promise<void> {
    // Only groups: broadcasts have no `message_search` field, and their body is HTML.
    const groups = this.list.filter(g => !this.isChannel(g));
    const hits: { group: ChatItem; msg: ChatMessage }[] = [];

    await Promise.all(groups.map(async g => {
      const loaded = (g.messages || []).filter(m => this.normalizeForSearch(this.plainPreview(m.text)).includes(q));
      loaded.forEach(m => hits.push({ group: g, msg: m }));
      if (!this.isLive(g)) return;

      const seen = new Set(loaded.map(m => m.id));
      try {
        const snap = await getDocs(query(
          collection(this.supportchat, g.id, 'messages'),
          orderBy('message_search'),
          startAt(q), endAt(q + '\uf8ff'),
          limit(10),
        ));
        snap.docs.forEach(d => {
          const m = this.mapMessageDoc(d);
          if (!seen.has(m.id)) hits.push({ group: g, msg: m });
        });
      } catch (e) {
        console.error('message search', g.name, e);
      }
    }));

    hits.sort((a, b) => (b.msg.at || '').localeCompare(a.msg.at || ''));
    this.messageHits = hits.slice(0, 50);
    this.searchingMessages = false;
  }

  /** Tapping a quoted message jumps to it, as the Flutter app does. */
  jumpToQuoted(m: ChatMessage): void {
    const id = m.replyTo?.messageId;
    if (!id) return;
    if (document.getElementById(`msg-${id}`)) this.scrollToMessage(id);
    else this.notify('The replied message is not loaded in this view');
  }

  /** Open the hit's group, then jump to the message once the thread has rendered. */
  openMessageHit(hit: { group: ChatItem; msg: ChatMessage }): void {
    if (this.active?.id !== hit.group.id) this.openItem(hit.group);
    this.jumpToMessage(hit.msg.id);
  }

  /** The thread may still be streaming in, so retry briefly before giving up. */
  private jumpToMessage(id: string, attempt = 0): void {
    setTimeout(() => {
      if (document.getElementById(`msg-${id}`)) { this.scrollToMessage(id); return; }
      if (attempt < 20) this.jumpToMessage(id, attempt + 1);
      else this.notify('That message is no longer in this group');
    }, attempt === 0 ? 60 : 150);
  }

  /* ── Group admins (`group_admin`) ────────────────────────────────────
     Stored as UIDs, exactly like `members` (profile_data.user_ref.id = the user_data doc id).
     profileid is a different identifier, used only for mentions and roles. */

  /**
   * Membership of `group_admin` is the only thing that makes someone an admin — the creator is not
   * implicitly one. (They are seeded into `group_admin` at creation, so they appear through the array
   * like everyone else, and can be demoted.)
   */
  isGroupAdmin(mem: Member): boolean {
    const a = this.active;
    if (!a || !mem.id) return false;
    return (a.adminUids || []).includes(mem.id);
  }

  /** True when the signed-in user is an admin of the open group. */
  get isSelfGroupAdmin(): boolean {
    const a = this.active;
    return !!a && (a.adminUids || []).includes(this.currentUid);
  }

  /**
   * Only a group admin assigns other admins — with the `developer` role as the escape hatch, since a
   * group whose `group_admin` is still empty would otherwise have nobody able to appoint the first one.
   */
  get canManageAdmins(): boolean {
    const a = this.active;
    if (!a) return false;
    // Channel membership and admins are owned by the broadcast flow, not edited from this panel.
    if (this.isChannel(a)) return false;
    if (!this.isLive(a)) return true;               // demo rows stay fully editable
    return this.isSelfGroupAdmin || this.developerRole;
  }

  /**
   * Posting requires BOTH: being in `members`, and being in `group_admin`. The `developer` role does
   * not grant it — a developer can appoint admins (see canManageAdmins) but cannot post unless they
   * are a member and an admin themselves. Platform chatxadmin/admin see every group via loadGroups(),
   * which is exactly why membership is checked here rather than assumed.
   * NOTE: when `group_admin` is empty — every group created before the field existed — members may
   * still post, rather than silently freezing every existing group. Flagged to the operator.
   */
  get canMessage(): boolean {
    const a = this.active;
    if (!a) return false;
    // A channel is one-way — the composer is replaced by the broadcast bar, not gated by access.
    if (this.isChannel(a)) return false;
    if (!this.isLive(a)) return true;
    const isMember = (a._memberUids || []).includes(this.currentUid);
    if (!isMember) return false;
    if (!(a.adminUids || []).length) return true;   // legacy group: no admins recorded yet
    return this.isSelfGroupAdmin;
  }

  /**
   * Broadcasting is gated on the channel's own `admins` array (profile doc ids), with the platform
   * chat admin roles as the fallback — a channel created before `admins` existed has nobody in it.
   */
  /** Channel recipients, filtered by the same member-search box the group panel uses. */
  get channelRecipients(): Member[] {
    const q = this.memberSearch.trim().toLowerCase();
    return (this.active?.members || [])
      .filter(m => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  isChannelAdmin(profileDocId: string): boolean {
    return (this.active?._channelAdmins || []).includes(profileDocId);
  }

  /** Channel members are profile doc ids, so their pictures resolve through profileByDocId. */
  photoOfMemberDoc(profileDocId: string): string | null {
    return this.photoOfProfileDoc(profileDocId);
  }

  get canManageChannel(): boolean {
    const a = this.active;
    if (!a || !this.isChannel(a) || a.archived) return false;
    if (!this.isLive(a)) return true;               // demo rows stay fully exercisable
    const admins = a._channelAdmins || [];
    // An empty `admins` (a channel predating the field) would otherwise be frozen with nobody able
    // to post or fix it — the platform chat admins are the escape hatch, as they are for groups.
    if (!admins.length) return this.chatAdmin || this.adminRole;
    return admins.includes(this.currentProfileDocId) || this.chatAdmin || this.adminRole;
  }

  /** Broadcasting and editing carry the same permission — both are "run this channel". */
  get canBroadcast(): boolean { return this.canManageChannel; }

  /** One gate for the info panel, whichever kind of chat is open. */
  get canEditChat(): boolean {
    return this.isChannel(this.active) ? this.canManageChannel : this.canManageAdmins;
  }

  toggleGroupAdmin(mem: Member, event?: Event): void {
    event?.stopPropagation();
    const a = this.active;
    if (!a || !mem.id || !this.canManageAdmins) return;

    const isAdmin = this.isGroupAdmin(mem);
    // Never leave a group with no admin at all — nobody could appoint one again.
    if (isAdmin && (a.adminUids || []).length <= 1) {
      this.notify('A group needs at least one admin');
      return;
    }
    if (this.isLive(a)) {
      updateDoc(a._ref, { group_admin: isAdmin ? arrayRemove(mem.id) : arrayUnion(mem.id) })
        .then(() => this.notify(isAdmin ? `${mem.name} is no longer an admin` : `${mem.name} is now an admin`))
        .catch(e => { console.error('group admin', e); this.notify('Error updating admins'); });
      return;
    }
    const src = this.sourceOf(a);
    const list = src.adminUids || [];
    src.adminUids = isAdmin ? list.filter(id => id !== mem.id) : [...list, mem.id];
  }

  /** Only a group admin — someone listed in `group_admin` — posts on behalf of the team. */
  isAdminSender(name?: string, uid?: string): boolean {
    const a = this.active;
    if (!name || name === this.TEAM_NAME || !a) return false;
    const admins = a.adminUids || [];
    if (!admins.length) return false;
    const id = uid || (a.members || []).find(m => m.name === name)?.id;
    return !!id && admins.includes(id);
  }

  /**
   * Admins post on behalf of the team, so their messages read "A&H Team - Priya Sharma".
   * Everyone else shows their own name unchanged.
   */
  labelFor(name?: string, uid?: string): string {
    const n = name || '';
    return this.isAdminSender(n, uid) ? `${this.TEAM_NAME} - ${n}` : n;
  }

  /** The label for a message's sender, resolving "me" to the signed-in profile. */
  senderLabel(m: ChatMessage): string {
    const name = m.from === 'team' ? this.selfName : m.senderName;
    const uid = m._senderUid ?? (m.from === 'team' ? this.currentUid : undefined);
    return this.labelFor(name, uid);
  }

  get groupAdminCount(): number {
    return (this.active?.members || []).filter(m => this.isGroupAdmin(m)).length;
  }

  setArchivedSub(k: 'groups' | 'channels'): void {
    if (this.archivedSub === k) return;
    this.archivedSub = k;
    this.activeIds = { ...this.activeIds, archived: null };
    this.showInfo = false; this.infoMsg = null; this.person = null;
  }

  /** chat-screen's togglePinChat — pins the chat in the list, not a message. */
  togglePinChat(item: ChatItem, event: Event): void {
    event.stopPropagation();
    const next = !item.pinned;
    if (this.isLive(item)) {
      updateDoc(item._ref, { pinned: next })
        .then(() => this.notify(next ? 'Chat pinned' : 'Chat unpinned'))
        .catch(e => { console.error('pin chat', e); this.notify('Error updating pin status'); });
      return;
    }
    this.sourceOf(item).pinned = next;
  }

  unread(k: TabKey): number { return this.lists[k].reduce((a, c) => a + (c.unread || 0), 0); }

  get totalUnread(): number { return this.unread('groups') + this.unread('channels'); }

  countInCategory(c: string): number {
    return c === 'all' ? this.list.length : this.list.filter(x => x.category === c).length;
  }

  get features(): Features {
    return {
      groups:   { sender: true,  reply: true,  react: true,  oneWay: false, info: true,  attach: true,  readOnly: false },
      // A broadcast has no reactions, replies or per-message read receipts to render — its
      // delivery panel (sent / read / pending) replaces all of that.
      channels: { sender: false, reply: false, react: false, oneWay: true,  info: true,  attach: false, readOnly: false },
      archived: { sender: true,  reply: false, react: false, oneWay: false, info: false, attach: false, readOnly: true  },
    }[this.tab];
  }

  collOf(item?: ChatItem | null): string {
    return item?._coll || (this.tab === 'channels' ? 'webchatChannels' : 'webchatGroups');
  }

  isChannel(item: ChatItem | null): boolean {
    return !!item && (item._kind === 'channel' || (this.tab === 'channels' && !item._kind));
  }

  /** The live record behind an archived copy, so edits land on the source list. */
  private sourceOf(item: ChatItem): ChatItem {
    return this.groups.find(g => g.id === item.id) || this.channels.find(c => c.id === item.id) || item;
  }

  openItem(c: ChatItem): void {
    this.activeIds = { ...this.activeIds, [this.tab]: c.id };
    this.replyTo = null; this.showInfo = false; this.infoMsg = null;
    this.person = null; this.attachError = ''; this.pinnedOpen = false;
    this.clearPendingFiles();
    this.messagesError = '';
    this.memberSearch = ''; this.editingName = false;
    this.broadcastInfo = null; this.audienceOpen = false;
    this.oldestBroadcastDoc = null; this.hasMoreBroadcasts = false;
    if (this.isLive(c)) {
      if (this.isChannel(c)) {
        // Broadcasts are read-only history: fetch a page, no listener, nothing to mark read.
        this.messagesSub?.unsubscribe();
        this.loadBroadcasts(c);
      } else {
        this.subscribeMessages(c);
        if (c.unread) { this.sourceOf(c).unread = 0; this.markRead(c); }
      }
    } else if (c.unread) {
      this.sourceOf(c).unread = 0;
    }
    this.scrollToBottomSoon();
  }

  /** Narrow layouts show one pane at a time — this returns to the list. */
  closeThread(): void {
    this.activeIds = { ...this.activeIds, [this.tab]: null };
    this.showInfo = false; this.infoMsg = null; this.person = null;
    this.exitSelect();
  }

  switchTab(t: TabKey): void {
    this.tab = t;
    this.archivedSub = 'groups';
    this.search = ''; this.catFilter = 'all';
    this.replyTo = null; this.showInfo = false; this.infoMsg = null;
    this.person = null; this.attachError = ''; this.selectMode = false; this.selectedIds = [];
    this.scrollToBottomSoon();
  }

  /**
   * Clicking a profile picture opens it full size. With no picture there is nothing to enlarge,
   * so the click falls through to the person's profile panel instead.
   */
  openAvatar(name: string, event?: Event): void {
    event?.stopPropagation();
    const url = this.photoOf(name);
    if (url) { this.lightboxIsPortrait = true; this.lightbox = url; }
    else this.openPerson(name);
  }

  /** The group picture, enlarged. */
  openGroupPhoto(item: ChatItem | null, event?: Event): void {
    event?.stopPropagation();
    if (item?.photoUrl) { this.lightboxIsPortrait = true; this.lightbox = item.photoUrl; }
  }

  /** Profile pictures open at portrait size; message attachments keep the full-bleed lightbox. */
  lightboxIsPortrait = false;

  /** What the lightbox is currently showing. */
  lightboxKind: 'image' | 'video' = 'image';

  /** Attachment images always open full-bleed — never inherit the portrait sizing. */
  openImage(url: string): void {
    this.lightboxIsPortrait = false; this.lightboxKind = 'image'; this.lightbox = url;
  }

  openVideo(url: string): void {
    this.lightboxIsPortrait = false; this.lightboxKind = 'video'; this.lightbox = url;
  }

  /** View a staged attachment full size before it is sent. */
  previewPending(p: PendingFile): void {
    if (!p.previewUrl) return;
    if (p.type === 'image') this.openImage(p.previewUrl);
    else if (p.type === 'video') this.openVideo(p.previewUrl);
  }

  openPerson(name: string): void {
    if (!name || name === this.TEAM_NAME) return;
    this.person = { name, doc: this.directory[name] || null };
    this.showInfo = false; this.infoMsg = null;
    this.loadPersonTickets(name);
  }

  /**
   * Support tickets shown on a profile come from `participant metadata/{profileid}.customersupport`,
   * a map the `dashboardcustomersupport` cloud function maintains from `clientissue`:
   *
   *   customersupport: { <clientissueDocId>: { ticketno, category, issue, reporteddate, status } }
   *
   * The map KEY is the clientissue doc id, which is what the ticket page needs — so each row can deep
   * link straight to /customersupportdashboard/ticket/{docId}/{ticketno}.
   */
  personTickets: { id: string; ticketno: any; issue: string; category?: string; status?: string; at?: string }[] = [];
  personTicketsLoading = false;

  private async loadPersonTickets(name: string): Promise<void> {
    this.personTickets = [];
    const uid = (this.active?.members || []).find(m => m.name === name)?.id
      || Object.keys(this.profilesByUid).find(u => this.profilesByUid[u]?.['name'] === name);
    const profileId = uid ? this.profilesByUid[uid]?.['_profileId'] : this.person?.doc?.id;
    if (!profileId) return;

    this.personTicketsLoading = true;
    try {
      const snap = await getDoc(doc(this.firestore, 'participant metadata', profileId));
      const map = (snap.exists() ? snap.data()['customersupport'] : null) || {};
      this.personTickets = Object.keys(map).map(id => ({
        id,
        ticketno: map[id]?.['ticketno'] ?? null,
        issue: map[id]?.['issue'] || '(no description)',
        category: map[id]?.['category'] || '',
        status: map[id]?.['status'] || '',
        at: this.tsToIso(map[id]?.['reporteddate']),
      })).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    } catch (e) {
      console.error('participant metadata tickets', e);
    } finally {
      this.personTicketsLoading = false;
    }
  }

  /** The ticket page, same URL the support dashboard opens on a ctrl-click. */
  openTicketTab(t: { id: string; ticketno: any }): void {
    window.open(`/customersupportdashboard/ticket/${t.id}/${t.ticketno ?? ''}`, '_blank');
  }

  /** The person's own profile page. */
  openProfileTab(name: string): void {
    const uid = (this.active?.members || []).find(m => m.name === name)?.id
      || Object.keys(this.profilesByUid).find(u => this.profilesByUid[u]?.['name'] === name);
    const profileId = uid ? this.profilesByUid[uid]?.['_profileId'] : this.person?.doc?.id;
    if (!profileId) { this.notify('No profile record for this person'); return; }
    window.open(`/userprofile/${profileId}`, '_blank');
  }

  openMessageInfo(m: ChatMessage): void {
    this.infoMsg = m; this.showInfo = false; this.person = null;
  }

  toggleGroupInfo(): void {
    this.showInfo = !this.showInfo; this.infoMsg = null; this.person = null;
    this.memberSearch = ''; this.editingName = false;
  }

  /* ── Thread derived state ───────────────────────────────────────────── */

  get threadSenders(): string[] {
    return [...new Set((this.active?.messages || [])
      .map(m => m.from === 'team' ? this.TEAM_NAME : m.senderName).filter(Boolean))];
  }

  /**
   * Cached because the template reads it per message: recomputing (and re-flagging runs) on every
   * binding would be O(n²) on a long thread. The cache invalidates when the messages array is
   * replaced — every write path assigns a new array — or when the search inputs change.
   */
  private _visSrc: ChatMessage[] | null = null;
  private _visKey = '';
  private _vis: ChatMessage[] = [];

  get visibleMessages(): ChatMessage[] {
    const src = this.active?.messages || [];
    const key = `${this.msgSearch}¦${this.msgSearchUser}`;
    if (src === this._visSrc && key === this._visKey) return this._vis;

    // The sender dropdown filters; the text query does NOT — it collects hits to step through,
    // so the thread stays whole while searching.
    const list = src.filter(m => {
      const sender = m.from === 'team' ? this.selfName : m.senderName;
      return this.msgSearchUser === 'all' || sender === this.msgSearchUser;
    });

    const q = this.normalizeForSearch(this.msgSearch);
    const hits = q
      ? list.filter(m => this.normalizeForSearch(this.plainPreview(m.text)).includes(q)
          || this.normalizeForSearch(m.attachment?.name || '').includes(q)).map(m => m.id)
      : [];
    const hitsChanged = hits.length !== this.searchHitIds.length
      || hits.some((id, i) => id !== this.searchHitIds[i]);
    this.searchHitIds = hits;
    if (hitsChanged) this.searchHitIndex = hits.length ? hits.length - 1 : -1;

    list.forEach((m, i) => {
      m._runStart = this.isRunStart(list, i);
      const prev = list[i - 1];
      const day = new Date(m.at).toDateString();
      const prevDay = prev ? new Date(prev.at).toDateString() : '';
      m._dayLabel = (!prev || day !== prevDay) ? this.dayLabel(m.at) : '';
    });
    this._visSrc = src; this._visKey = key; this._vis = list;
    return list;
  }

  /** Ids of messages matching the in-thread query, oldest first. */
  searchHitIds: string[] = [];
  /** Which hit is currently focused; -1 when there are none. */
  searchHitIndex = -1;

  get searchHitCount(): number { return this.searchHitIds.length; }

  onMsgSearchChange(value: string): void {
    this.msgSearch = value;
    this.clearHighlight();
    // Let the visibleMessages pass rebuild the hit list, then land on the most recent match.
    setTimeout(() => { if (this.searchHitCount) this.focusHit(this.searchHitCount - 1); }, 0);
  }

  /** Step through hits; wraps at both ends. */
  stepHit(delta: number): void {
    if (!this.searchHitCount) return;
    const next = (this.searchHitIndex + delta + this.searchHitCount) % this.searchHitCount;
    this.focusHit(next);
  }

  private focusHit(index: number): void {
    this.searchHitIndex = index;
    const id = this.searchHitIds[index];
    // Stays lit while it is the focused match, so only ever one message is highlighted.
    if (id) this.scrollToMessage(id, true);
  }

  closeMsgSearch(): void {
    this.showMsgSearch = false;
    this.msgSearch = '';
    this.msgSearchUser = 'all';
    this.searchHitIds = [];
    this.searchHitIndex = -1;
    this.clearHighlight();
  }

  /** A run starts on a new sender, across a day boundary, or either side of an announcement. */
  private isRunStart(list: ChatMessage[], i: number): boolean {
    const m = list[i];
    const prev = list[i - 1];
    if (!prev) return true;
    if (m.kind === 'announcement' || prev.kind === 'announcement') return true;
    if (prev.from !== m.from || prev.senderName !== m.senderName) return true;
    const a = new Date(prev.at), b = new Date(m.at);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return true;
    return a.toDateString() !== b.toDateString();
  }

  get pinnedMessages(): ChatMessage[] { return (this.active?.messages || []).filter(m => m.pinned); }

  get pinnedReversed(): ChatMessage[] { return [...this.pinnedMessages].reverse(); }

  get lastPinnedPreview(): string {
    const pm = this.pinnedMessages[this.pinnedMessages.length - 1];
    return pm ? (this.plainPreview(pm.text) || '📎 attachment') : '';
  }

  get mentionNames(): string[] {
    return [this.selfName, ...((this.active?.members || []).map(m => m.name))].filter(Boolean);
  }

  /** Newest first — ISO timestamps sort lexicographically, so no Date parsing needed. */
  get threadAttachments(): (Attachment & { mid: string; at: string; sender: string })[] {
    return (this.active?.messages || [])
      .flatMap(m => {
        const own = this.attachmentsOf(m);
        // A broadcast keeps its files under _broadcast, so surface those in the Docs list too.
        const bc: Attachment[] = (m._broadcast?.files || [])
          .map(f => ({ type: this.attachmentTypeForName(f.name || f.url), dataUrl: f.url, name: f.name }));
        return [...own, ...bc].map(att => ({
          ...att, mid: m.id, at: m.at, sender: this.senderLabel(m),
        }));
      })
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  /** Broadcast files carry no mediatype, so the bucket comes off the filename. */
  private attachmentTypeForName(nameOrUrl: string): Attachment['type'] {
    const lower = (nameOrUrl || '').toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/.test(lower)) return 'image';
    if (/\.(mp4|mov|webm|avi)(\?|$)/.test(lower)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/.test(lower)) return 'voice';
    return 'file';
  }

  /** Photos and videos — the thumbnail grid. */
  get threadMedia() { return this.threadAttachments.filter(a => a.type === 'image' || a.type === 'video'); }
  /** Audio lives under Media too, but as players rather than thumbnails. */
  get threadAudio() { return this.threadAttachments.filter(a => a.type === 'voice'); }
  get threadMediaCount() { return this.threadMedia.length + this.threadAudio.length; }
  /** Docs are everything that is not playable or viewable. */
  get threadDocs()  { return this.threadAttachments.filter(a => a.type === 'file'); }

  /** Which of the three lists the info panel is showing — Media / Docs / Links, as WhatsApp does. */
  infoTab: 'media' | 'docs' | 'links' = 'media';

  /**
   * Whether the Media/links/docs block is rendered — the same condition its own *ngIf uses.
   * The member list is height-capped only when this is true: with something below it, a long list
   * would bury it; with nothing below, capping just adds a second scrollbar for no reason.
   */
  get hasMediaBlock(): boolean {
    return !!(this.threadAttachments.length || this.threadLinks.length);
  }

  /**
   * Every link shared in the thread: stored `buttons` plus bare URLs and `[Label](url)` still in the
   * message text, newest first, each carrying enough context to jump back to its message.
   */
  get threadLinks(): { label: string; href: string; host: string; sender: string; at: string; mid: string }[] {
    const out: { label: string; href: string; host: string; sender: string; at: string; mid: string }[] = [];
    const seen = new Set<string>();
    const urlRe = /(https?:\/\/[^\s<>"')]+)/g;

    for (const m of (this.active?.messages || [])) {
      const sender = m.from === 'team' ? this.selfName : m.senderName;
      const push = (label: string, href: string) => {
        const key = `${m.id}|${href}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ label, href, host: this.hostOf(href), sender, at: m.at, mid: m.id });
      };
      (m.buttons || []).forEach(b => push(b.label, b.href));
      (m._broadcast?.links || []).forEach(l => push(l.label, l.url));
      this.parsedOf(m).ctas.forEach(c => push(c.label, c.href));
      ((m.text || '').match(urlRe) || []).forEach(u => push(this.hostOf(u), u));
    }
    return out.reverse();
  }

  private hostOf(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; }
  }

  /** Filters the participant list in the info panel; shown once a group is big enough to need it. */
  memberSearch = '';

  get filteredParticipants(): Member[] {
    const q = this.memberSearch.trim().toLowerCase();
    if (!q) return this.participantMembers;
    return this.participantMembers.filter(m => (m.name || '').toLowerCase().includes(q));
  }

  /** Live groups have no team/participant split in `supportchat` — everyone is a participant. */
  get teamMembers(): Member[] {
    if (this.isLive(this.active)) return [];
    return (this.active?.members || []).filter(m => this.isTeamMember(m.name));
  }
  get participantMembers(): Member[] {
    if (this.isLive(this.active)) return this.active?.members || [];
    return (this.active?.members || []).filter(m => !this.isTeamMember(m.name));
  }

  get deletedLogReversed(): DeletedEntry[] { return [...(this.active?.deletedLog || [])].reverse(); }

  /* ── Bubble helpers ─────────────────────────────────────────────────── */

  isTeamMsg(m: ChatMessage): boolean { return m.from === 'team'; }

  /** A team message in a two-way thread is drawn light-on-purple. */
  /**
   * "Light" meant white-on-dark content inside a solid purple own-bubble. The console design has no
   * dark bubble — own messages are a pale tinted card — so nothing renders light any more. Leaving this
   * true made links, mentions, CTAs and the audio player white on near-white, i.e. invisible.
   */
  isLight(_m: ChatMessage): boolean { return false; }

  alignRight(m: ChatMessage): boolean { return !this.features.oneWay && m.from === 'team'; }

  reactionEntries(m: ChatMessage): { emoji: string; users: string[]; mine: boolean }[] {
    return Object.entries(m.reactions || {})
      .filter(([, v]) => (v || []).length)
      .map(([emoji, users]) => ({ emoji, users, mine: users.includes(this.TEAM_NAME) }));
  }

  bubbleWho(m: ChatMessage): string {
    if (this.features.oneWay) return '';
    if (m.from === 'team') return this.senderLabel(m);
    return this.features.sender ? '' : this.senderLabel(m);
  }

  canAct(m: ChatMessage): boolean {
    const f = this.features;
    return f.react || f.reply || !!m.text || (f.info && m.from === 'team');
  }

  /** Every message action, shown inline in the hover strip — there is no overflow menu. */
  actionsFor(m: ChatMessage) {
    const isTeam = m.from === 'team';
    const f = this.features;
    if (m._broadcast) {
      // Broadcasts are an archive written by the send job — nothing here edits or deletes one.
      // No ticket here: a ticket is raised against something a participant said, and a broadcast is
      // outbound. There is no participant on the other end of it to open a ticket about.
      return [
        { k: 'copy',      label: 'Copy text', icon: 'content_copy', show: !!m.text, danger: false },
        { k: 'delivered', label: 'Delivery',  icon: 'fact_check',   show: true,     danger: false },
      ].filter(o => o.show);
    }
    return [
      { k: 'copy',   label: 'Copy',                     icon: 'content_copy',   show: !!m.text,                  danger: false },
      { k: 'react',  label: 'React',                    icon: 'add_reaction',   show: f.react,                   danger: false },
      { k: 'reply',  label: 'Reply',                    icon: 'reply',          show: f.reply,                   danger: false },
      { k: 'edit',   label: 'Edit',                     icon: 'edit',           show: isTeam && !m.attachment,   danger: false },
      { k: 'pin',    label: m.pinned ? 'Unpin' : 'Pin', icon: 'push_pin',       show: true,                      danger: false },
      { k: 'ticket', label: 'Raise ticket',             icon: 'support',        show: !isTeam || f.oneWay,       danger: false },
      { k: 'info',   label: 'Message info',             icon: 'info',           show: f.info && isTeam,          danger: false },
      { k: 'delete', label: 'Delete',                   icon: 'delete_outline', show: true,                      danger: true  },
    ].filter(o => o.show);
  }

  onBubbleDblClick(m: ChatMessage): void {
    // Broadcasts are an archive — there is nothing here that bulk-deletes one.
    if (m._broadcast) return;
    if (this.selectMode) return;
    this.selectMode = true;
    this.selectedIds = [m.id];
  }

  toggleSelect(id: string): void {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter(x => x !== id)
      : [...this.selectedIds, id];
  }

  isSelected(id: string): boolean { return this.selectedIds.includes(id); }

  exitSelect(): void { this.selectMode = false; this.selectedIds = []; }

  selectAll(): void { this.selectedIds = this.visibleMessages.map(m => m.id); }

  askDeleteSelected(): void {
    this.confirmDelete = { msgs: (this.active?.messages || []).filter(m => this.selectedIds.includes(m.id)) };
  }

  /**
   * Scrolls a message into view and lights exactly ONE message at a time — any previous highlight is
   * cleared first. (Earlier this cancelled the pending clear-timer instead, which left every message
   * you stepped past still lit.)
   * `persist` keeps the highlight on while stepping through search hits; one-off jumps fade out.
   */
  scrollToMessage(id: string, persist = false): void {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    this.clearHighlight();
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    if (!persist) this.flashTimer = setTimeout(() => el.classList.remove('flash'), 1600);
  }

  private clearHighlight(): void {
    clearTimeout(this.flashTimer);
    document.querySelectorAll('.wc-msg.flash').forEach(n => n.classList.remove('flash'));
  }

  /* ── Sending · editing ──────────────────────────────────────────────── */

  private stamp(): string { return new Date().toISOString(); }

  private touch(item: ChatItem, lastMessage: string, at: string): void {
    const src = this.sourceOf(item);
    src.lastMessage = lastMessage;
    src.lastAt = at;
  }

  send(): void {
    const text = this.draft.trim();
    const active = this.active;
    if (!active) return;

    if (this.pendingFiles.length) {
      this.sendPendingFiles(active, text);
      return;
    }
    if (!text) return;
    this.clearDraft();

    if (this.isLive(active)) {
      // Announcement framing still has no field behind it; the reply does — see reply_to above.
      this.announceMode = false;
      const replyTarget = this.replyTo;
      const buttons = this.pendingButtons;
      this.replyTo = null;
      this.pendingButtons = [];
      this.justSent = true;
      this.writeMessage(active, text, [], replyTarget, buttons)
        .catch(e => { console.error('send', e); this.notify('Error sending message'); });
      return;
    }

    const at = this.stamp();
    const msg: ChatMessage = {
      id: `m-${Date.now()}`, from: 'team', senderName: this.TEAM_NAME, text, at,
      mentions: this.mentionsOf(text, this.mentionNames),
      buttons: this.pendingButtons,
      readBy: [], deliveredTo: [],
    };
    this.pendingButtons = [];
    if (this.announceMode) { msg.kind = 'announcement'; this.announceMode = false; }
    if (this.replyTo) {
      msg.replyTo = { senderName: this.replyTo.senderName, text: this.plainPreview(this.replyTo.text).slice(0, 120) };
    }
    this.replyTo = null;
    const src = this.sourceOf(active);
    src.messages = [...src.messages, msg];
    this.touch(active, (msg.kind === 'announcement' ? '📢 ' : '') + this.plainPreview(text), at);
    this.scrollToBottomSoon();
  }

  saveEdit(): void {
    const active = this.active;
    if (!active || !this.editing) return;
    const text = this.draft.trim();
    const editing = this.editing;
    this.clearDraft(); this.editing = null;
    if (!text) return;
    if (this.isLive(active)) {
      // Only the `message` field is written — chat-screen has no edit marker to set.
      const { message, mentions } = this.collapseMentions(text, active);
      updateDoc(editing._ref, { message, mentions, message_search: this.normalizeForSearch(message) })
        .catch(e => { console.error('edit', e); this.notify('Error editing message'); });
      return;
    }
    const src = this.sourceOf(active);
    src.messages = src.messages.map(m => m.id === editing.id
      ? { ...m, text, edited: true, editedAt: this.stamp(), mentions: this.mentionsOf(text, this.mentionNames), _parsedFor: undefined }
      : m);
  }

  onComposerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      if (this.mentionOptions.length) { e.preventDefault(); this.pickMention(this.mentionOptions[0]); return; }
      // Shift+Enter (and Alt/Ctrl/Cmd+Enter) insert a newline; plain Enter sends.
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      this.editing ? this.saveEdit() : this.send();
      return;
    }
    if (e.key === 'Escape') {
      if (this.mentionQuery !== null) { this.mentionQuery = null; return; }
      if (this.editing) { this.editing = null; this.clearDraft(); }
    }
  }

  composerPlaceholder(): string {
    if (this.announceMode) return 'Write an announcement…';
    if (this.editing) return 'Edit message…';
    if (this.tab === 'channels') return `Post to ${this.active?.name}…`;
    return `Message ${this.active?.name}…`;
  }

  /* ── Composer formatting ────────────────────────────────────────────── */

  applyFormat(kind: 'bold' | 'ul' | 'ol'): void {
    const el = this.composerRef?.nativeElement;
    if (!el) return;
    const start = el.selectionStart ?? this.draft.length;
    const end = el.selectionEnd ?? this.draft.length;
    const sel = this.draft.slice(start, end);
    let next: string;
    if (kind === 'bold') {
      next = this.draft.slice(0, start) + (sel ? `*${sel}*` : '**') + this.draft.slice(end);
    } else {
      const lines = (sel || 'item').split('\n');
      const marked = lines.map((l, i) => kind === 'ol' ? `${i + 1}. ${l}` : `- ${l}`).join('\n');
      const pre = start > 0 && this.draft[start - 1] !== '\n' ? '\n' : '';
      next = this.draft.slice(0, start) + pre + marked + this.draft.slice(end);
    }
    this.draft = next;
    setTimeout(() => el.focus(), 0);
  }

  /** Buttons attached to the message being composed — written to the `buttons` field on send. */
  pendingButtons: Cta[] = [];

  insertLink(label: string, url: string): void {
    if (!label.trim() || !url.trim()) return;
    if (this.pendingButtons.length >= 5) { this.notify('A message can carry at most 5 buttons'); return; }
    this.pendingButtons = [...this.pendingButtons, { label: label.trim(), href: url.trim() }];
    this.linkForm = null;
    setTimeout(() => this.composerRef?.nativeElement?.focus(), 0);
  }

  removePendingButton(i: number): void {
    this.pendingButtons = this.pendingButtons.filter((_, idx) => idx !== i);
  }

  onLinkKeydown(e: KeyboardEvent): void {
    if (!this.linkForm) return;
    if (e.key === 'Enter') this.insertLink(this.linkForm.label, this.linkForm.url);
    if (e.key === 'Escape') this.linkForm = null;
  }

  insertMention(token: string): void {
    const el = this.composerRef?.nativeElement;
    const at = el?.selectionStart ?? this.draft.length;
    this.draft = this.draft.slice(0, at) + token + ' ' + this.draft.slice(at);
    this.mentionQuery = null;
    setTimeout(() => el?.focus(), 0);
  }

  startPersonMention(): void {
    const el = this.composerRef?.nativeElement;
    const at = el?.selectionStart ?? this.draft.length;
    this.draft = this.draft.slice(0, at) + '@' + this.draft.slice(at);
    this.mentionQuery = '';
    setTimeout(() => { el?.focus(); el?.setSelectionRange(at + 1, at + 1); }, 0);
  }

  onDraftChange(val: string): void {
    this.draft = val;
    const pos = this.composerRef?.nativeElement.selectionStart ?? val.length;
    const m = val.slice(0, pos).match(MENTION_TOKEN_RE);
    this.mentionQuery = m ? m[1] : null;
    setTimeout(() => this.autoGrowComposer(), 0);
  }

  get mentionOptions(): MentionOption[] {
    const active = this.active;
    if (this.mentionQuery === null || !active) return [];
    const q = this.mentionQuery.trim().toLowerCase();
    const all: MentionOption[] = (active.members || [])
      // You cannot tag yourself.
      .filter(mem => mem.id !== this.currentUid && mem.name !== this.selfName)
      .map(mem => ({
        name: mem.name,
        display: `@${mem.name}`,
        sub: '',
        team: this.isTeamMember(mem.name),
      }));
    return all.filter(o => !q || o.name.toLowerCase().includes(q)).slice(0, 6);
  }

  pickMention(opt: MentionOption): void {
    const el = this.composerRef?.nativeElement;
    const pos = el?.selectionStart ?? this.draft.length;
    const before = this.draft.slice(0, pos).replace(MENTION_TOKEN_RE, `@${opt.name} `);
    this.draft = before + this.draft.slice(pos);
    this.mentionQuery = null;
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  }

  /* ── Attachments ────────────────────────────────────────────────────── */

  openAttach(pick: string): void {
    this.attachMenu = false;
    if (pick === 'rec') { this.startRecording(); return; }
    const map: { [k: string]: ElementRef<HTMLInputElement> | undefined } = {
      image: this.imgInput, video: this.vidInput, audio: this.audInput, doc: this.docInput,
    };
    map[pick]?.nativeElement.click();
  }

  private fileToAttachment(file: File): Promise<Attachment> {
    return new Promise((resolve, reject) => {
      if (/^image\//.test(file.type)) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const MAX = 1000;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ type: 'image', dataUrl, name: file.name, size: file.size });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image.')); };
        img.src = url;
        return;
      }
      const type: Attachment['type'] = /^audio\//.test(file.type) ? 'voice'
        : /^video\//.test(file.type) ? 'video' : 'file';
      const fr = new FileReader();
      fr.onload = () => resolve({ type, dataUrl: fr.result as string, name: file.name, size: file.size, duration: 0 });
      fr.onerror = () => reject(new Error('Could not read file.'));
      fr.readAsDataURL(file);
    });
  }

  /** Files chosen but not yet sent — previewed above the composer. */
  pendingFiles: PendingFile[] = [];

  /**
   * Attaching no longer sends. The file is staged with a preview so the caption can be typed and the
   * attachment reviewed (or removed) first; send() does the upload.
   */
  handleFilePicked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.active) return;
    this.attachError = '';

    if (this.pendingFiles.length >= 5) { this.notify('Up to 5 attachments per message'); return; }

    const mime = file.type || 'application/octet-stream';
    const type: Attachment['type'] =
      /^image\//.test(mime) ? 'image' :
      /^video\//.test(mime) ? 'video' :
      /^audio\//.test(mime) ? 'voice' : 'file';
    // Object URLs render image/video previews without reading the whole file into memory.
    const previewUrl = (type === 'image' || type === 'video' || type === 'voice')
      ? URL.createObjectURL(file) : undefined;
    this.pendingFiles = [...this.pendingFiles, { file, name: file.name, size: file.size, type, mime, previewUrl }];
  }

  removePendingFile(i: number): void {
    const gone = this.pendingFiles[i];
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
    this.pendingFiles = this.pendingFiles.filter((_, idx) => idx !== i);
  }

  private clearPendingFiles(): void {
    this.pendingFiles.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    this.pendingFiles = [];
  }

  /** Uploads the staged files, then posts them as one message with the draft as its caption. */
  private async sendPendingFiles(active: ChatItem, text: string): Promise<void> {
    const staged = this.pendingFiles;
    const replyTarget = this.replyTo;
    const buttons = this.pendingButtons;
    this.justSent = true;
    this.clearDraft(); this.replyTo = null; this.pendingButtons = [];
    this.uploadingFiles = true;
    try {
      if (this.isLive(active)) {
        const records: any[] = [];
        for (const p of staged) {
          records.push(await this.uploadToStorage(active.id, p.file, p.name, p.mime));
        }
        await this.writeMessage(active, text, records, replyTarget, buttons);
      } else {
        const at = this.stamp();
        const attachments: Attachment[] = [];
        for (const p of staged) attachments.push(await this.fileToAttachment(p.file));
        const msg: ChatMessage = {
          id: `m-${Date.now()}`, from: 'team', senderName: this.TEAM_NAME, text, at,
          attachment: attachments[0], attachments, buttons, readBy: [], deliveredTo: [],
        };
        if (replyTarget) msg.replyTo = { senderName: replyTarget.senderName, text: (replyTarget.text || '').slice(0, 120) };
        const src = this.sourceOf(active);
        src.messages = [...src.messages, msg];
        this.touch(active, text || this.attachmentSummary(attachments), at);
      }
      this.clearPendingFiles();
      this.scrollToBottomSoon();
    } catch (err: any) {
      console.error('attach', err);
      this.attachError = err?.message || 'Could not send attachment.';
    } finally {
      this.uploadingFiles = false;
    }
  }

  private attachmentSummary(atts: Attachment[]): string {
    const first = atts[0];
    if (!first) return '';
    const label = first.type === 'image' ? '📷 Photo' : first.type === 'video' ? '🎥 Video'
      : first.type === 'voice' ? '🎤 Voice note' : `📎 ${first.name}`;
    return atts.length > 1 ? `${label} +${atts.length - 1}` : label;
  }


  async startRecording(): Promise<void> {
    this.attachError = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = (window as any).MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      this.recChunks = [];
      rec.ondataavailable = e => { if (e.data.size) this.recChunks.push(e.data); };
      rec.addEventListener('stop', () => stream.getTracks().forEach(t => t.stop()), { once: true });
      rec.start();
      this.mediaRecorder = rec;
      this.recSecs = 0;
      this.recording = true;
      this.recTimer = setInterval(() => { this.recSecs += 1; }, 1000);
    } catch (err: any) {
      this.attachError = `Microphone unavailable: ${err?.name === 'NotAllowedError' ? 'permission denied' : (err?.message || err?.name)}`;
    }
  }

  private stopRecorder(): Promise<void> {
    clearInterval(this.recTimer);
    this.recording = false;
    return new Promise(res => {
      const rec = this.mediaRecorder;
      if (!rec || rec.state === 'inactive') { res(); return; }
      rec.addEventListener('stop', () => res(), { once: true });
      rec.stop();
    });
  }

  async cancelRecording(): Promise<void> {
    await this.stopRecorder();
    this.recChunks = [];
  }

  async finishRecording(): Promise<void> {
    const target = this.active;
    const secs = this.recSecs;
    await this.stopRecorder();
    const blob = new Blob(this.recChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
    this.recChunks = [];
    if (!target || blob.size === 0) return;

    if (this.isLive(target)) {
      try {
        const mime = blob.type || 'audio/webm';
        const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'ogg';
        const record = await this.uploadToStorage(target.id, blob, `voice-note-${secs}s.${ext}`, mime);
        const replyTarget = this.replyTo;
        this.replyTo = null;
        this.justSent = true;
        await this.writeMessage(target, '', [record], replyTarget);
      } catch (err: any) {
        console.error('voice note', err);
        this.attachError = err?.message || 'Could not send voice note.';
      }
      return;
    }

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(new Error('Could not read recording.'));
        fr.readAsDataURL(blob);
      });
      const at = this.stamp();
      const msg: ChatMessage = {
        id: `m-${Date.now()}`, from: 'team', senderName: this.TEAM_NAME, text: '', at,
        attachment: { type: 'voice', dataUrl, size: blob.size, duration: secs },
        readBy: [], deliveredTo: [],
      };
      if (this.replyTo) msg.replyTo = { senderName: this.replyTo.senderName, text: (this.replyTo.text || '').slice(0, 120) };
      this.replyTo = null;
      const src = this.sourceOf(target);
      src.messages = [...src.messages, msg];
      this.touch(target, '🎤 Voice note', at);
      this.scrollToBottomSoon();
    } catch (err: any) {
      this.attachError = err?.message || 'Could not send voice note.';
    }
  }

  /* ── Voice playback ─────────────────────────────────────────────────── */



  /* ── Message actions ────────────────────────────────────────────────── */

  /**
   * Raise a support ticket from a message using the Customer Support screen's own add-issue dialog,
   * so a ticket raised here is identical to one raised there. On success the new ticket opens in a new
   * tab — the same URL the dashboard opens on a ctrl/cmd-click.
   */
  raiseTicket(m: ChatMessage): void {
    const senderUid = m._senderUid ?? (m.from === 'team' ? this.currentUid : undefined);
    const senderProfileId = senderUid ? this.profilesByUid[senderUid]?.['_profileId'] : undefined;

    const dialogRef = this.dialog.open(AddIssueComponent, {
      data: {
        type: 'new',
        metadata: {
          // Prefill what the message already tells us; the rest is filled in the dialog.
          issue: this.plainPreview(m.text || '') || (m.attachment?.name ?? ''),
          clientid: senderProfileId ?? null,
        },
        categories: this.ticketCategories,
        status: this.ticketStatusList,
        journey: this.journeyList,
        reportedBy: this.selfName,
        timestamp: new Date().toISOString(),
        mapprofileUid: this.profileMapByDocId,
        recentticket: this.recentTicketNumber,
      },
      autoFocus: false,
      width: 'min(1150px, 96vw)',
      maxHeight: '92vh',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (!result?.id) return;                       // cancelled
      this.recentTicketNumber = result.issueno ?? this.recentTicketNumber;
      window.open(`/customersupportdashboard/ticket/${result.id}/${result.issueno}`, '_blank');
    });
  }

  /** Copies the message text as typed — links and formatting intact. */
  copyMessage(m: ChatMessage): void {
    const text = m.text || (m.attachment?.name ?? '');
    if (!text) { this.notify('Nothing to copy'); return; }
    // The async Clipboard API needs document focus and permission; it is refused in some
    // embedded/webview contexts, so fall back to the execCommand path before reporting failure.
    const done = () => this.notify('Message copied');
    navigator.clipboard?.writeText(text).then(done).catch(() => {
      this.notify(this.copyViaTextarea(text) ? 'Message copied' : 'Could not copy message');
    });
  }

  private copyViaTextarea(text: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  handleMenuAction(action: string, m: ChatMessage): void {
    if (action === 'reply')  { this.replyTo = m; return; }
    if (action === 'react')  { this.pickerId = this.pickerId === m.id ? null : m.id; return; }
    if (action === 'info')   { this.openMessageInfo(m); return; }
    if (action === 'copy')   this.copyMessage(m);
    if (action === 'edit')   { this.editing = m; this.draft = m.text || ''; }
    if (action === 'delete') this.confirmDelete = { msgs: [m] };
    if (action === 'pin')    this.togglePin(m);
    if (action === 'react')  this.pickerId = m.id;
    if (action === 'ticket') this.raiseTicket(m);
    if (action === 'delivered') this.openBroadcastInfo(m);
  }

  /* ── Broadcast delivery panel ───────────────────────────────────────
     chat-screen's channel participants panel, re-cut for the console design. All three audiences
     are profile_data doc ids, so they resolve through profileByDocId, not the uid directory. */

  openBroadcastInfo(m: ChatMessage): void {
    if (!m._broadcast) return;
    this.broadcastInfo = m;
    this.broadcastTab = 'read';
    this.showInfo = false; this.infoMsg = null; this.person = null;
  }

  closeBroadcastInfo(): void { this.broadcastInfo = null; }

  /** The audience list behind the panel's current tab, resolved to names and pictures. */
  get broadcastAudience(): { id: string; name: string; photoUrl: string | null }[] {
    const b = this.broadcastInfo?._broadcast;
    if (!b) return [];
    const ids = this.broadcastTab === 'sent' ? b.sentTo : this.broadcastTab === 'read' ? b.readBy : b.pending;
    return ids
      .map(id => ({ id, name: this.nameOfProfileDoc(id), photoUrl: this.photoOfProfileDoc(id) }))
      .sort((a, b2) => a.name.localeCompare(b2.name));
  }

  broadcastCount(m: ChatMessage, which: 'sent' | 'read' | 'pending'): number {
    const b = m._broadcast;
    if (!b) return 0;
    return (which === 'sent' ? b.sentTo : which === 'read' ? b.readBy : b.pending).length;
  }

  /** Header media on a broadcast card — the send job stores a type and a URL. */
  broadcastHeaderIsVideo(m: ChatMessage): boolean {
    const t = (m._broadcast?.headerType || '').toLowerCase();
    return t.includes('video') || /\.(mp4|mov|webm)(\?|$)/i.test(m._broadcast?.headerValue || '');
  }

  broadcastHeaderIsImage(m: ChatMessage): boolean {
    const b = m._broadcast;
    if (!b?.headerValue) return false;
    return !this.broadcastHeaderIsVideo(m);
  }

  /** Same extension mapping chat-screen used for channel file cards. */
  fileIconFor(nameOrUrl: string): string {
    const lower = (nameOrUrl || '').toLowerCase();
    if (!lower) return 'attach_file';
    if (lower.includes('.pdf')) return 'picture_as_pdf';
    if (/\.(doc|docx)/.test(lower)) return 'description';
    if (/\.(xls|xlsx|csv)/.test(lower)) return 'table_chart';
    if (/\.(ppt|pptx)/.test(lower)) return 'slideshow';
    if (/\.(mp4|mov|avi|webm)/.test(lower)) return 'videocam';
    if (/\.(mp3|wav|ogg|m4a)/.test(lower)) return 'audiotrack';
    if (/\.(jpg|jpeg|png|gif|webp)/.test(lower)) return 'image';
    if (/\.(zip|rar|7z)/.test(lower)) return 'archive';
    return 'attach_file';
  }

  fileExtFor(filename: string): string {
    const parts = (filename || '').split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase().slice(0, 4) : 'FILE';
  }

  openExternal(url: string, event?: Event): void {
    event?.stopPropagation();
    if (url) window.open(url, '_blank', 'noopener');
  }

  /* ── Broadcasting ───────────────────────────────────────────────────
     Two steps, exactly as chat-screen had them: choose the audience here, then hand the selection
     to ChannelCommunicationComponent, which owns the template picker, the variable filling and the
     write to `channelarchive`. Nothing about that contract changes — this screen only feeds it. */

  openAudience(): void {
    this.audienceOpen = true;
    this.audienceSearch = '';
    this.audiencePicked = [];
  }

  closeAudience(): void { this.audienceOpen = false; }

  /** Every profile with a name, keyed by doc id — the identifier the broadcast expects. */
  get audiencePool(): { id: string; name: string; email: string; photoUrl: string | null }[] {
    const source = Object.keys(this.profileByDocId).length ? this.profileByDocId : null;
    if (!source) {
      return Object.entries(this.profileMapByDocId || {})
        .filter(([, p]: any) => !!p?.['name'])
        .map(([id, p]: any) => ({ id, name: p['name'], email: p['email'] || '', photoUrl: p['profile'] || null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return Object.entries(source)
      .map(([id, p]) => ({
        id, name: p.name, photoUrl: p.photoUrl,
        email: this.profileMapByDocId?.[id]?.['email'] || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get audienceShown(): { id: string; name: string; email: string; photoUrl: string | null }[] {
    const q = this.audienceSearch.trim().toLowerCase();
    return this.audiencePool
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
      .slice(0, 200);
  }

  isAudiencePicked(id: string): boolean { return this.audiencePicked.includes(id); }

  toggleAudience(id: string): void {
    this.audiencePicked = this.isAudiencePicked(id)
      ? this.audiencePicked.filter(x => x !== id)
      : [...this.audiencePicked, id];
  }

  /** Select-all applies to what the search is currently showing, not the whole directory. */
  selectAllAudience(): void {
    const shown = this.audienceShown.map(p => p.id);
    const allPicked = shown.every(id => this.isAudiencePicked(id));
    this.audiencePicked = allPicked
      ? this.audiencePicked.filter(id => !shown.includes(id))
      : [...new Set([...this.audiencePicked, ...shown])];
  }

  /** Pre-select everyone already on the channel. */
  useChannelMembers(): void {
    this.audiencePicked = [...(this.active?._memberProfileIds || [])];
  }

  proceedBroadcast(): void {
    if (!this.audiencePicked.length) { this.notify('Pick at least one participant'); return; }
    const byId = new Map(this.audiencePool.map(p => [p.id, p]));
    const participants = this.audiencePicked.map(id => ({
      profileid: id,
      name: byId.get(id)?.name || '',
      email: byId.get(id)?.email || '',
    }));
    this.audienceOpen = false;
    this.dialog.open(ChannelCommunicationComponent, {
      data: participants,
      width: 'min(880px, 96vw)',
      maxHeight: '92vh',
      panelClass: 'ow-dialog-panel',
    }).afterClosed().subscribe(result => {
      if (!result?.success) return;
      this.notify('Broadcast sent');
      // The send job writes the message asynchronously, so re-read rather than guess.
      if (this.active) { this.oldestBroadcastDoc = null; this.loadBroadcasts(this.active); }
    });
  }

  /**
   * "New channel" opens ChannelCommunication with no audience — its first step creates the channel.
   * Creating one here would mean duplicating that form and its `admins` contract.
   */
  private openChannelCreate(): void {
    this.dialog.open(ChannelCommunicationComponent, {
      data: [],
      width: 'min(880px, 96vw)',
      maxHeight: '92vh',
      panelClass: 'ow-dialog-panel',
    }).afterClosed().subscribe(() => {
      this.lastChannelDoc = { active: null, archived: null };
      this.loadChannels(false);
    });
  }

  togglePin(m: ChatMessage): void {
    const active = this.active;
    if (!active) return;
    if (this.isLive(active)) {
      updateDoc(m._ref, { pinned: !m.pinned })
        .catch(e => { console.error('pin', e); this.notify('Error updating pin'); });
      return;
    }
    const src = this.sourceOf(active);
    src.messages = src.messages.map(x => x.id === m.id ? { ...x, pinned: !x.pinned } : x);
  }

  toggleReaction(msgId: string, emoji: string): void {
    const active = this.active;
    if (!active) return;
    const src = this.sourceOf(active);
    src.messages = src.messages.map(m => {
      if (m.id !== msgId) return m;
      const r: { [k: string]: string[] } = { ...(m.reactions || {}) };
      const arr = r[emoji] ? [...r[emoji]] : [];
      const i = arr.indexOf(this.TEAM_NAME);
      if (i >= 0) arr.splice(i, 1); else arr.push(this.TEAM_NAME);
      if (arr.length) r[emoji] = arr; else delete r[emoji];
      return { ...m, reactions: r };
    });
    this.pickerId = null;
  }

  private kindOf(m: ChatMessage): string { return m.attachment?.type || 'text'; }

  deleteMessages(msgs: ChatMessage[]): void {
    const active = this.active;
    if (!active || !msgs.length) return;
    const ids = msgs.map(m => m.id);

    if (this.isLive(active)) {
      const batch = writeBatch(this.firestore);
      msgs.forEach(m => batch.delete(doc(this.supportchat, active.id, 'messages', m.id)));
      batch.commit()
        .then(() => this.notify(`${msgs.length} message${msgs.length === 1 ? '' : 's'} deleted`))
        .catch(e => { console.error('delete messages', e); this.notify('Error deleting messages'); });
      this.exitSelect();
      this.infoMsg = null;
      return;
    }

    const nowIso = this.stamp();
    const logEntries: DeletedEntry[] = msgs.map(m => ({
      id: m.id,
      kind: this.kindOf(m),
      name: m.attachment?.name || this.plainPreview(m.text).slice(0, 60) || '(no text)',
      sentBy: m.from === 'team' ? this.TEAM_NAME : m.senderName,
      sentAt: m.at || '',
      deletedBy: this.TEAM_NAME,
      deletedAt: nowIso,
    }));
    const src = this.sourceOf(active);
    const remaining = src.messages.filter(m => !ids.includes(m.id));
    const last = remaining[remaining.length - 1];
    src.messages = remaining;
    src.deletedLog = [...(src.deletedLog || []), ...logEntries];
    src.lastMessage = last ? (this.plainPreview(last.text) || (last.attachment ? `📎 ${last.attachment.name || last.attachment.type}` : '—')) : '';
    src.lastAt = last ? last.at : src.lastAt;
    this.exitSelect();
    this.infoMsg = null;
  }

  confirmDeleteNow(): void {
    if (!this.confirmDelete) return;
    if (this.confirmDelete.group) this.deleteGroup();
    else { this.deleteMessages(this.confirmDelete.msgs || []); this.confirmDelete = null; }
  }

  removeMember(name: string): void {
    const active = this.active;
    if (!active) return;
    if (this.isLive(active)) {
      const uid = (active.members || []).find(m => m.name === name)?.id;
      if (!uid) return;
      // Strip the admin grant too — otherwise the uid lingers in group_admin and canManageAdmins
      // would still hand an ex-member permission over the group.
      updateDoc(active._ref, { members: arrayRemove(uid), group_admin: arrayRemove(uid) })
        .catch(e => { console.error('remove member', e); this.notify('Error removing member'); });
      return;
    }
    const src = this.sourceOf(active);
    const goneUid = (src.members || []).find(m => m.name === name)?.id;
    src.members = (src.members || []).filter(m => m.name !== name);
    if (goneUid) src.adminUids = (src.adminUids || []).filter(id => id !== goneUid);
  }

  /**
   * There is no separate archive in this data model: chat-screen's delete sets `isdelete`, and the
   * Archived tab is simply where `isdelete === true` groups live. So the only action here is the
   * reverse one — putting a deleted group back (chat-screen's restoreGroup).
   */
  restoreGroup(): void {
    const active = this.active;
    if (!active) return;
    if (this.isLive(active)) {
      const isChan = this.isChannel(active);
      updateDoc(active._ref, { isdelete: false })
        .then(() => {
          this.notify(isChan ? 'Channel restored to Active' : 'Group restored to Active');
          // Channels have no listener, so nothing would move between the lists on its own.
          if (isChan) this.reloadChannels();
        })
        .catch(e => { console.error('restore', e); this.notify('Error restoring'); });
    } else {
      this.sourceOf(active).archived = false;
    }
    this.activeIds = { ...this.activeIds, [this.tab]: null };
    this.showInfo = false;
  }

  deleteGroup(): void {
    const active = this.active;
    if (!active) return;
    if (this.isLive(active)) {
      // chat-screen never hard-deletes a chat — it sets isdelete, which lands it in Archived.
      const isChan = this.isChannel(active);
      updateDoc(active._ref, { isdelete: true })
        .then(() => {
          this.notify(isChan ? 'Channel moved to Archived' : 'Group moved to Archived');
          if (isChan) this.reloadChannels();
        })
        .catch(e => { console.error('delete chat', e); this.notify('Error deleting'); });
      this.activeIds = { ...this.activeIds, [this.tab]: null };
      this.showInfo = false;
      this.confirmDelete = null;
      return;
    }
    this.groups = this.groups.filter(g => g.id !== active.id);
    this.channels = this.channels.filter(c => c.id !== active.id);
    this.activeIds = { ...this.activeIds, [this.tab]: null };
    this.showInfo = false;
    this.confirmDelete = null;
  }

  /* ── Create modal ───────────────────────────────────────────────────── */

  get isGroupCreate(): boolean { return this.tab === 'groups'; }

  openCreate(): void {
    if (this.tab === 'channels') { this.openChannelCreate(); return; }
    this.createOpen = true;
    this.cName = ''; this.cEventId = '';
    this.cSearch = ''; this.cSelected = [];
    this.cAdminIds = []; this.cImageFile = null; this.cImagePreview = null;
  }

  /** Team and participants merged, de-duplicated by id. */
  get createPool(): Person[] {
    const seen = new Set<string>();
    return [...this.team, ...this.participants].filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  isCreateAdmin(id: string): boolean { return this.cAdminIds.includes(id); }

  toggleCreateAdmin(p: Person, event: Event): void {
    event.stopPropagation();
    if (!this.isPicked(p.id)) this.togglePerson(p);      // marking an admin implies membership
    this.cAdminIds = this.isCreateAdmin(p.id)
      ? this.cAdminIds.filter(id => id !== p.id)
      : [...this.cAdminIds, p.id];
  }

  onGroupImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cImageFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.cImagePreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  clearGroupImage(): void { this.cImageFile = null; this.cImagePreview = null; }

  get createShown(): Person[] {
    const q = this.cSearch.toLowerCase();
    return this.createPool.filter(p => !q || p.name.toLowerCase().includes(q)).slice(0, 40);
  }

  isPicked(id: string): boolean { return this.cSelected.some(s => s.id === id); }

  togglePerson(p: Person): void {
    if (this.isPicked(p.id)) {
      this.cSelected = this.cSelected.filter(s => s.id !== p.id);
      this.cAdminIds = this.cAdminIds.filter(id => id !== p.id);
    } else {
      this.cSelected = [...this.cSelected, { id: p.id, name: p.name, journey: p.journey || null }];
    }
  }

  get canSaveCreate(): boolean { return !!this.cName.trim() && (!this.isGroupCreate || this.cSelected.length > 0); }

  saveCreate(): void {
    if (!this.canSaveCreate || this.cSaving) return;
    const isGroup = this.isGroupCreate;

    if (isGroup && this.liveMode) {
      this.createLiveGroup();
      return;
    }

    const existingIds = this.list.map(c => c.id);
    let id = this.slugify(this.cName.trim()) || `${this.tab}-${Date.now().toString(36)}`;
    while (existingIds.includes(id)) id += '-2';
    const ev = this.events.find(e => e.id === this.cEventId);
    const item: ChatItem = {
      id,
      name: this.cName.trim(),
      emoji: this.cEmoji,
      description: this.cDesc.trim(),
      eventId: ev ? ev.id : null,
      eventName: ev ? ev.title : null,
      createdBy: this.TEAM_NAME,
      messages: [], lastMessage: '', lastAt: this.stamp(), unread: 0, deletedLog: [],
      category: null,
    };
    if (isGroup) { item.members = [...this.cSelected]; this.groups = [item, ...this.groups]; }
    else { item.followers = 0; this.channels = [item, ...this.channels]; }
    this.createOpen = false;
    this.activeIds = { ...this.activeIds, [this.tab]: id };
  }

  /* ── Editing a live group's name and picture ────────────────────────
     Both are existing fields on the supportchat doc (`group_name`, `group_profile`), and the picture
     goes to the same Storage path buildGroup() uses, so the old screen shows the change too. */

  editingName = false;
  nameDraft = '';
  savingGroupPhoto = false;

  startEditName(): void {
    if (!this.canEditChat) {
      this.notify(this.isChannel(this.active)
        ? 'Only a channel admin can rename this channel'
        : 'Only a group admin can rename this group');
      return;
    }
    this.nameDraft = this.active?.name || '';
    this.editingName = true;
  }

  cancelEditName(): void { this.editingName = false; this.nameDraft = ''; }

  saveGroupName(): void {
    const active = this.active;
    const name = this.nameDraft.trim();
    if (!active || !name || name === active.name) { this.cancelEditName(); return; }
    this.editingName = false;
    const isChan = this.isChannel(active);
    if (this.isLive(active)) {
      // Channels have no listener, so the local copy is updated too or the change would not show.
      updateDoc(active._ref, { group_name: name })
        .then(() => { if (isChan) this.sourceOf(active).name = name;
                      this.notify(isChan ? 'Channel renamed' : 'Group renamed'); })
        .catch(e => { console.error('rename chat', e); this.notify('Error renaming'); });
    } else {
      this.sourceOf(active).name = name;
    }
  }

  /* ── Editing a channel's description and admins ─────────────────────
     `description` and `admins` are both fields ChannelCommunication already writes at create time,
     so nothing new is introduced here — this is the same document, edited later. */

  editingDesc = false;
  descDraft = '';

  startEditDesc(): void {
    if (!this.canManageChannel) { this.notify('Only a channel admin can edit the description'); return; }
    this.descDraft = this.active?.description || '';
    this.editingDesc = true;
  }

  cancelEditDesc(): void { this.editingDesc = false; this.descDraft = ''; }

  saveChannelDesc(): void {
    const active = this.active;
    const desc = this.descDraft.trim();
    if (!active || desc === (active.description || '')) { this.cancelEditDesc(); return; }
    this.editingDesc = false;
    if (!this.isLive(active)) { this.sourceOf(active).description = desc; return; }
    updateDoc(active._ref, { description: desc })
      .then(() => { this.sourceOf(active).description = desc; this.notify('Description updated'); })
      .catch(e => { console.error('channel description', e); this.notify('Error saving description'); });
  }

  /** Admin picker — the same directory the audience picker uses, keyed by profile doc id. */
  adminsOpen = false;
  adminSearch = '';
  adminPicked: string[] = [];
  savingAdmins = false;

  openEditAdmins(): void {
    if (!this.canManageChannel) { this.notify('Only a channel admin can change admins'); return; }
    this.adminSearch = '';
    this.adminPicked = [...(this.active?._channelAdmins || [])];
    this.adminsOpen = true;
  }

  closeEditAdmins(): void { this.adminsOpen = false; }

  get adminShown(): { id: string; name: string; email: string; photoUrl: string | null }[] {
    const q = this.adminSearch.trim().toLowerCase();
    return this.audiencePool
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
      .slice(0, 200);
  }

  isAdminPicked(id: string): boolean { return this.adminPicked.includes(id); }

  toggleAdminPick(id: string): void {
    this.adminPicked = this.isAdminPicked(id)
      ? this.adminPicked.filter(x => x !== id)
      : [...this.adminPicked, id];
  }

  async saveChannelAdmins(): Promise<void> {
    const active = this.active;
    if (!active || this.savingAdmins) return;
    // ChannelCommunication refuses to create a channel with no admin; the same has to hold on edit,
    // or a channel becomes unrunnable by anyone but a platform admin.
    if (!this.adminPicked.length) { this.notify('A channel needs at least one admin'); return; }

    const admins = [...this.adminPicked];
    if (!this.isLive(active)) {
      active._channelAdmins = admins;
      this.adminsOpen = false;
      return;
    }

    this.savingAdmins = true;
    try {
      // An admin must also be a recipient — createChannel seeds `members` with the admins, and the
      // Recipients list (and so the ADMIN pill) is driven by `members`.
      await updateDoc(active._ref, { admins, members: arrayUnion(...admins) });
      const src = this.sourceOf(active);
      src._channelAdmins = admins;
      const merged = [...new Set([...(src._memberProfileIds || []), ...admins])];
      src._memberProfileIds = merged;
      src.members = merged.map(id => ({ id, name: this.nameOfProfileDoc(id), journey: null }));
      src.followers = merged.length;
      this.adminsOpen = false;
      this.notify('Channel admins updated');
    } catch (e) {
      console.error('channel admins', e);
      this.notify('Error updating admins');
    } finally {
      this.savingAdmins = false;
    }
  }

  async onGroupPhotoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const active = this.active;
    if (!file || !active) return;
    if (!this.canEditChat) { this.notify('Only an admin can change the picture'); return; }
    const isChan = this.isChannel(active);

    this.savingGroupPhoto = true;
    try {
      if (this.isLive(active)) {
        // Channels keep their pictures where ChannelCommunication puts them, groups where
        // chat-screen's buildGroup puts them — so both screens read the same image either way.
        const imgRef = ref(this.storage, isChan
          ? `channel-images/${Date.now()}_${file.name}`
          : `Chat/${file.name}${file.lastModified}${file.size}`);
        const uploaded = await uploadBytes(imgRef, file);
        const url = await getDownloadURL(uploaded.ref);
        await updateDoc(active._ref, { group_profile: url });
        if (isChan) this.sourceOf(active).photoUrl = url;
        this.notify(isChan ? 'Channel picture updated' : 'Group picture updated');
      } else {
        this.sourceOf(active).photoUrl = URL.createObjectURL(file);
      }
    } catch (e) {
      console.error('group picture', e);
      this.notify('Could not update the picture');
    } finally {
      this.savingGroupPhoto = false;
    }
  }

  /** buildGroup() from chat-screen: same doc shape, plus the emoji this UI picks. */
  private async createLiveGroup(): Promise<void> {
    const members = this.cSelected.map(m => m.id);
    if (!members.includes(this.currentUid)) members.push(this.currentUid);
    if (members.length < 2) { this.notify('Select at least 2 members to create a group'); return; }

    this.cSaving = true;
    const docId = doc(collection(this.firestore, 'temp')).id;
    try {
      // Same Storage path shape chat-screen's buildGroup uses, so both screens read one picture.
      let groupProfile: string | null = null;
      if (this.cImageFile) {
        const f = this.cImageFile;
        const imgRef = ref(this.storage, `Chat/${f.name}${f.lastModified}${f.size}`);
        const uploaded = await uploadBytes(imgRef, f);
        groupProfile = await getDownloadURL(uploaded.ref);
      }
      const admins = [this.currentUid, ...this.cAdminIds.filter(id => id !== this.currentUid)];
      await setDoc(doc(this.firestore, 'supportchat', docId), {
        isdelete: false,
        type: 'group',
        members,
        group_name: this.cName.trim(),
        last_message: '',
        last_pending: [],
        group_profile: groupProfile,
        group_admin: admins,
        last_modification: serverTimestamp(),
        created_on: serverTimestamp(),
        creator_uid: this.currentUid,
        id: docId,
      }, { merge: true });
      this.createOpen = false;
      this.activeIds = { ...this.activeIds, groups: docId };
      this.notify('Group created');
    } catch (e) {
      console.error('create group', e);
      this.notify('Error creating group');
    } finally {
      this.cSaving = false;
    }
  }

  /** Delete is chat-screen's soft delete — the group moves to Archived and can be restored. */
  get deleteGroupCopy(): string {
    const name = this.active?.name || '';
    return this.isLive(this.active)
      ? `“${name}” will be removed from the active list. Its messages stay readable under Archived, and it can be restored from there.`
      : `“${name}” and all its messages and shared media will be permanently removed. This cannot be undone.`;
  }

  /**
   * CTAs shown under a bubble: the stored `buttons` field first, plus any legacy `[Label](url)`
   * still embedded in older message text.
   */
  ctasOf(m: ChatMessage): Cta[] {
    return [...(m.buttons || []), ...this.parsedOf(m).ctas];
  }

  /** Every file on a message; falls back to the single demo attachment. */
  attachmentsOf(m: ChatMessage): Attachment[] {
    if (m.attachments?.length) return m.attachments;
    return m.attachment ? [m.attachment] : [];
  }

  /* ── Add-members modal ──────────────────────────────────────────────── */

  openAddMembers(): void {
    this.addingMembers = true;
    this.aSearch = ''; this.aPicked = [];
  }

  /** One list, same as the create dialog — team and participants merged, current members excluded. */
  get addPool(): Person[] {
    const existing = new Set((this.active?.members || []).map(m => m.name));
    return this.createPool.filter(p => !existing.has(p.name));
  }

  get addShown(): Person[] {
    const q = this.aSearch.toLowerCase();
    return this.addPool.filter(p => !q || p.name.toLowerCase().includes(q)).slice(0, 40);
  }

  isAddPicked(id: string): boolean { return this.aPicked.some(x => x.id === id); }

  toggleAddPerson(p: Person): void {
    this.aPicked = this.isAddPicked(p.id)
      ? this.aPicked.filter(x => x.id !== p.id)
      : [...this.aPicked, { id: p.id, name: p.name, journey: p.journey || null }];
  }

  saveAddMembers(): void {
    const active = this.active;
    if (!active || !this.aPicked.length) return;
    const n = this.aPicked.length;
    if (this.isLive(active)) {
      updateDoc(active._ref, { members: arrayUnion(...this.aPicked.map(p => p.id)) })
        .catch(e => { console.error('add members', e); this.notify('Error adding members'); });
      this.addingMembers = false;
      this.showToast(`${n} ${n === 1 ? 'person' : 'people'} added`);
      return;
    }
    const src = this.sourceOf(active);
    src.members = [...(src.members || []), ...this.aPicked];
    this.addingMembers = false;
    this.showToast(`${n} ${n === 1 ? 'person' : 'people'} added`);
  }

  private showToast(msg: string): void {
    this.toastMsg = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastMsg = null; }, 3000);
  }

  /* ── Profile panel ──────────────────────────────────────────────────── */

  get profileRows(): { label: string; value: string }[] {
    const p = this.person?.doc;
    if (!p) return [];
    const jm = this.journeyMeta(p.journey);
    return [
      { label: 'Journey', value: p.source === 'team' ? (p.role || 'Team') : (jm ? jm.full : (p.journey || '')) },
      { label: 'Current mode', value: p.mode || '' },
      { label: 'Marathon', value: p.marathon || '' },
      { label: 'Joined', value: p.joinDate || '' },
      { label: 'Subscription', value: p.subscriptionEnd ? `ends ${p.subscriptionEnd}` : '' },
      { label: 'Payment', value: p.payment || '' },
    ].filter(r => !!r.value);
  }

  get profileEvents(): ParticipantEvent[] {
    const p = this.person;
    if (!p) return [];
    return this.pEvents.filter(e =>
      (e.participantName && e.participantName === p.name) || (p.doc?.id && e.participantId === p.doc.id));
  }

  get profileConfirmedCount(): number {
    return this.profileEvents.filter(e => e.status === 'confirmed' || e.status === 'attended').length;
  }

  eventAccent(status?: string): string {
    const st = (status || '').toLowerCase();
    return st === 'attended' || st === 'confirmed' ? '#16A34A' : st === 'requested' ? '#D97706' : '#9CA3AF';
  }

  eventTint(status?: string): string {
    const st = (status || '').toLowerCase();
    return st === 'requested' ? '#FEF9C3' : (st === 'confirmed' || st === 'attended') ? '#ECFDF5' : '#F3F4F6';
  }

  /* ── Message info panel ─────────────────────────────────────────────── */

  /**
   * Two tiers only — Read and Sent. `supportchat` messages carry `read_by` and `pending`; there is no
   * delivery signal between them, so the old "Received" column was always empty by construction.
   */
  get infoReadBy(): Receipt[] { return this.infoMsg?.readBy || []; }

  /** Everyone in the group who has not read it yet (the message's `pending` set, by name). */
  get infoSentOnly(): Receipt[] {
    const read = this.infoReadBy.map(r => r.name);
    const senderName = this.infoMsg ? (this.infoMsg.from === 'team' ? this.selfName : this.infoMsg.senderName) : '';
    return (this.active?.members || [])
      .filter(mem => mem.name !== senderName && !read.includes(mem.name))
      .map(mem => ({ name: mem.name, at: '' }));
  }

  /* ── Scrolling ──────────────────────────────────────────────────────── */

  /** True when the thread is scrolled to (or very near) the newest message. */
  private isNearBottom(threshold = 140): boolean {
    const el = this.messagePane?.nativeElement;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }

  /** Set when this user posts, so the incoming snapshot scrolls even if they had scrolled up. */
  private justSent = false;

  /**
   * A single tick lands short: the row is in the DOM but reactions, stamps and media have not settled,
   * so scrollHeight is still growing. Scroll on the next frame and again once layout has quiesced.
   */
  private scrollToBottomSoon(): void {
    const jump = () => {
      const el = this.messagePane?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => { jump(); requestAnimationFrame(jump); });
    setTimeout(jump, 120);
    setTimeout(jump, 320);
  }

  trackById(_i: number, item: { id: string }): string { return item.id; }
  trackByIndex(i: number): number { return i; }

  /* ── Demo data ──────────────────────────────────────────────────────── */

  private seedDemoData(): void {
    const now = Date.now();
    const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();

    this.team = [
      { id: 't1', name: 'Sanjeev R Jain', role: 'Coach', source: 'team' },
      { id: 't2', name: 'Meera Nair', role: 'Program Lead', source: 'team' },
    ];
    this.participants = [
      { id: 'p1', name: 'Arjun Menon', journey: 'up', source: 'participant', status: 'Active',
        email: 'arjun@example.com', phone: '+91 98400 11223', city: 'Chennai',
        mode: 'Growth Mode', marathon: 'Marathon 4', joinDate: '2026-01-12', subscriptionEnd: '2026-12-31', payment: 'Paid' },
      { id: 'p2', name: 'Divya Rao', journey: 'lyl', source: 'participant', status: 'Active',
        email: 'divya@example.com', city: 'Bengaluru', mode: 'Legacy Mode', joinDate: '2025-11-03' },
      { id: 'p3', name: 'Karthik Iyer', journey: 'big', source: 'participant', status: 'Paused',
        email: 'karthik@example.com', city: 'Kochi', joinDate: '2025-08-19' },
      { id: 'p4', name: 'Nisha Verma', journey: 'up', source: 'participant', status: 'Active', city: 'Pune' },
    ];
    this.directory = {};
    this.team.forEach(t => this.directory[t.name] = t);
    this.participants.forEach(p => this.directory[p.name] = p);

    this.events = [
      { id: 'ev1', title: 'uP! Chennai Immersion — Aug 2026' },
      { id: 'ev2', title: 'LYL Bengaluru Meetup' },
    ];

    this.pEvents = [
      { id: 'pe1', participantName: 'Arjun Menon', eventName: 'uP! Chennai Immersion — Aug 2026', eventDate: '2026-08-14', status: 'confirmed', mainMode: 'Growth Mode' },
      { id: 'pe2', participantName: 'Arjun Menon', eventName: 'LYL Bengaluru Meetup', eventDate: '2026-06-02', status: 'attended' },
      { id: 'pe3', participantName: 'Divya Rao', eventName: 'LYL Bengaluru Meetup', eventDate: '2026-06-02', status: 'requested' },
    ];

    this.tickets = [
      { id: 'tk1', issueNumber: '#T-001', title: 'Payment receipt not received', category: 'payment', categoryLabel: 'Payment & Billing',
        priority: 'medium', status: 'open', participantName: 'Arjun Menon', participantId: 'p1', journey: 'up',
        notes: 'Paid on 12 Aug, no email yet.', date: '2026-08-13', raisedBy: this.TEAM_NAME },
    ];

    // Enough people that the participant search and the scrolling member list are exercised in the demo.
    const groupMembers: Member[] = [
      { id: 't1', name: 'Sanjeev R Jain', journey: null },
      { id: 'p1', name: 'Arjun Menon', journey: 'up' },
      { id: 'p2', name: 'Divya Rao', journey: 'lyl' },
      { id: 'p4', name: 'Nisha Verma', journey: 'up' },
      { id: 'p5', name: 'Rahul Nair', journey: 'big' },
      { id: 'p6', name: 'Aditi Sharma', journey: 'lyl' },
      { id: 'p7', name: 'Vikram Rao', journey: 'up' },
      { id: 'p8', name: 'Priya Menon', journey: 'up' },
    ];

    this.groups = [
      {
        id: 'up-chennai-cohort',
        name: 'uP! Chennai Cohort',
        emoji: '🎪',
        description: 'Cohort chat for the Chennai immersion group.',
        category: 'Cohorts',
        eventId: 'ev1',
        eventName: 'uP! Chennai Immersion — Aug 2026',
        createdBy: this.TEAM_NAME,
        members: groupMembers,
        unread: 2,
        deletedLog: [],
        lastMessage: 'See you all on Saturday!',
        lastAt: iso(6),
        messages: [
          {
            id: 'm1', from: 'team', senderName: this.TEAM_NAME, kind: 'announcement',
            text: 'Session 4 moves to *Saturday 10:00 AM*.\n- Bring your workbook\n- Join 5 minutes early\n[Join Zoom call](https://zoom.us/j/123456789)',
            at: iso(240), pinned: true,
            readBy: [{ name: 'Arjun Menon', at: iso(230) }],
            deliveredTo: [{ name: 'Divya Rao', at: iso(238) }],
          },
          {
            id: 'm2', from: 'member', senderName: 'Arjun Menon',
            text: 'Noted — will the recording be shared after?', at: iso(200),
            reactions: { '👍': ['A&H Team'] },
          },
          {
            id: 'm3', from: 'team', senderName: this.TEAM_NAME,
            text: 'Yes @Arjun Menon, recordings go up the same evening.', at: iso(180),
            mentions: ['@Arjun Menon'],
            replyTo: { senderName: 'Arjun Menon', text: 'Noted — will the recording be shared after?', messageId: 'm2' },
            readBy: [{ name: 'Arjun Menon', at: iso(175) }, { name: 'Divya Rao', at: iso(120) }],
            deliveredTo: [{ name: 'Nisha Verma', at: iso(178) }],
          },
          {
            id: 'm4', from: 'member', senderName: 'Divya Rao',
            text: 'Could someone re-share the payment link? My receipt never arrived.', at: iso(90),
          },
          {
            id: 'm4b', from: 'member', senderName: 'Divya Rao',
            text: 'I paid on the 12th, from the app.', at: iso(88),
          },
          {
            id: 'm4c', from: 'member', senderName: 'Divya Rao',
            text: 'No rush — just want it for my records.', at: iso(87),
          },
          {
            id: 'm5', from: 'team', senderName: this.TEAM_NAME,
            text: 'Reminder — submit your reflections before Friday.\n1. Open the workbook\n2. Fill section 3\n3. Upload the PDF',
            at: iso(6), mentions: [],
            readBy: [{ name: 'Divya Rao', at: iso(4) }],
            deliveredTo: [{ name: 'Arjun Menon', at: iso(5) }],
          },
        ],
      },
      {
        id: 'lyl-bengaluru',
        name: 'LYL Bengaluru',
        emoji: '🧠',
        description: 'Launch Your Legacy — Bengaluru pod.',
        category: 'Cohorts',
        createdBy: this.TEAM_NAME,
        members: [{ id: 'p2', name: 'Divya Rao', journey: 'lyl' }, { id: 't2', name: 'Meera Nair', journey: null }],
        unread: 0,
        deletedLog: [],
        lastMessage: 'Great session today, everyone.',
        lastAt: iso(1500),
        messages: [
          { id: 'lm1', from: 'team', senderName: this.TEAM_NAME, text: 'Great session today, everyone.', at: iso(1500),
            readBy: [{ name: 'Divya Rao', at: iso(1490) }], deliveredTo: [] },
        ],
      },
      {
        id: 'big-alumni-2025',
        name: 'B!G Alumni 2025',
        emoji: '🔥',
        description: 'Archived alumni pod.',
        createdBy: this.TEAM_NAME,
        members: [{ id: 'p3', name: 'Karthik Iyer', journey: 'big' }],
        unread: 0,
        archived: true,
        deletedLog: [],
        lastMessage: 'Wrapping up — thanks all!',
        lastAt: iso(20000),
        messages: [
          { id: 'bm1', from: 'member', senderName: 'Karthik Iyer', text: 'Wrapping up — thanks all!', at: iso(20000) },
        ],
      },
    ];

    this.channels = [
      {
        id: 'ah-announcements',
        name: 'A&H Announcements',
        emoji: '📣',
        description: 'Company-wide broadcast channel.',
        category: 'Broadcast',
        createdBy: this.TEAM_NAME,
        followers: 248,
        unread: 1,
        deletedLog: [],
        lastMessage: 'New journey dashboard is live',
        lastAt: iso(45),
        messages: [
          // Shaped like a real broadcast so the demo path renders the same card as live data.
          {
            id: 'cm1', from: 'member', senderName: this.TEAM_NAME,
            text: 'New journey dashboard is live. Track marathons, sessions and payments in one place.',
            at: iso(45), pinned: false,
            buttons: [{ label: 'Open dashboard', href: 'https://example.com/dashboard' }],
            _broadcast: {
              html: '<p><strong>New journey dashboard is live.</strong></p>'
                  + '<p>Track marathons, sessions and payments in one place.</p>',
              headerType: null, headerValue: null,
              footer: 'You are receiving this because you follow A&H Announcements.',
              files: [{ name: 'release-notes.pdf', url: 'https://example.com/release-notes.pdf' }],
              links: [{ label: 'What changed', url: 'https://example.com/changelog' }],
              sentTo: [], readBy: [], pending: [],
            },
          },
        ],
      },
    ];
  }
}
