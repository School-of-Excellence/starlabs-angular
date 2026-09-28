// queue-form-mapping.unit.spec.ts — unit tests for the queue-builder form → FlowConfig adapter.
//
// WHY UNIT: pure function, no Angular, no Firestore. It is the bridge between what the queue builder FORM
// holds (array-of-arrays combos, `variation`, `docid`) and what the flow model + config-validity oracle
// EXPECT (keyed combos, `stages`, `id`). Every field it renames or reshapes is a chance for the visualiser
// and the validator to be fed something subtly different from what the operator built.
//
// Pairs with queue-flow.model.unit.spec.ts: that pins how a FlowConfig is interpreted, this pins how one
// is produced.
import { formValueToFlowConfig } from './queue-form-mapping';

describe('formValueToFlowConfig', () => {
  // =============================================================================================
  // OPU-08 — empty and absent input
  // =============================================================================================
  describe('OPU-08 empty input', () => {
    it('returns an empty config for null or undefined', () => {
      [null, undefined].forEach((v) => {
        const c = formValueToFlowConfig(v as any);
        expect(c.stages).toEqual([]);
        expect(c.queuevariation).toEqual([]);
        expect(c.stageproperty).toEqual({});
      });
    });

    it('returns an empty config for an empty object', () => {
      expect(formValueToFlowConfig({}).stages).toEqual([]);
    });

    it('coerces a non-array stages field to an empty array', () => {
      // Form state can arrive half-initialised; downstream code indexes stages without guarding.
      expect(formValueToFlowConfig({ stages: 'oops' as any }).stages).toEqual([]);
    });
  });

  // =============================================================================================
  // OPU-09 — variations are renamed on the way through
  // =============================================================================================
  describe('OPU-09 variation mapping', () => {
    it('maps docid -> id and variation -> stages', () => {
      // Two renames in one hop. Getting either wrong silently produces variations the model cannot walk.
      const c = formValueToFlowConfig({
        queuevariation: [{ docid: 'v1', variationname: 'V1', variation: ['A', 'B'] }],
      });
      expect(c.queuevariation).toEqual([{ id: 'v1', variationname: 'V1', stages: ['A', 'B'] }]);
    });

    it('defaults a missing variation list to an empty backbone', () => {
      const c = formValueToFlowConfig({ queuevariation: [{ docid: 'v1', variationname: 'V1' }] });
      expect(c.queuevariation[0].stages).toEqual([]);
    });

    it('preserves variation order', () => {
      const c = formValueToFlowConfig({
        queuevariation: [
          { docid: 'v1', variationname: 'A', variation: [] },
          { docid: 'v2', variationname: 'B', variation: [] },
        ],
      });
      expect(c.queuevariation.map((v) => v.id)).toEqual(['v1', 'v2']);
    });
  });

  // =============================================================================================
  // OPU-10 — stage properties
  // =============================================================================================
  describe('OPU-10 stage properties', () => {
    it('keys properties by stage name', () => {
      const c = formValueToFlowConfig({ stageproperty: [{ stage: 'A', selfmovable: true } as any] });
      expect(c.stageproperty['A'].selfmovable).toBeTrue();
    });

    it('skips entries with no stage name rather than creating an undefined key', () => {
      const c = formValueToFlowConfig({
        stageproperty: [{ stage: '', selfmovable: true } as any, { selfmovable: true } as any],
      });
      expect(Object.keys(c.stageproperty)).toEqual([]);
    });

    it('coerces the boolean flags', () => {
      const c = formValueToFlowConfig({ stageproperty: [{ stage: 'A' } as any] });
      expect(c.stageproperty['A'].selfmovable).toBeFalse();
      expect(c.stageproperty['A'].enablezoom).toBeFalse();
    });

    it('defaults actiontype to null rather than undefined', () => {
      // The model branches on `p.actiontype` truthiness; null is the shape it expects for "none".
      expect(formValueToFlowConfig({ stageproperty: [{ stage: 'A' } as any] })
        .stageproperty['A'].actiontype).toBeNull();
    });

    it('defaults widget and form lists to empty arrays', () => {
      const p = formValueToFlowConfig({ stageproperty: [{ stage: 'A' } as any] }).stageproperty['A'];
      expect(p.studiowidgets).toEqual([]);
      expect(p.participantform).toEqual([]);
    });
  });

  // =============================================================================================
  // OPU-11 — compulsoryactivity: array-of-arrays becomes a keyed record
  // =============================================================================================
  describe('OPU-11 combosToRecord', () => {
    it('keys each combo by its index, as a string', () => {
      const c = formValueToFlowConfig({
        stageproperty: [{ stage: 'A', compulsoryactivity: [['x', 'y'], ['z']] } as any],
      });
      expect(c.stageproperty['A'].compulsoryactivity).toEqual({ '0': ['x', 'y'], '1': ['z'] });
    });

    it('returns NULL for an empty combo list, not an empty object', () => {
      // This is what keeps the flow model's documented prototype-bug fix meaningful: `{}` is truthy, so an
      // empty record would be indistinguishable from "has combos" to any caller that only checks presence.
      // See OPU-03 in queue-flow.model.unit.spec.ts.
      const c = formValueToFlowConfig({ stageproperty: [{ stage: 'A', compulsoryactivity: [] } as any] });
      expect(c.stageproperty['A'].compulsoryactivity).toBeNull();
    });

    it('returns null when the field is missing or not an array', () => {
      expect(formValueToFlowConfig({ stageproperty: [{ stage: 'A' } as any] })
        .stageproperty['A'].compulsoryactivity).toBeNull();
      expect(formValueToFlowConfig({ stageproperty: [{ stage: 'A', compulsoryactivity: 'x' } as any] })
        .stageproperty['A'].compulsoryactivity).toBeNull();
    });

    it('replaces a non-array combo entry with an empty array', () => {
      const c = formValueToFlowConfig({
        stageproperty: [{ stage: 'A', compulsoryactivity: [['x'], null] } as any],
      });
      expect(c.stageproperty['A'].compulsoryactivity).toEqual({ '0': ['x'], '1': [] });
    });
  });

  // =============================================================================================
  // OPU-12 — nextstage buttons
  // =============================================================================================
  describe('OPU-12 nextstage buttons', () => {
    it('carries stage, call to action, completion flag and variations', () => {
      const c = formValueToFlowConfig({
        stageproperty: [{
          stage: 'A',
          nextstage: [{ stage: 'B', calltoaction: 'Go', markascompleted: true, variations: ['v1'] }],
        } as any],
      });
      expect(c.stageproperty['A'].nextstage).toEqual([
        { stage: 'B', calltoaction: 'Go', markascompleted: true, variations: ['v1'] },
      ]);
    });

    it('defaults an absent call to action to an empty string', () => {
      const c = formValueToFlowConfig({
        stageproperty: [{ stage: 'A', nextstage: [{ stage: 'B' }] } as any],
      });
      expect(c.stageproperty['A'].nextstage![0].calltoaction).toBe('');
    });

    it('defaults variations to [] — which the flow model reads as ALL variations', () => {
      // Not a neutral default: [] means the button applies everywhere, so a dropped field silently widens
      // the button's scope rather than narrowing it.
      const c = formValueToFlowConfig({
        stageproperty: [{ stage: 'A', nextstage: [{ stage: 'B' }] } as any],
      });
      expect(c.stageproperty['A'].nextstage![0].variations).toEqual([]);
    });

    it('defaults a missing nextstage list to an empty array', () => {
      expect(formValueToFlowConfig({ stageproperty: [{ stage: 'A' } as any] })
        .stageproperty['A'].nextstage).toEqual([]);
    });
  });
});
