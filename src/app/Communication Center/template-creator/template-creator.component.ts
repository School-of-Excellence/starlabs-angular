// template-creator.component.ts
import { Component, OnInit, ViewChild, inject, AfterViewInit, ElementRef, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';

// Firebase imports
import { Firestore } from '@angular/fire/firestore';
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy, 
  where,
  Timestamp 
} from 'firebase/firestore';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: any;
  buttons?: Button[];
}

interface Button {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

interface WhatsAppTemplate {
  id?: string;
  name: string;
  category: string;
  language: string;
  status: 'pending' | 'approved' | 'rejected';
  components: TemplateComponent[];
  createdAt: any;
  approvedAt?: any;
  approvedBy?: string;
  rejectionReason?: string;
}

@Component({
  selector: 'app-template-creator',
  standalone: true,
  imports: [    
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatCardModule,
    MatTabsModule,
    MatIconModule,
    MatChipsModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatExpansionModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatProgressBarModule
  ],
  templateUrl: './template-creator.component.html',
  styleUrl: './template-creator.component.css'
})
export class TemplateCreatorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('bodyTextarea') bodyTextarea!: ElementRef<HTMLTextAreaElement>;

  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  
  // Form
  templateForm!: FormGroup;
  isCreating = false;
  isSavingDraft = false;

  // Template Types
  selectedTemplateType = 'standard';
  selectedHeaderFormat = 'none';
  buttonsEnabled = true;

  // Rich Text Editor
  showEmojiPicker = false;
  selectedEmojiCategory = 'smileys';
  currentSelection: { start: number; end: number } = { start: 0, end: 0 };
  
  // File Upload
  isUploading = false;
  uploadProgress = 0;
  
  // Auto-save
  private autoSaveInterval: any;

  // Table
  dataSource = new MatTableDataSource<WhatsAppTemplate>();
  displayedColumns = ['name', 'category', 'language', 'status', 'createdAt', 'componentsCount', 'actions'];
  selectedStatus = '';
  selectedTemplate: WhatsAppTemplate | null = null;

  // Character limits
  readonly BODY_MAX_LENGTH = 1024;
  readonly FOOTER_MAX_LENGTH = 60;
  readonly BUTTON_TEXT_MAX_LENGTH = 20;

  // Emoji Categories
  emojiCategories = [
    { name: 'smileys', icon: '😀' },
    { name: 'people', icon: '👋' },
    { name: 'nature', icon: '🌿' },
    { name: 'food', icon: '🍕' },
    { name: 'activities', icon: '⚽' },
    { name: 'travel', icon: '🚗' },
    { name: 'objects', icon: '💡' },
    { name: 'symbols', icon: '❤️' },
    { name: 'flags', icon: '🏁' }
  ];

