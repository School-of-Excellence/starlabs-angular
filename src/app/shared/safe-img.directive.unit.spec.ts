// safe-img.directive.unit.spec.ts — unit tests for the img[src] normalisation directive.
//
// WHY UNIT: the directive is a URL transform plus one DOM assignment. It needs no TestBed — an ElementRef
// is just `{ nativeElement }`, and ngOnChanges takes a plain object. The DomSanitizer is injected but never
// used by the current implementation, so it is passed as null.
//
// WHAT IT AFFECTS: the selector is `img[src]`, so this directive runs on EVERY image in the application.
// A throw in ngOnChanges here is not a one-screen problem.
import { ElementRef, SimpleChange, SimpleChanges } from '@angular/core';
import { SafeImgDirective } from './safe-img.directive';

/** Build the directive over a fake <img> and run a src change through it. */
const applySrc = (src: string | null | undefined) => {
  const nativeElement: any = {};
  const dir = new SafeImgDirective(new ElementRef(nativeElement), null as any);
  dir.src = src as any;
  const changes: SimpleChanges = { src: new SimpleChange(undefined, src, true) };
  dir.ngOnChanges(changes);
  return nativeElement;
};

describe('SafeImgDirective', () => {
  // =============================================================================================
  // SHU-18 — ordinary URLs pass through untouched
  // =============================================================================================
  describe('SHU-18 pass-through', () => {
    it('assigns a plain https URL unchanged', () => {
      expect(applySrc('https://example.com/a.png').src).toBe('https://example.com/a.png');
    });

    it('assigns a relative asset path unchanged', () => {
      expect(applySrc('assets/img/logo.png').src).toBe('assets/img/logo.png');
    });

    it('assigns a data URI unchanged', () => {
      const uri = 'data:image/png;base64,iVBORw0KGgo=';
      expect(applySrc(uri).src).toBe(uri);
    });

    it('does NOT decode a non-Firebase URL, so percent-encoding is preserved', () => {
      // Only Firebase Storage URLs are decoded; everything else must keep its encoding or the request
      // would be made against a different path than intended.
      const url = 'https://example.com/a%20b.png';
      expect(applySrc(url).src).toBe(url);
    });
  });

  // =============================================================================================
  // SHU-19 — Firebase Storage URLs are decoded
  // =============================================================================================
  describe('SHU-19 Firebase Storage handling', () => {
    it('percent-decodes a Firebase Storage URL', () => {
      const encoded = 'https://firebasestorage.googleapis.com/v0/b/x/o/folder%2Fimage.png?alt=media';
      expect(applySrc(encoded).src)
        .toBe('https://firebasestorage.googleapis.com/v0/b/x/o/folder/image.png?alt=media');
    });

    it('prefixes https:// when the decoded URL has no scheme', () => {
      const noScheme = 'firebasestorage.googleapis.com/v0/b/x/o/img.png';
      expect(applySrc(noScheme).src).toBe('https://' + noScheme);
    });

    it('does not double-prefix a URL that already has a scheme', () => {
      const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/img.png';
      expect(applySrc(url).src).toBe(url);
      expect(applySrc(url).src.match(/https:\/\//g)!.length).toBe(1);
    });

    it('THROWS on a malformed percent-escape in a Firebase URL', () => {
      // Pinned as current behaviour. decodeURIComponent raises URIError on a lone '%', and there is no
      // try/catch — so a single malformed Storage URL takes ngOnChanges down. Because the selector is
      // `img[src]`, that is an app-wide risk rather than a local one. If this is ever guarded, this test
      // turns red on purpose and the fix gets reviewed.
      expect(() => applySrc('https://firebasestorage.googleapis.com/o/100%.png')).toThrow();
    });
  });

  // =============================================================================================
  // SHU-20 — guards
  // =============================================================================================
  describe('SHU-20 guards', () => {
    it('assigns nothing when the src is empty', () => {
      expect(applySrc('').src).toBeUndefined();
    });

    it('assigns nothing when the src is null or undefined', () => {
      expect(applySrc(null).src).toBeUndefined();
      expect(applySrc(undefined).src).toBeUndefined();
    });

    it('ignores a change set that does not include src', () => {
      const nativeElement: any = {};
      const dir = new SafeImgDirective(new ElementRef(nativeElement), null as any);
      dir.src = 'https://example.com/a.png';
      dir.ngOnChanges({ other: new SimpleChange(1, 2, false) } as SimpleChanges);
      expect(nativeElement.src).toBeUndefined();
    });
  });
});
