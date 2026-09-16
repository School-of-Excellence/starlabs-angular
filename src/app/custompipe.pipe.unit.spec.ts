// custompipe.pipe.unit.spec.ts — unit tests for the shared display pipes.
//
// WHY UNIT: pipes are pure transforms — value in, value out — so no TestBed is needed; a pipe class is just
// `new`-ed and called. These are also CROSS-CUTTING (suites-manifest crossCutting.appPaths), meaning a change
// here makes every suite mandatory. That is precisely the kind of file worth pinning cheaply: it is rendered
// across comms, content, queue and profiles, and until now nothing verified any of it.
//
// SCOPE: these tests describe what the pipes DO TODAY, including three behaviours that look like defects
// (SHU-03, SHU-05a, SHU-05b). They are pinned rather than "fixed" in the test, and each carries a comment
// saying so — if someone repairs the pipe, the test turns red and the fix gets a deliberate review instead
// of silently changing what every message in the app renders.
import {
  CustompipePipe,
  EnhancedMessagePipe,
  ExcludeFilterStringPipe,
  LinebreaksPipe,
  LinkPipe,
  MessagePipe,
  TopCompletedDoersPipe,
} from './custompipe.pipe';

describe('shared display pipes', () => {
  // =============================================================================================
  // SHU-01 — CustompipePipe is a no-op stub
  // =============================================================================================
  describe('SHU-01 CustompipePipe', () => {
    const pipe = new CustompipePipe();

    it('always returns null, whatever it is given', () => {
      // The CLI-generated stub was never implemented. Pinned so nobody assumes it transforms anything:
      // any template using `| custompipe` renders nothing at all.
      expect(pipe.transform('anything')).toBeNull();
      expect(pipe.transform(42, 'a', 'b')).toBeNull();
      expect(pipe.transform(null)).toBeNull();
    });
  });

  // =============================================================================================
  // SHU-02 — ExcludeFilterStringPipe drops matching entries
  // =============================================================================================
  describe('SHU-02 ExcludeFilterStringPipe', () => {
    const pipe = new ExcludeFilterStringPipe();

    it('removes every entry equal to the argument', () => {
      expect(pipe.transform(['a', 'b', 'a', 'c'], 'a')).toEqual(['b', 'c']);
    });

    it('returns a new array and leaves the input alone', () => {
      const input = ['a', 'b'];
      expect(pipe.transform(input, 'a')).not.toBe(input);
      expect(input).toEqual(['a', 'b']);
    });

    it('keeps everything when nothing matches', () => {
      expect(pipe.transform(['a', 'b'], 'z')).toEqual(['a', 'b']);
    });

    it('compares LOOSELY, so "1" also removes the number 1', () => {
      // `e != args` is loose inequality: 1 != '1' is false, so the number is dropped too. Surprising, but
      // this is what every template using the pipe gets today.
      expect(pipe.transform([1, '1', 2], '1')).toEqual([2]);
    });

    it('handles an empty array', () => {
      expect(pipe.transform([], 'a')).toEqual([]);
    });
  });

  // =============================================================================================
  // SHU-03 — LinebreaksPipe converts LITERAL backslash-n, not real newlines
  // =============================================================================================
  describe('SHU-03 LinebreaksPipe', () => {
    const pipe = new LinebreaksPipe();

    it('converts the two-character sequence \\n into <br />', () => {
      expect(pipe.transform('line one\\nline two')).toBe('line one<br />line two');
    });

    it('converts every occurrence', () => {
      expect(pipe.transform('a\\nb\\nc')).toBe('a<br />b<br />c');
    });

    it('does NOT convert a real newline character', () => {
      // LOOKS LIKE A DEFECT, pinned deliberately. The regex is /\\n/g — an escaped backslash followed by n,
      // i.e. the literal two characters. Text carrying an actual "\n" (anything typed into a textarea, or
      // read back from Firestore as a real newline) passes through untouched and renders as one long line
      // in HTML. If this is repaired, this test goes red on purpose: that change alters how every
      // multi-line message in the app renders, and deserves to be noticed.
      expect(pipe.transform('line one\nline two')).toBe('line one\nline two');
    });

    it('leaves text with no breaks unchanged', () => {
      expect(pipe.transform('plain')).toBe('plain');
    });

    it('throws on null rather than degrading', () => {
      // Also pinned as-is: templates must not pipe a null through it.
      expect(() => pipe.transform(null as any)).toThrow();
    });
  });

  // =============================================================================================
  // SHU-04 — LinkPipe turns URLs into anchors
  // =============================================================================================
  describe('SHU-04 LinkPipe', () => {
    const pipe = new LinkPipe();

    it('wraps an http(s) URL in an anchor labelled "Open Link"', () => {
      expect(pipe.transform('see https://example.com now'))
        .toBe('see <a href="https://example.com" target="_blank">Open Link</a> now');
    });

    it('replaces every URL in the string', () => {
      const out = pipe.transform('https://a.com and https://b.com');
      expect((out.match(/<a /g) || []).length).toBe(2);
    });

    it('leaves text with no URL unchanged', () => {
      expect(pipe.transform('no links here')).toBe('no links here');
    });

    it('does not linkify a bare domain without a scheme', () => {
      expect(pipe.transform('example.com')).toBe('example.com');
    });

    it('stops the URL at whitespace', () => {
      // The regex is greedy up to whitespace, so trailing punctuation stays INSIDE the href.
      expect(pipe.transform('go https://example.com/a?b=1 ok'))
        .toContain('href="https://example.com/a?b=1"');
    });
  });

  // =============================================================================================
  // SHU-05 — MessagePipe substitutes participant fields
  // =============================================================================================
  describe('SHU-05 MessagePipe', () => {
    const pipe = new MessagePipe();
    const map = { p1: { name: 'Asha', email: 'asha@example.com', number: '99999' } };

    it('substitutes name, email and number', () => {
      expect(pipe.transform('Hi {{name}} ({{email}} / {{number}})', map, 'p1'))
        .toBe('Hi Asha (asha@example.com / 99999)');
    });

    it('replaces every occurrence of a token', () => {
      expect(pipe.transform('{{name}} and {{name}}', map, 'p1')).toBe('Asha and Asha');
    });

    it('returns EMPTY STRING when the template has no {{name}} — even if it has other tokens', () => {
      // SHU-05a — LOOKS LIKE A DEFECT, pinned. The guard is `value.includes('{{name}}')`, so a perfectly
      // valid template addressed by email or number alone renders as NOTHING rather than substituting.
      // A message that silently becomes empty is worse than one that renders a raw token.
      expect(pipe.transform('Your email is {{email}}', map, 'p1')).toBe('');
      expect(pipe.transform('Plain message with no tokens', map, 'p1')).toBe('');
    });

    it('throws when the profile is missing from the map', () => {
      // SHU-05b — no guard on mapData[profileid]; it dereferences straight into ['name'].
      expect(() => pipe.transform('Hi {{name}}', map, 'unknown-profile')).toThrow();
    });
  });

  // =============================================================================================
  // SHU-06 — EnhancedMessagePipe: the guarded successor to MessagePipe
  // =============================================================================================
  describe('SHU-06 EnhancedMessagePipe', () => {
    const pipe = new EnhancedMessagePipe();
    const map = { p1: { name: 'Asha', email: 'asha@example.com', number: '99999' } };

    it('substitutes tokens without requiring {{name}} to be present', () => {
      // The behaviour SHU-05a gets wrong — this pipe substitutes whatever tokens it finds.
      expect(pipe.transform('Your email is {{email}}', map, 'p1')).toBe('Your email is asha@example.com');
    });

    it('returns an empty string for empty input rather than throwing', () => {
      expect(pipe.transform('', map, 'p1')).toBe('');
      expect(pipe.transform(null as any, map, 'p1')).toBe('');
    });

    it('leaves the text untouched when the profile is unknown', () => {
      // Guarded (`mapData && profileid && mapData[profileid]`), unlike MessagePipe which throws.
      expect(pipe.transform('Hi {{name}}', map, 'nobody')).toBe('Hi {{name}}');
    });

    it('substitutes an empty string for a missing field instead of "undefined"', () => {
      const partial = { p1: { name: 'Asha' } };
      expect(pipe.transform('{{name}} {{email}}', partial, 'p1')).toBe('Asha ');
    });

    it('renders @profileid mentions as the user name in a mention tag', () => {
      const uids = { u1: { profileid: 'p1', name: 'Asha' } };
      expect(pipe.transform('ping @p1', map, 'p1', uids))
        .toBe('ping <span class="mention-tag">@Asha</span>');
    });

    it('leaves a mention alone when the referenced user has no name', () => {
      const uids = { u1: { profileid: 'p9' } };
      expect(pipe.transform('ping @p9', map, 'p1', uids)).toBe('ping @p9');
    });

    it('handles mentions and tokens together', () => {
      const uids = { u1: { profileid: 'p1', name: 'Asha' } };
      expect(pipe.transform('Hi {{name}}, ping @p1', map, 'p1', uids))
        .toBe('Hi Asha, ping <span class="mention-tag">@Asha</span>');
    });
  });

  // =============================================================================================
  // SHU-07 — TopCompletedDoersPipe ranks and truncates
  // =============================================================================================
  describe('SHU-07 TopCompletedDoersPipe', () => {
    const pipe = new TopCompletedDoersPipe();
    const rows = [{ count: 3 }, { count: 9 }, { count: 5 }];

    it('sorts by count, highest first', () => {
      expect(pipe.transform(rows).map((r) => r.count)).toEqual([9, 5, 3]);
    });

    it('does not mutate the input array', () => {
      // `.slice()` before `.sort()` — without it, sorting would reorder the caller's own state.
      const input = [...rows];
      pipe.transform(input);
      expect(input.map((r) => r.count)).toEqual([3, 9, 5]);
    });

    it('truncates to the limit', () => {
      expect(pipe.transform(rows, 2).map((r) => r.count)).toEqual([9, 5]);
    });

    it('defaults the limit to 10', () => {
      const many = Array.from({ length: 25 }, (_, i) => ({ count: i }));
      expect(pipe.transform(many).length).toBe(10);
    });

    it('returns an empty array for a non-array input rather than throwing', () => {
      expect(pipe.transform(null as any)).toEqual([]);
      expect(pipe.transform(undefined as any)).toEqual([]);
      expect(pipe.transform('nope' as any)).toEqual([]);
    });

    it('returns an empty array for empty input', () => {
      expect(pipe.transform([])).toEqual([]);
    });
  });
});