  // Emoji Data
  emojis = {
    smileys: [
      { char: '😀', name: 'grinning face' },
      { char: '😃', name: 'grinning face with big eyes' },
      { char: '😄', name: 'grinning face with smiling eyes' },
      { char: '😁', name: 'beaming face with smiling eyes' },
      { char: '😆', name: 'grinning squinting face' },
      { char: '😅', name: 'grinning face with sweat' },
      { char: '🤣', name: 'rolling on the floor laughing' },
      { char: '😂', name: 'face with tears of joy' },
      { char: '🙂', name: 'slightly smiling face' },
      { char: '🙃', name: 'upside down face' },
      { char: '😉', name: 'winking face' },
      { char: '😊', name: 'smiling face with smiling eyes' },
      { char: '😇', name: 'smiling face with halo' },
      { char: '🥰', name: 'smiling face with hearts' },
      { char: '😍', name: 'smiling face with heart-eyes' },
      { char: '🤩', name: 'star-struck' },
      { char: '😘', name: 'face blowing a kiss' },
      { char: '😗', name: 'kissing face' },
      { char: '😚', name: 'kissing face with closed eyes' },
      { char: '😙', name: 'kissing face with smiling eyes' },
      { char: '🥲', name: 'smiling face with tear' },
      { char: '😋', name: 'face savoring food' },
      { char: '😛', name: 'face with tongue' },
      { char: '😜', name: 'winking face with tongue' },
      { char: '🤪', name: 'zany face' },
      { char: '😝', name: 'squinting face with tongue' },
      { char: '🤑', name: 'money-mouth face' },
      { char: '🤗', name: 'hugging face' },
      { char: '🤭', name: 'face with hand over mouth' },
      { char: '🤫', name: 'shushing face' },
      { char: '🤔', name: 'thinking face' },
      { char: '🤐', name: 'zipper-mouth face' },
      { char: '🤨', name: 'face with raised eyebrow' },
      { char: '😐', name: 'neutral face' },
      { char: '😑', name: 'expressionless face' },
      { char: '😶', name: 'face without mouth' },
      { char: '😏', name: 'smirking face' },
      { char: '😒', name: 'unamused face' },
      { char: '🙄', name: 'face with rolling eyes' },
      { char: '😬', name: 'grimacing face' },
      { char: '🤥', name: 'lying face' }
    ],
    people: [
      { char: '👋', name: 'waving hand' },
      { char: '🤚', name: 'raised back of hand' },
      { char: '🖐️', name: 'hand with fingers splayed' },
      { char: '✋', name: 'raised hand' },
      { char: '🖖', name: 'vulcan salute' },
      { char: '👌', name: 'OK hand' },
      { char: '🤌', name: 'pinched fingers' },
      { char: '🤏', name: 'pinching hand' },
      { char: '✌️', name: 'victory hand' },
      { char: '🤞', name: 'crossed fingers' },
      { char: '🤟', name: 'love-you gesture' },
      { char: '🤘', name: 'sign of the horns' },
      { char: '🤙', name: 'call me hand' },
      { char: '👈', name: 'backhand index pointing left' },
      { char: '👉', name: 'backhand index pointing right' },
      { char: '👆', name: 'backhand index pointing up' },
      { char: '🖕', name: 'middle finger' },
      { char: '👇', name: 'backhand index pointing down' },
      { char: '☝️', name: 'index pointing up' },
      { char: '👍', name: 'thumbs up' },
      { char: '👎', name: 'thumbs down' },
      { char: '✊', name: 'raised fist' },
      { char: '👊', name: 'oncoming fist' },
      { char: '🤛', name: 'left-facing fist' },
      { char: '🤜', name: 'right-facing fist' },
      { char: '👏', name: 'clapping hands' },
      { char: '🙌', name: 'raising hands' },
      { char: '👐', name: 'open hands' },
      { char: '🤲', name: 'palms up together' },
      { char: '🤝', name: 'handshake' },
      { char: '🙏', name: 'folded hands' }
    ],
    nature: [
      { char: '🌿', name: 'herb' },
      { char: '🍀', name: 'four leaf clover' },
      { char: '🍃', name: 'leaf fluttering in wind' },
      { char: '🍂', name: 'fallen leaves' },
      { char: '🍁', name: 'maple leaf' },
      { char: '🌾', name: 'sheaf of rice' },
      { char: '🌱', name: 'seedling' },
      { char: '🌲', name: 'evergreen tree' },
      { char: '🌳', name: 'deciduous tree' },
      { char: '🌴', name: 'palm tree' },
      { char: '🌵', name: 'cactus' },
      { char: '🌶️', name: 'hot pepper' },
      { char: '🌽', name: 'ear of corn' },
      { char: '🥕', name: 'carrot' },
      { char: '🥒', name: 'cucumber' },
      { char: '🥬', name: 'leafy greens' },
      { char: '🥦', name: 'broccoli' },
      { char: '🧄', name: 'garlic' },
      { char: '🧅', name: 'onion' },
      { char: '🍄', name: 'mushroom' },
      { char: '🥜', name: 'peanuts' },
      { char: '🌰', name: 'chestnut' }
    ],
    food: [
      { char: '🍕', name: 'pizza' },
      { char: '🍔', name: 'hamburger' },
      { char: '🍟', name: 'french fries' },
      { char: '🌭', name: 'hot dog' },
      { char: '🥪', name: 'sandwich' },
      { char: '🌮', name: 'taco' },
      { char: '🌯', name: 'burrito' },
      { char: '🥙', name: 'stuffed flatbread' },
      { char: '🧆', name: 'falafel' },
      { char: '🥚', name: 'egg' },
      { char: '🍳', name: 'cooking' },
      { char: '🥘', name: 'shallow pan of food' },
      { char: '🍲', name: 'pot of food' },
      { char: '🥗', name: 'green salad' },
      { char: '🍿', name: 'popcorn' },
      { char: '🧈', name: 'butter' },
      { char: '🧂', name: 'salt' },
      { char: '🥫', name: 'canned food' },
      { char: '🍱', name: 'bento box' },
      { char: '🍘', name: 'rice cracker' },
      { char: '🍙', name: 'rice ball' },
      { char: '🍚', name: 'cooked rice' }
    ],
    activities: [
      { char: '⚽', name: 'soccer ball' },
      { char: '🏀', name: 'basketball' },
      { char: '🏈', name: 'american football' },
      { char: '⚾', name: 'baseball' },
      { char: '🥎', name: 'softball' },
      { char: '🎾', name: 'tennis' },
      { char: '🏐', name: 'volleyball' },
      { char: '🏉', name: 'rugby football' },
      { char: '🥏', name: 'flying disc' },
      { char: '🎱', name: 'pool 8 ball' },
      { char: '🪀', name: 'yo-yo' },
      { char: '🏓', name: 'ping pong' },
      { char: '🏸', name: 'badminton' },
      { char: '🥅', name: 'goal net' },
      { char: '⛳', name: 'flag in hole' },
      { char: '🪁', name: 'kite' },
      { char: '🏹', name: 'bow and arrow' },
      { char: '🎣', name: 'fishing pole' },
      { char: '🤿', name: 'diving mask' },
      { char: '🥊', name: 'boxing glove' },
      { char: '🥋', name: 'martial arts uniform' },
      { char: '🎽', name: 'running shirt' }
    ],
    travel: [
      { char: '🚗', name: 'automobile' },
      { char: '🚕', name: 'taxi' },
      { char: '🚙', name: 'sport utility vehicle' },
      { char: '🚌', name: 'bus' },
      { char: '🚎', name: 'trolleybus' },
      { char: '🏎️', name: 'racing car' },
      { char: '🚓', name: 'police car' },
      { char: '🚑', name: 'ambulance' },
      { char: '🚒', name: 'fire engine' },
      { char: '🚐', name: 'minibus' },
      { char: '🛻', name: 'pickup truck' },
      { char: '🚚', name: 'delivery truck' },
      { char: '🚛', name: 'articulated lorry' },
      { char: '🚜', name: 'tractor' },
      { char: '🏍️', name: 'motorcycle' },
      { char: '🛵', name: 'motor scooter' },
      { char: '🚲', name: 'bicycle' },
      { char: '🛴', name: 'kick scooter' },
      { char: '🛹', name: 'skateboard' },
      { char: '🛼', name: 'roller skate' },
      { char: '🚁', name: 'helicopter' },
      { char: '✈️', name: 'airplane' }
    ],
    objects: [
      { char: '💡', name: 'light bulb' },
      { char: '🔦', name: 'flashlight' },
      { char: '🏮', name: 'red paper lantern' },
      { char: '🪔', name: 'diya lamp' },
      { char: '📱', name: 'mobile phone' },
      { char: '💻', name: 'laptop' },
      { char: '🖥️', name: 'desktop computer' },
      { char: '🖨️', name: 'printer' },
      { char: '⌨️', name: 'keyboard' },
      { char: '🖱️', name: 'computer mouse' },
      { char: '🖲️', name: 'trackball' },
      { char: '💽', name: 'computer disk' },
      { char: '💾', name: 'floppy disk' },
      { char: '💿', name: 'optical disk' },
      { char: '📀', name: 'dvd' },
      { char: '🧮', name: 'abacus' },
      { char: '🎥', name: 'movie camera' },
      { char: '📹', name: 'video camera' },
      { char: '📷', name: 'camera' },
      { char: '📸', name: 'camera with flash' },
      { char: '📺', name: 'television' },
      { char: '📻', name: 'radio' }
    ],
    symbols: [
      { char: '❤️', name: 'red heart' },
      { char: '🧡', name: 'orange heart' },
      { char: '💛', name: 'yellow heart' },
      { char: '💚', name: 'green heart' },
      { char: '💙', name: 'blue heart' },
      { char: '💜', name: 'purple heart' },
      { char: '🖤', name: 'black heart' },
      { char: '🤍', name: 'white heart' },
      { char: '🤎', name: 'brown heart' },
      { char: '💔', name: 'broken heart' },
      { char: '❣️', name: 'heart exclamation' },
      { char: '💕', name: 'two hearts' },
      { char: '💞', name: 'revolving hearts' },
      { char: '💓', name: 'beating heart' },
      { char: '💗', name: 'growing heart' },
      { char: '💖', name: 'sparkling heart' },
      { char: '💘', name: 'heart with arrow' },
      { char: '💝', name: 'heart with ribbon' },
      { char: '💟', name: 'heart decoration' },
      { char: '☮️', name: 'peace symbol' },
      { char: '✝️', name: 'latin cross' },
      { char: '☪️', name: 'star and crescent' }
    ],
    flags: [
      { char: '🏁', name: 'chequered flag' },
      { char: '🚩', name: 'triangular flag' },
      { char: '🎌', name: 'crossed flags' },
      { char: '🏴', name: 'black flag' },
      { char: '🏳️', name: 'white flag' },
      { char: '🏳️‍🌈', name: 'rainbow flag' },
      { char: '🏳️‍⚧️', name: 'transgender flag' },
      { char: '🏴‍☠️', name: 'pirate flag' },
      { char: '🇺🇸', name: 'flag: United States' },
      { char: '🇬🇧', name: 'flag: United Kingdom' },
      { char: '🇨🇦', name: 'flag: Canada' },
      { char: '🇦🇺', name: 'flag: Australia' },
      { char: '🇩🇪', name: 'flag: Germany' },
      { char: '🇫🇷', name: 'flag: France' },
      { char: '🇪🇸', name: 'flag: Spain' },
      { char: '🇮🇹', name: 'flag: Italy' },
      { char: '🇧🇷', name: 'flag: Brazil' },
      { char: '🇲🇽', name: 'flag: Mexico' },
      { char: '🇯🇵', name: 'flag: Japan' },
      { char: '🇰🇷', name: 'flag: South Korea' },
      { char: '🇨🇳', name: 'flag: China' },
      { char: '🇮🇳', name: 'flag: India' }
    ]
  };

