import { Directive, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Directive({
  selector: 'img[src]',
  standalone: true
})

export class SafeImgDirective implements OnChanges {
  @Input() src: string = '';

  constructor(
    private el: ElementRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src']) {
      const url = this.src;
      if (url && typeof url === 'string') {
        // Ensure URL is properly formatted
        let cleanUrl = url;
        if (url.includes('firebasestorage.googleapis.com')) {
          cleanUrl = decodeURIComponent(url);
          if (!cleanUrl.startsWith('http')) {
            cleanUrl = 'https://' + cleanUrl;
          }
        }
        this.el.nativeElement.src = cleanUrl;
      }
    }
  }
}