// popup-banner.model.unit.spec.ts — the rules behind the EiFlix popup banner document.
//
// WHAT THESE PROTECT: `classify/eiflixpopupbanner` moved from ONE banner stored as flat fields to a
// `popupbanner` array of maps (2026-10-06). The migration path is the dangerous part — the banner
// already live in production is held in those flat fields, and a reader that only looked at the new
// array would show the operator an empty editor whose first save replaced the live banner with
// nothing. bannersFromDoc() is what stops that, so it is tested hardest.
import {
  POPUP_BANNER_FIELD,
  PopupBanner,
  bannerHasContent,
  bannerLabel,
  bannersFromDoc,
  bannersToPayload,
  blankBanner,
  isLegacyOnly,
  toBanner,
} from './popup-banner.model';

/** A legacy flat document, the shape that is live today. */
const legacyDoc = (over: any = {}) => ({
  header: '<p>Hello</p>', title: '<p>Winter sale</p>', description: '<p>Body</p>',
  button1text: '<p>Go</p>', button2text: '', button1link: 'https://example.com',
  footer: '', desktop: 'https://img/desktop.png', tablet: '', mobile: '', enable: true, ...over,
});

describe('popup-banner.model', () => {
  describe('blankBanner', () => {
    it('is empty and switched off, so a new banner cannot go live by accident', () => {
      const b = blankBanner();
      expect(b.enable).toBe(false);
      expect(bannerHasContent(b)).toBe(false);
    });

    it('returns a fresh object each time', () => {
      const a = blankBanner();
      a.title = '<p>Mine</p>';
      expect(blankBanner().title).toBe('');
    });
  });

  describe('toBanner', () => {
    it('fills in every key, so no form control is ever handed undefined', () => {
      const b = toBanner({ title: '<p>Only a title</p>' });
      expect(b.title).toBe('<p>Only a title</p>');
      expect(b.header).toBe('');
      expect(b.mobile).toBe('');
      expect(b.enable).toBe(false);
    });

    it('only the boolean true enables a banner', () => {
      expect(toBanner({ enable: true }).enable).toBe(true);
      expect(toBanner({ enable: 'true' }).enable).toBe(false);
      expect(toBanner({ enable: 1 }).enable).toBe(false);
    });

    it('drops non-string values rather than passing them to a text control', () => {
      expect(toBanner({ title: 42, header: null, footer: { a: 1 } }).title).toBe('');
      expect(toBanner({ header: null }).header).toBe('');
    });

    it('survives a null, a primitive, or an array where a map was expected', () => {
      expect(toBanner(null)).toEqual(blankBanner());
      expect(toBanner('nonsense')).toEqual(blankBanner());
      expect(toBanner([])).toEqual(blankBanner());
    });
  });

  describe('bannerHasContent', () => {
    it('ignores the enable switch — a banner that is only switched on is still empty', () => {
      expect(bannerHasContent({ ...blankBanner(), enable: true })).toBe(false);
    });

    it('counts any text or image field', () => {
      expect(bannerHasContent({ ...blankBanner(), title: '<p>x</p>' })).toBe(true);
      expect(bannerHasContent({ ...blankBanner(), desktop: 'https://img' })).toBe(true);
      expect(bannerHasContent({ ...blankBanner(), button1link: 'https://x' })).toBe(true);
    });

    it('does not count whitespace as content', () => {
      expect(bannerHasContent({ ...blankBanner(), title: '   ' })).toBe(false);
    });
  });

  describe('bannersFromDoc', () => {
    it('reads the array when there is one', () => {
      const out = bannersFromDoc({ [POPUP_BANNER_FIELD]: [{ title: '<p>A</p>' }, { title: '<p>B</p>' }] });
      expect(out.length).toBe(2);
      expect(out[0].title).toBe('<p>A</p>');
      expect(out[1].title).toBe('<p>B</p>');
    });

    it('ADOPTS the pre-array flat banner when no array exists yet', () => {
      // The one that matters. Without this the operator opens the dialog, sees nothing, and the
      // first save writes an array that silently replaces the live banner.
      const out = bannersFromDoc(legacyDoc());
      expect(out.length).toBe(1);
      expect(out[0].title).toBe('<p>Winter sale</p>');
      expect(out[0].enable).toBe(true);
      expect(out[0].desktop).toBe('https://img/desktop.png');
    });

    it('prefers the array and ignores the stale flat fields once both exist', () => {
      // After the first save the document carries both. The array is the truth from then on.
      const out = bannersFromDoc({ ...legacyDoc(), [POPUP_BANNER_FIELD]: [{ title: '<p>New</p>' }] });
      expect(out.length).toBe(1);
      expect(out[0].title).toBe('<p>New</p>');
    });

    it('falls back to the flat banner when the array is present but EMPTY', () => {
      // An empty array is indistinguishable from "not migrated yet" for a live banner's purposes.
      const out = bannersFromDoc({ ...legacyDoc(), [POPUP_BANNER_FIELD]: [] });
      expect(out.length).toBe(1);
      expect(out[0].title).toBe('<p>Winter sale</p>');
    });

    it('returns nothing for a document that is genuinely empty', () => {
      expect(bannersFromDoc({})).toEqual([]);
      expect(bannersFromDoc(null)).toEqual([]);
      expect(bannersFromDoc({ [POPUP_BANNER_FIELD]: [] })).toEqual([]);
    });

    it('does not mistake a switched-on but empty flat banner for content', () => {
      expect(bannersFromDoc({ enable: true })).toEqual([]);
    });

    it('ignores a popupbanner field that is not an array', () => {
      expect(bannersFromDoc({ [POPUP_BANNER_FIELD]: 'oops' })).toEqual([]);
      expect(bannersFromDoc({ [POPUP_BANNER_FIELD]: { title: 'x' } })).toEqual([]);
    });

    it('repairs ragged entries instead of throwing on them', () => {
      const out = bannersFromDoc({ [POPUP_BANNER_FIELD]: [null, { title: '<p>B</p>' }, 'junk'] });
      expect(out.length).toBe(3);
      expect(out[0]).toEqual(blankBanner());
      expect(out[1].title).toBe('<p>B</p>');
      expect(out[2]).toEqual(blankBanner());
    });
  });

  describe('isLegacyOnly', () => {
    it('is true only while the flat banner is the one in use', () => {
      expect(isLegacyOnly(legacyDoc())).toBe(true);
      expect(isLegacyOnly({ ...legacyDoc(), [POPUP_BANNER_FIELD]: [{ title: '<p>x</p>' }] })).toBe(false);
      expect(isLegacyOnly({})).toBe(false);
      expect(isLegacyOnly(null)).toBe(false);
    });

    it('treats an empty array as not-yet-migrated', () => {
      expect(isLegacyOnly({ ...legacyDoc(), [POPUP_BANNER_FIELD]: [] })).toBe(true);
    });
  });

  describe('bannersToPayload', () => {
    it('writes ONLY the popupbanner field', () => {
      const payload = bannersToPayload([blankBanner()]);
      expect(Object.keys(payload)).toEqual([POPUP_BANNER_FIELD]);
    });

    it('normalises every entry on the way out', () => {
      const payload = bannersToPayload([{ title: '<p>A</p>' } as any]);
      expect(payload[POPUP_BANNER_FIELD][0]).toEqual({ ...blankBanner(), title: '<p>A</p>' });
    });

    it('keeps the order the operator put them in', () => {
      const payload = bannersToPayload([
        { ...blankBanner(), title: '<p>one</p>' },
        { ...blankBanner(), title: '<p>two</p>' },
      ]);
      expect(payload[POPUP_BANNER_FIELD].map(b => b.title)).toEqual(['<p>one</p>', '<p>two</p>']);
    });

    it('writes an empty array rather than throwing on nothing', () => {
      expect(bannersToPayload([])[POPUP_BANNER_FIELD]).toEqual([]);
      expect(bannersToPayload(null as any)[POPUP_BANNER_FIELD]).toEqual([]);
    });

    it('round-trips through bannersFromDoc unchanged', () => {
      const original: PopupBanner[] = [
        { ...blankBanner(), title: '<p>A</p>', enable: true },
        { ...blankBanner(), description: '<p>B</p>' },
      ];
      expect(bannersFromDoc(bannersToPayload(original))).toEqual(original);
    });
  });

  describe('bannerLabel', () => {
    it('strips the rich-text markup off the title', () => {
      expect(bannerLabel({ ...blankBanner(), title: '<p><strong>Winter</strong> sale</p>' }, 0)).toBe('Winter sale');
    });

    it('falls back to the position when there is no title', () => {
      expect(bannerLabel(blankBanner(), 0)).toBe('Banner 1');
      expect(bannerLabel({ ...blankBanner(), title: '<p></p>' }, 2)).toBe('Banner 3');
    });

    it('collapses non-breaking spaces and runs of whitespace', () => {
      expect(bannerLabel({ ...blankBanner(), title: '<p>A&nbsp;&nbsp;B</p>' }, 0)).toBe('A B');
      expect(bannerLabel({ ...blankBanner(), title: '<p>  spaced   out  </p>' }, 0)).toBe('spaced out');
    });

    it('does not throw on a missing banner', () => {
      expect(() => bannerLabel(undefined as any, 0)).not.toThrow();
      expect(bannerLabel(undefined as any, 0)).toBe('Banner 1');
    });
  });
});