  constructor(private db: Firestore) {}

  ngOnInit() {
    this.initForm();
    this.loadTemplates();
    this.setupFormValueChanges();
    this.startAutoSave();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    this.cleanup();
    this.stopAutoSave();
  }

  // Form Initialization
  initForm() {
    this.templateForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      category: ['MARKETING', Validators.required],
      language: ['en', Validators.required],
      bodyText: ['', [Validators.required, Validators.maxLength(this.BODY_MAX_LENGTH)]],
      footerText: ['', [Validators.maxLength(this.FOOTER_MAX_LENGTH)]],
      headerText: [''],
      headerFormat: ['TEXT'],
      headerMediaUrl: [''],
      components: this.fb.array([])
    });
  }

  setupFormValueChanges() {
    // Listen to body text changes for character counting
    this.templateForm.get('bodyText')?.valueChanges.subscribe(value => {
      this.updateCharacterCount('body', value?.length || 0);
    });

    // Listen to footer text changes for character counting
    this.templateForm.get('footerText')?.valueChanges.subscribe(value => {
      this.updateCharacterCount('footer', value?.length || 0);
    });
  }

  updateCharacterCount(field: string, count: number) {
    const countElement = document.querySelector(`.${field}-character-count`);
    if (countElement) {
      countElement.textContent = `${count}/${field === 'body' ? this.BODY_MAX_LENGTH : this.FOOTER_MAX_LENGTH}`;
      
      const warningThreshold = field === 'body' ? this.BODY_MAX_LENGTH * 0.9 : this.FOOTER_MAX_LENGTH * 0.9;
      const maxLength = field === 'body' ? this.BODY_MAX_LENGTH : this.FOOTER_MAX_LENGTH;
      
      countElement.classList.remove('warning', 'error');
      if (count > maxLength) {
        countElement.classList.add('error');
      } else if (count > warningThreshold) {
        countElement.classList.add('warning');
      }
    }
  }

  // Form Array Getters
  get componentsFormArray(): FormArray {
    return this.templateForm.get('components') as FormArray;
  }

  getButtonsFormArray(componentIndex: number): FormArray {
    return this.componentsFormArray.at(componentIndex).get('buttons') as FormArray;
  }

  // Template Type Selection
  selectTemplateType(type: string) {
    this.selectedTemplateType = type;
  }

  // Header Format Selection
  selectHeaderFormat(format: string) {
    this.selectedHeaderFormat = format;
    this.templateForm.patchValue({ headerFormat: format });
    
    if (format === 'none') {
      this.templateForm.patchValue({ 
        headerText: '', 
        headerMediaUrl: '' 
      });
    }
  }

  // Rich Text Editing Methods
  formatText(format: string) {
    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (selectedText.length === 0) {
      this.snackBar.open('Please select text to format.', 'Close', {
        duration: 2000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    let formattedText = '';
    
    switch (format) {
      case 'bold':
        formattedText = `*${selectedText}*`;
        break;
      case 'italic':
        formattedText = `_${selectedText}_`;
        break;
      case 'strikethrough':
        formattedText = `~${selectedText}~`;
        break;
      case 'monospace':
        formattedText = `\`\`\`${selectedText}\`\`\``;
        break;
      default:
        formattedText = selectedText;
    }

    const newText = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    this.templateForm.patchValue({ bodyText: newText });
    
    // Set cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + formattedText.length, start + formattedText.length);
    });
  }

  isFormatActive(format: string): boolean {
    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return false;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    switch (format) {
      case 'bold':
        return selectedText.startsWith('*') && selectedText.endsWith('*');
      case 'italic':
        return selectedText.startsWith('_') && selectedText.endsWith('_');
      case 'strikethrough':
        return selectedText.startsWith('~') && selectedText.endsWith('~');
      case 'monospace':
        return selectedText.startsWith('```') && selectedText.endsWith('```');
      default:
        return false;
    }
  }

  insertLink() {
    const url = prompt('Enter URL:');
    if (!url) return;

    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    const linkText = selectedText || 'Link';
    const formattedLink = `[${linkText}](${url})`;
    
    const newText = textarea.value.substring(0, start) + formattedLink + textarea.value.substring(end);
    this.templateForm.patchValue({ bodyText: newText });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + formattedLink.length, start + formattedLink.length);
    });
  }

  clearFormatting() {
    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (selectedText.length === 0) {
      this.snackBar.open('Please select formatted text to clear.', 'Close', {
        duration: 2000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    // Remove formatting characters
    let cleanText = selectedText
      .replace(/^\*(.+)\*$/, '$1')  // Bold
      .replace(/^_(.+)_$/, '$1')    // Italic
      .replace(/^~(.+)~$/, '$1')    // Strikethrough
      .replace(/^```(.+)```$/, '$1') // Monospace
      .replace(/^\[(.+)\]\(.+\)$/, '$1'); // Links
    
    const newText = textarea.value.substring(0, start) + cleanText + textarea.value.substring(end);
    this.templateForm.patchValue({ bodyText: newText });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + cleanText.length, start + cleanText.length);
    });
  }

  onTextSelection(event: any) {
    this.currentSelection = {
      start: event.target.selectionStart,
      end: event.target.selectionEnd
    };
  }

  onBodyTextChange(event: any) {
    const length = event.target.value.length;
    this.updateCharacterCount('body', length);
  }

  // Variable Management
  addVariable() {
    const bodyControl = this.templateForm.get('bodyText');
    if (bodyControl) {
      const currentText = bodyControl.value || '';
      const variableCount = (currentText.match(/\{\{\d+\}\}/g) || []).length + 1;
      const newVariable = ` {{${variableCount}}} `;
      const cursorPosition = this.getCursorPosition('bodyText');
      
      const newText = currentText.slice(0, cursorPosition) + newVariable + currentText.slice(cursorPosition);
      bodyControl.setValue(newText);
      
      // Set cursor position after variable
      setTimeout(() => {
        const textarea = this.bodyTextarea?.nativeElement;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(cursorPosition + newVariable.length, cursorPosition + newVariable.length);
        }
      });
    }
  }

  getCursorPosition(fieldName: string): number {
    const element = document.querySelector(`[formControlName="${fieldName}"]`) as HTMLTextAreaElement;
    return element?.selectionStart || 0;
  }

  // Emoji Methods
  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  hideEmojiPicker() {
    this.showEmojiPicker = false;
  }

  selectEmojiCategory(category: string) {
    this.selectedEmojiCategory = category;
  }

  getEmojisForCategory(category: string): any[] {
    return this.emojis[category as keyof typeof this.emojis] || [];
  }

  insertEmoji(emoji: any) {
    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const currentText = textarea.value;
    const newText = currentText.substring(0, start) + emoji.char + currentText.substring(start);
    
    this.templateForm.patchValue({ bodyText: newText });
    this.hideEmojiPicker();
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.char.length, start + emoji.char.length);
    });
  }

  // File Upload Methods
  onFileSelected(event: any, mediaType: string) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type and size
    if (!this.validateFile(file, mediaType)) {
      return;
    }

    this.uploadFile(file, mediaType);
  }

  validateFile(file: File, mediaType: string): boolean {
    const validTypes = {
      'image': ['image/jpeg', 'image/png', 'image/gif'],
      'video': ['video/mp4', 'video/mov', 'video/avi'],
      'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    };

    const maxSizes = {
      'image': 5 * 1024 * 1024,    // 5MB
      'video': 16 * 1024 * 1024,   // 16MB
      'document': 100 * 1024 * 1024 // 100MB
    };

    const allowedTypes = validTypes[mediaType as keyof typeof validTypes];
    const maxSize = maxSizes[mediaType as keyof typeof maxSizes];

    if (!allowedTypes.includes(file.type)) {
      this.snackBar.open(`Invalid file type for ${mediaType}. Please select a valid file.`, 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return false;
    }

    if (file.size > maxSize) {
      this.snackBar.open(`File size too large. Maximum size for ${mediaType} is ${this.formatFileSize(maxSize)}.`, 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return false;
    }

    return true;
  }

  async uploadFile(file: File, mediaType: string) {
    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      // Simulate file upload progress
      const uploadInterval = setInterval(() => {
        this.uploadProgress += 10;
        if (this.uploadProgress >= 90) {
          clearInterval(uploadInterval);
        }
      }, 200);

      // In a real implementation, you would upload to your storage service here
      // For demo purposes, we'll create a local URL
      const fileUrl = URL.createObjectURL(file);
      
      this.uploadProgress = 100;
      
      // Update form with the file URL
      this.templateForm.patchValue({ headerMediaUrl: fileUrl });
      
      this.snackBar.open(`${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} uploaded successfully!`, 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });

    } catch (error) {
      console.error('Upload error:', error);
      this.snackBar.open('Upload failed. Please try again.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isUploading = false;
      setTimeout(() => {
        this.uploadProgress = 0;
      }, 1000);
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // URL Validation
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  onUrlChange(event: any) {
    const url = event.target.value;
    const formField = event.target.closest('.mat-mdc-form-field');
    
    if (url && this.isValidUrl(url)) {
      formField?.classList.add('url-valid');
      formField?.classList.remove('mat-form-field-invalid');
    } else if (url) {
      formField?.classList.remove('url-valid');
      formField?.classList.add('mat-form-field-invalid');
    }
  }

  // Component Management
  addComponent() {
    const componentForm = this.fb.group({
      type: ['BODY', Validators.required],
      format: ['TEXT'],
      text: [''],
      buttons: this.fb.array([])
    });
    
    this.componentsFormArray.push(componentForm);
  }

  removeComponent(index: number) {
    if (this.componentsFormArray.length > 0) {
      this.componentsFormArray.removeAt(index);
    }
  }

  onComponentTypeChange(componentIndex: number, type: string) {
    const component = this.componentsFormArray.at(componentIndex);
    
    if (type === 'BUTTONS') {
      component.patchValue({ text: '', format: '' });
      const buttonsArray = component.get('buttons') as FormArray;
      if (buttonsArray.length === 0) {
        this.addButton(componentIndex);
      }
    } else if (type === 'HEADER') {
      component.patchValue({ format: 'TEXT' });
      const buttonsArray = component.get('buttons') as FormArray;
      while (buttonsArray.length !== 0) {
        buttonsArray.removeAt(0);
      }
    } else {
      component.patchValue({ format: '' });
      const buttonsArray = component.get('buttons') as FormArray;
      while (buttonsArray.length !== 0) {
        buttonsArray.removeAt(0);
      }
    }
  }

  // Button Management
  addButton(componentIndex: number) {
    const buttonsArray = this.getButtonsFormArray(componentIndex);
    if (buttonsArray.length >= 3) {
      this.snackBar.open('Maximum 3 buttons allowed per template.', 'Close', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    const buttonForm = this.fb.group({
      type: ['QUICK_REPLY', Validators.required],
      text: ['', [Validators.required, Validators.maxLength(this.BUTTON_TEXT_MAX_LENGTH)]],
      url: [''],
      phone_number: ['']
    });
    
    buttonsArray.push(buttonForm);
  }

  removeButton(componentIndex: number, buttonIndex: number) {
    const buttonsArray = this.getButtonsFormArray(componentIndex);
    if (buttonsArray.length > 0) {
      buttonsArray.removeAt(buttonIndex);
    }
  }

  onButtonTypeChange(componentIndex: number, buttonIndex: number, type: string) {
    const button = this.getButtonsFormArray(componentIndex).at(buttonIndex);
    
    // Clear validators and values for fields not needed for this type
    if (type === 'QUICK_REPLY') {
      button.patchValue({ url: '', phone_number: '' });
      button.get('url')?.clearValidators();
      button.get('phone_number')?.clearValidators();
    } else if (type === 'URL') {
      button.patchValue({ phone_number: '' });
      button.get('url')?.setValidators([Validators.required, Validators.pattern(/^https?:\/\/.+/)]);
      button.get('phone_number')?.clearValidators();
    } else if (type === 'PHONE_NUMBER') {
      button.patchValue({ url: '' });
      button.get('url')?.clearValidators();
      button.get('phone_number')?.setValidators([Validators.required, Validators.pattern(/^\+?[1-9]\d{1,14}$/)]);
    }
    
    // Update validators
    button.get('url')?.updateValueAndValidity();
    button.get('phone_number')?.updateValueAndValidity();
  }

  // Buttons Toggle
  toggleButtons() {
    this.buttonsEnabled = !this.buttonsEnabled;
    
    if (!this.buttonsEnabled) {
      // Remove all button components
      for (let i = this.componentsFormArray.length - 1; i >= 0; i--) {
        const component = this.componentsFormArray.at(i);
        if (component.get('type')?.value === 'BUTTONS') {
          this.removeComponent(i);
        }
      }
    } else {
      // Add a default button component
      this.addButtonComponent();
    }
  }

  addButtonComponent() {
    const buttonComponent = this.fb.group({
      type: ['BUTTONS'],
      format: [''],
      text: [''],
      buttons: this.fb.array([])
    });
    
    this.componentsFormArray.push(buttonComponent);
    this.addButton(this.componentsFormArray.length - 1);
  }

  // Component Title Helper
  getComponentTitle(index: number): string {
    const component = this.componentsFormArray.at(index);
    const type = component.get('type')?.value;
    return `Component ${index + 1}: ${type || 'Unknown'}`;
  }

  // Preview Helper Methods
  hasHeaderComponent(): boolean {
    return this.selectedHeaderFormat !== 'none' || 
           this.componentsFormArray.controls.some(control => control.get('type')?.value === 'HEADER');
  }

  hasFooterComponent(): boolean {
    const footerText = this.templateForm.get('footerText')?.value;
    return !!(footerText && footerText.trim().length > 0) ||
           this.componentsFormArray.controls.some(control => control.get('type')?.value === 'FOOTER');
  }

  hasButtonsComponent(): boolean {
    return this.buttonsEnabled &&
           this.componentsFormArray.controls.some(control => control.get('type')?.value === 'BUTTONS');
  }

  getBodyText(): string {
    return this.templateForm.get('bodyText')?.value || '';
  }

  getFooterText(): string {
    return this.templateForm.get('footerText')?.value || '';
  }

  getHeaderText(): string {
    return this.templateForm.get('headerText')?.value || '';
  }

  getHeaderMediaUrl(): string {
    return this.templateForm.get('headerMediaUrl')?.value || '';
  }

  hasHeaderMedia(): boolean {
    return this.selectedHeaderFormat !== 'none' && this.selectedHeaderFormat !== 'text' && 
           this.getHeaderMediaUrl().length > 0;
  }

  getFormattedBodyText(): string {
    const bodyText = this.getBodyText();
    
    // Convert WhatsApp formatting to HTML for preview
    return bodyText
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')      // Bold
      .replace(/_([^_]+)_/g, '<em>$1</em>')               // Italic
      .replace(/~([^~]+)~/g, '<s>$1</s>')                 // Strikethrough
      .replace(/```([^`]+)```/g, '<code>$1</code>')       // Monospace
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links
  }

  getPreviewBodyText(): string {
    return this.getFormattedBodyText();
  }

  getPreviewHeaderContent(): any {
    if (this.selectedHeaderFormat === 'none') return null;
    
    return {
      type: this.selectedHeaderFormat,
      text: this.getHeaderText(),
      mediaUrl: this.getHeaderMediaUrl()
    };
  }

  getMessageButtons(): any[] {
    const buttonsComponent = this.componentsFormArray.controls.find(
      control => control.get('type')?.value === 'BUTTONS'
    );
    
    if (buttonsComponent) {
      const buttonsArray = buttonsComponent.get('buttons') as FormArray;
      return buttonsArray.controls.map(control => control.value).filter(btn => btn.text);
    }
    
    return [];
  }

  // Character count getters for template
  getBodyCharacterCount(): number {
    return this.templateForm.get('bodyText')?.value?.length || 0;
  }

  getFooterCharacterCount(): number {
    return this.templateForm.get('footerText')?.value?.length || 0;
  }

  // Form Validation
  validateAndCreateTemplate() {
    if (this.templateForm.invalid) {
      this.markFormGroupTouched(this.templateForm);
      this.snackBar.open('Please fix the form errors before submitting.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Validate that body text is provided
    const bodyText = this.templateForm.get('bodyText')?.value;
    if (!bodyText || bodyText.trim().length === 0) {
      this.snackBar.open('Body text is required for WhatsApp templates.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Validate header media URL if media format is selected
    if (this.selectedHeaderFormat !== 'none' && this.selectedHeaderFormat !== 'text') {
      const mediaUrl = this.templateForm.get('headerMediaUrl')?.value;
      if (!mediaUrl || !this.isValidUrl(mediaUrl)) {
        this.snackBar.open(`Please provide a valid URL for the ${this.selectedHeaderFormat}.`, 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        return;
      }
    }

    // Validate variables in body text
    const variables = bodyText.match(/\{\{\d+\}\}/g);
    if (variables) {
      const variableNumbers = variables.map(v => parseInt(v.replace(/[{}]/g, '')));
      const maxVariable = Math.max(...variableNumbers);
      
      for (let i = 1; i <= maxVariable; i++) {
        if (!variableNumbers.includes(i)) {
          this.snackBar.open(`Variable {{${i}}} is missing. Variables must be sequential starting from {{1}}.`, 'Close', {
            duration: 4000,
            panelClass: ['error-snackbar']
          });
          return;
        }
      }
    }

    this.createTemplate();
  }

  private markFormGroupTouched(formGroup: FormGroup | FormArray) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched();
      }
    });
  }

  // Template Creation and Management
  async createTemplate() {
    if (this.templateForm.valid) {
      this.isCreating = true;
      
      try {
        const formValue = this.templateForm.value;
        const template: Omit<WhatsAppTemplate, 'id'> = {
          name: formValue.name,
          category: formValue.category,
          language: formValue.language,
          status: 'pending',
          components: this.buildComponentsFromForm(formValue),
          createdAt: Timestamp.now()
        };

        await addDoc(collection(this.db, 'twilio_whatsapp_templates'), template);
        
        this.snackBar.open('Template created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        
        this.resetForm();
        this.loadTemplates();
        
      } catch (error) {
        console.error('Error creating template:', error);
        this.snackBar.open('Error creating template. Please try again.', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      } finally {
        this.isCreating = false;
      }
    }
  }

  async saveAsDraft() {
    if (!this.templateForm.get('name')?.value) {
      this.snackBar.open('Please enter a template name to save as draft.', 'Close', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    this.isSavingDraft = true;
    
    try {
      const formValue = this.templateForm.value;
      const template: Omit<WhatsAppTemplate, 'id'> = {
        name: formValue.name + '_draft',
        category: formValue.category,
        language: formValue.language,
        status: 'pending',
        components: this.buildComponentsFromForm(formValue),
        createdAt: Timestamp.now()
      };

      await addDoc(collection(this.db, 'twilio_whatsapp_templates_drafts'), template);
      
      this.snackBar.open('Template saved as draft!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
    } catch (error) {
      console.error('Error saving draft:', error);
      this.snackBar.open('Error saving draft.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isSavingDraft = false;
    }
  }

  private buildComponentsFromForm(formValue: any): TemplateComponent[] {
    const components: TemplateComponent[] = [];
    
    // Add HEADER component if format is not 'none'
    if (this.selectedHeaderFormat !== 'none') {
      const headerComponent: TemplateComponent = {
        type: 'HEADER',
        format: this.selectedHeaderFormat.toUpperCase() as any
      };
      
      if (this.selectedHeaderFormat === 'text') {
        headerComponent.text = formValue.headerText || undefined;
      } else {
        // For media headers, store the URL in the example field
        headerComponent.example = {
          header_url: formValue.headerMediaUrl
        };
      }
      
      components.push(headerComponent);
    }
    
    // Add BODY component (always required)
    if (formValue.bodyText) {
      components.push({
        type: 'BODY',
        text: formValue.bodyText
      });
    }
    
    // Add FOOTER component if text exists
    if (formValue.footerText && formValue.footerText.trim().length > 0) {
      components.push({
        type: 'FOOTER',
        text: formValue.footerText
      });
    }
    
    // Add BUTTONS component if enabled and buttons exist
    if (this.buttonsEnabled) {
      const buttonsComponent = this.componentsFormArray.controls.find(
        control => control.get('type')?.value === 'BUTTONS'
      );
      
      if (buttonsComponent) {
        const buttonsArray = buttonsComponent.get('buttons') as FormArray;
        const buttons = buttonsArray.controls
          .map(control => control.value)
          .filter(btn => btn.text && btn.text.trim().length > 0);
          
        if (buttons.length > 0) {
          components.push({
            type: 'BUTTONS',
            buttons: buttons
          });
        }
      }
    }
    
    return components;
  }

  resetForm() {
    this.templateForm.reset();
    this.templateForm.patchValue({
      category: 'MARKETING',
      language: 'en'
    });
    
    // Reset UI state
    this.selectedTemplateType = 'standard';
    this.selectedHeaderFormat = 'none';
    this.buttonsEnabled = true;
    
    // Clear components array
    while (this.componentsFormArray.length !== 0) {
      this.componentsFormArray.removeAt(0);
    }
  }

  // Template Loading and Management
  async loadTemplates() {
    try {
      const templatesQuery = query(
        collection(this.db, 'twilio_whatsapp_templates'),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(templatesQuery);
      const templates: WhatsAppTemplate[] = [];
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        templates.push({
          id: docSnap.id,
          name: data['name'],
          category: data['category'],
          language: data['language'],
          status: data['status'],
          components: data['components'] || [],
          createdAt: data['createdAt'],
          approvedAt: data['approvedAt'],
          approvedBy: data['approvedBy'],
          rejectionReason: data['rejectionReason']
        });
      });
      
      this.dataSource.data = templates;
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading templates:', error);
      this.snackBar.open('Error loading templates.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  applyFilters() {
    let filteredData = [...this.dataSource.data];
    
    if (this.selectedStatus) {
      filteredData = filteredData.filter(template => template.status === this.selectedStatus);
    }
    
    const newDataSource = new MatTableDataSource(filteredData);
    newDataSource.paginator = this.paginator;
    newDataSource.sort = this.sort;
    this.dataSource = newDataSource;
  }

  // Template Actions
  viewTemplate(template: WhatsAppTemplate) {
    this.selectedTemplate = template;
  }

  closeTemplateDetail() {
    this.selectedTemplate = null;
  }

  async approveTemplate(template: WhatsAppTemplate) {
    if (!template.id) {
      this.snackBar.open('Invalid template ID.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    try {
      await updateDoc(doc(this.db, 'twilio_whatsapp_templates', template.id), {
        status: 'approved',
        approvedAt: Timestamp.now(),
        approvedBy: 'current_user' // Replace with actual user info
      });
      
      this.snackBar.open(`Template "${template.name}" approved successfully!`, 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      this.loadTemplates();
      this.closeTemplateDetail();
      
    } catch (error) {
      console.error('Error approving template:', error);
      this.snackBar.open('Error approving template.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  async rejectTemplate(template: WhatsAppTemplate) {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || !template.id) return;

    try {
      await updateDoc(doc(this.db, 'twilio_whatsapp_templates', template.id), {
        status: 'rejected',
        rejectionReason: reason,
        rejectedAt: Timestamp.now(),
        rejectedBy: 'current_user' // Replace with actual user info
      });
      
      this.snackBar.open(`Template "${template.name}" rejected.`, 'Close', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      
      this.loadTemplates();
      this.closeTemplateDetail();
      
    } catch (error) {
      console.error('Error rejecting template:', error);
      this.snackBar.open('Error rejecting template.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  async duplicateTemplate(template: WhatsAppTemplate) {
    try {
      const duplicatedTemplate: Omit<WhatsAppTemplate, 'id'> = {
        name: `${template.name}_copy`,
        category: template.category,
        language: template.language,
        status: 'pending',
        components: [...template.components],
        createdAt: Timestamp.now()
      };

      await addDoc(collection(this.db, 'twilio_whatsapp_templates'), duplicatedTemplate);
      
      this.snackBar.open('Template duplicated successfully!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      this.loadTemplates();
      
    } catch (error) {
      console.error('Error duplicating template:', error);
      this.snackBar.open('Error duplicating template.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  async deleteTemplate(template: WhatsAppTemplate) {
    if (!template.id) return;
    
    const confirmed = confirm(`Are you sure you want to delete template "${template.name}"?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(this.db, 'twilio_whatsapp_templates', template.id));
      
      this.snackBar.open('Template deleted successfully!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      this.loadTemplates();
      
    } catch (error) {
      console.error('Error deleting template:', error);
      this.snackBar.open('Error deleting template.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  // Utility Methods
  getComponentsCount(template: WhatsAppTemplate): number {
    return template.components?.length || 0;
  }

  formatDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp.toDate) {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      case 'pending':
      default:
        return 'status-pending';
    }
  }

  // Navigation helpers
  goBack() {
    window.history.back();
  }

  // Export/Import template functionality
  exportTemplate(template: WhatsAppTemplate) {
    const dataStr = JSON.stringify(template, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${template.name}_template.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  importTemplate(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const template = JSON.parse(e.target.result);
          this.loadTemplateIntoForm(template);
        } catch (error) {
          this.snackBar.open('Invalid template file format.', 'Close', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      };
      reader.readAsText(file);
    }
  }

  private loadTemplateIntoForm(template: WhatsAppTemplate) {
    this.templateForm.patchValue({
      name: template.name + '_imported',
      category: template.category,
      language: template.language
    });

    template.components.forEach(component => {
      if (component.type === 'BODY') {
        this.templateForm.patchValue({ bodyText: component.text });
      } else if (component.type === 'FOOTER') {
        this.templateForm.patchValue({ footerText: component.text });
      } else if (component.type === 'HEADER') {
        this.selectedHeaderFormat = component.format?.toLowerCase() || 'text';
        this.templateForm.patchValue({ 
          headerText: component.text,
          headerFormat: component.format 
        });
      }
    });

    this.snackBar.open('Template imported successfully!', 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  // Auto-save functionality
  startAutoSave() {
    this.autoSaveInterval = setInterval(() => {
      if (this.templateForm.get('name')?.value && this.templateForm.dirty) {
        this.saveAsDraft();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  // Keyboard shortcuts and click outside handling
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const emojiPicker = document.querySelector('.emoji-picker');
    const emojiBtn = document.querySelector('.emoji-btn');
    
    if (this.showEmojiPicker && emojiPicker && emojiBtn) {
      if (!emojiPicker.contains(event.target as Node) && !emojiBtn.contains(event.target as Node)) {
        this.hideEmojiPicker();
      }
    }
  }

  // Keyboard shortcuts for formatting
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.bodyTextarea?.nativeElement.contains(event.target as Node)) return;
    
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          this.formatText('bold');
          break;
        case 'i':
          event.preventDefault();
          this.formatText('italic');
          break;
        case 'u':
          event.preventDefault();
          this.formatText('strikethrough');
          break;
        case 'e':
          event.preventDefault();
          this.toggleEmojiPicker();
          break;
        case 's':
          event.preventDefault();
          if (event.shiftKey) {
            this.saveAsDraft();
          } else {
            this.validateAndCreateTemplate();
          }
          break;
      }
    }
  }

  // Template validation helpers
  private validateTemplateStructure(): boolean {
    const bodyText = this.getBodyText();
    
    // Check for required body text
    if (!bodyText || bodyText.trim().length === 0) {
      return false;
    }

    // Validate character limits
    if (bodyText.length > this.BODY_MAX_LENGTH) {
      return false;
    }

    const footerText = this.getFooterText();
    if (footerText && footerText.length > this.FOOTER_MAX_LENGTH) {
      return false;
    }

    return true;
  }

  // WhatsApp formatting preview helpers
  private convertWhatsAppFormatting(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')      // Bold
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')               // Italic
      .replace(/~([^~\n]+)~/g, '<s>$1</s>')                 // Strikethrough
      .replace(/```([^`\n]+)```/g, '<code>$1</code>')       // Monospace
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>') // Links
      .replace(/\n/g, '<br>');                              // Line breaks
  }

  // Media validation helpers
  private isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
  }

  private isVideoUrl(url: string): boolean {
    return /\.(mp4|mov|avi|wmv|webm)(\?.*)?$/i.test(url);
  }

  private isDocumentUrl(url: string): boolean {
    return /\.(pdf|doc|docx|txt|rtf)(\?.*)?$/i.test(url);
  }

  // Template preview data getters
  getTemplatePreviewData(): any {
    return {
      header: this.getPreviewHeaderContent(),
      body: this.getPreviewBodyText(),
      footer: this.getFooterText(),
      buttons: this.getMessageButtons(),
      hasMedia: this.hasHeaderMedia()
    };
  }

  // Form state management
  markFormAsDirty() {
    this.templateForm.markAsDirty();
  }

  isFormValid(): boolean {
    return this.templateForm.valid && this.validateTemplateStructure();
  }

  // Template statistics
  getTemplateStats(): any {
    const bodyText = this.getBodyText();
    const variables = bodyText.match(/\{\{\d+\}\}/g) || [];
    const buttons = this.getMessageButtons();
    
    return {
      bodyLength: bodyText.length,
      variableCount: variables.length,
      buttonCount: buttons.length,
      hasHeader: this.hasHeaderComponent(),
      hasFooter: this.hasFooterComponent(),
      hasMedia: this.hasHeaderMedia()
    };
  }

  // Preview mode toggle
  previewMode = false;
  
  togglePreviewMode() {
    this.previewMode = !this.previewMode;
  }

  // Template copy to clipboard
  async copyTemplateJson() {
    try {
      const template = {
        name: this.templateForm.get('name')?.value,
        category: this.templateForm.get('category')?.value,
        language: this.templateForm.get('language')?.value,
        components: this.buildComponentsFromForm(this.templateForm.value)
      };
      
      await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
      this.snackBar.open('Template JSON copied to clipboard!', 'Close', {
        duration: 2000,
        panelClass: ['success-snackbar']
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.snackBar.open('Failed to copy to clipboard.', 'Close', {
        duration: 2000,
        panelClass: ['error-snackbar']
      });
    }
  }

  // Template sharing
  generateShareableLink(): string {
    const template = {
      name: this.templateForm.get('name')?.value,
      category: this.templateForm.get('category')?.value,
      language: this.templateForm.get('language')?.value,
      components: this.buildComponentsFromForm(this.templateForm.value)
    };
    
    const encodedTemplate = btoa(JSON.stringify(template));
    return `${window.location.origin}${window.location.pathname}?template=${encodedTemplate}`;
  }

  async shareTemplate() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WhatsApp Template',
          text: `Check out this WhatsApp template: ${this.templateForm.get('name')?.value}`,
          url: this.generateShareableLink()
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(this.generateShareableLink());
        this.snackBar.open('Shareable link copied to clipboard!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    }
  }

  // Load template from URL parameter
  loadTemplateFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateParam = urlParams.get('template');
    
    if (templateParam) {
      try {
        const template = JSON.parse(atob(templateParam));
        this.loadTemplateIntoForm(template);
        
        // Remove the parameter from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('template');
        window.history.replaceState({}, '', url.toString());
      } catch (error) {
        console.error('Error loading template from URL:', error);
        this.snackBar.open('Invalid template URL parameter.', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    }
  }

  // Enhanced template validation for WhatsApp compliance
  validateWhatsAppCompliance(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const bodyText = this.getBodyText();
    
    // Check template name format
    const name = this.templateForm.get('name')?.value;
    if (name && !/^[a-z0-9_]+$/.test(name)) {
      errors.push('Template name must contain only lowercase letters, numbers, and underscores.');
    }
    
    // Check for prohibited content patterns
    const prohibitedPatterns = [
      /\b(click here|tap here)\b/i,
      /\b(limited time|act now|urgent)\b/i,
      /\$\d+/g  // Currency amounts in certain contexts
    ];
    
    prohibitedPatterns.forEach(pattern => {
      if (pattern.test(bodyText)) {
        errors.push('Template contains potentially prohibited content patterns.');
      }
    });
    
    // Check variable usage
    const variables = bodyText.match(/\{\{\d+\}\}/g);
    if (variables) {
      const numbers = variables.map(v => parseInt(v.replace(/[{}]/g, '')));
      const maxNum = Math.max(...numbers);
      for (let i = 1; i <= maxNum; i++) {
        if (!numbers.includes(i)) {
          errors.push(`Variable {{${i}}} is missing. Variables must be sequential.`);
        }
      }
    }
    
    // Check button compliance
    const buttons = this.getMessageButtons();
    if (buttons.length > 3) {
      errors.push('Maximum 3 buttons allowed per template.');
    }
    
    buttons.forEach((button, index) => {
      if (button.text && button.text.length > this.BUTTON_TEXT_MAX_LENGTH) {
        errors.push(`Button ${index + 1} text exceeds ${this.BUTTON_TEXT_MAX_LENGTH} character limit.`);
      }
      
      if (button.type === 'URL' && button.url && !this.isValidUrl(button.url)) {
        errors.push(`Button ${index + 1} has an invalid URL.`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Run compliance check
  runComplianceCheck() {
    const result = this.validateWhatsAppCompliance();
    
    if (result.isValid) {
      this.snackBar.open('Template passes WhatsApp compliance check!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    } else {
      const errorMessage = `Compliance issues found:\n${result.errors.join('\n')}`;
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  // Cleanup methods
  private cleanup() {
    this.stopAutoSave();
    this.hideEmojiPicker();
    
    // Revoke any object URLs created for file uploads
    const mediaUrl = this.getHeaderMediaUrl();
    if (mediaUrl && mediaUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaUrl);
    }
  }

}