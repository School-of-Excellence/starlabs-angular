import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SsOption { value: string; label: string; }

// Lightweight searchable dropdown: a trigger button + a filterable popup list.
// Two-way bindable via [value] / (valueChange). Matches the screen's native-select look.
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.css'
})
export class SearchableSelectComponent {
  @Input() options: SsOption[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() placeholder = 'Select';
  @Input() searchPlaceholder = 'Search…';
  @Input() disabled = false;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  open = false;
  term = '';

  constructor(private host: ElementRef) {}

  get selectedLabel(): string {
    return this.options.find(o => o.value === this.value)?.label ?? '';
  }
  get filtered(): SsOption[] {
    const t = this.term.trim().toLowerCase();
    return t ? this.options.filter(o => o.label.toLowerCase().includes(t)) : this.options;
  }
  // Only bother with a search box once the list is long enough to warrant it.
  get showSearch(): boolean { return this.options.length > 5; }

  toggle() {
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) {
      this.term = '';
      setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    }
  }
  pick(o: SsOption) {
    this.value = o.value;
    this.valueChange.emit(o.value);
    this.open = false;
  }
  onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { this.open = false; }
    else if (e.key === 'Enter') { const f = this.filtered; if (f.length) this.pick(f[0]); }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!this.host.nativeElement.contains(e.target)) this.open = false;
  }
}
