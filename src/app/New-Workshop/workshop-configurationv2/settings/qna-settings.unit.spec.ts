import { EMPTY_QNA, QNA_FIELD, buildQnaSettings, qnaFingerprint, readQnaSettings } from './qna-settings';

describe('qna-settings', () => {
  it('stores under the field name "q&a"', () => {
    expect(QNA_FIELD).toBe('q&a');
  });

  describe('readQnaSettings', () => {
    it('reads the stored map', () => {
      const s = readQnaSettings({
        workshopid: 'w1',
        'q&a': { title: 'Q&A', admintext: 'A&H Team', admin: ['3LVxKXuyxldYoRDEpx5s'], enablesplit: true, enablevideotime: false, samequestion: true, allowlike: true },
      });
      expect(s).toEqual({ title: 'Q&A', admintext: 'A&H Team', admin: ['3LVxKXuyxldYoRDEpx5s'], enablesplit: true, enablevideotime: false, samequestion: true, allowlike: true });
    });

    it('reads a map saved before the same-question and allow-like switches existed as off', () => {
      const s = readQnaSettings({ 'q&a': { title: 'Q&A', admintext: '', admin: [], enablesplit: true, enablevideotime: true } });
      expect(s.samequestion).toBe(false);
      expect(s.allowlike).toBe(false);
    });

    it('gives empty defaults when the document or the map is missing', () => {
      expect(readQnaSettings(null)).toEqual({ ...EMPTY_QNA, admin: [] });
      expect(readQnaSettings({ workshopid: 'w1' })).toEqual({ ...EMPTY_QNA, admin: [] });
      expect(readQnaSettings({ 'q&a': ['not', 'a', 'map'] })).toEqual({ ...EMPTY_QNA, admin: [] });
    });

    it('drops wrong types: non-string ids, duplicates, truthy non-booleans', () => {
      const s = readQnaSettings({ 'q&a': { title: 5, admintext: null, admin: ['a', '', 7, 'a', ' b '], enablesplit: 'yes', enablevideotime: 1, samequestion: 'true', allowlike: 'yes' } });
      expect(s).toEqual({ title: '', admintext: '', admin: ['a', 'b'], enablesplit: false, enablevideotime: false, samequestion: false, allowlike: false });
    });

    it('returns a fresh admin array each time (never the shared default)', () => {
      const a = readQnaSettings(null);
      a.admin.push('x');
      expect(readQnaSettings(null).admin).toEqual([]);
      expect(EMPTY_QNA.admin).toEqual([]);
    });
  });

  describe('buildQnaSettings', () => {
    it('trims the two texts and keeps exactly the seven keys', () => {
      const b = buildQnaSettings({ title: '  Q&A ', admintext: ' A&H Team ', admin: ['p1', 'p1', 'p2'], enablesplit: true, enablevideotime: true, samequestion: true, allowlike: true });
      expect(b).toEqual({ title: 'Q&A', admintext: 'A&H Team', admin: ['p1', 'p2'], enablesplit: true, enablevideotime: true, samequestion: true, allowlike: true });
      expect(Object.keys(b).sort()).toEqual(['admin', 'admintext', 'allowlike', 'enablesplit', 'enablevideotime', 'samequestion', 'title']);
    });
  });

  describe('qnaFingerprint', () => {
    it('ignores whitespace and duplicate admins, sees every real change', () => {
      const base = { title: 'Q&A', admintext: 'Team', admin: ['p1'], enablesplit: false, enablevideotime: false, samequestion: false, allowlike: false };
      expect(qnaFingerprint({ ...base, title: ' Q&A ', admin: ['p1', 'p1'] })).toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, title: 'Ask' })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, admintext: 'Other' })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, admin: ['p1', 'p2'] })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, enablesplit: true })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, enablevideotime: true })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, samequestion: true })).not.toBe(qnaFingerprint(base));
      expect(qnaFingerprint({ ...base, allowlike: true })).not.toBe(qnaFingerprint(base));
    });
  });
});
