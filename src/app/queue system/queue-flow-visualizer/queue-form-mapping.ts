/**
 * Maps the live `queue-creation-v3` reactive-form value into a `FlowConfig`
 * (brief §4). Derives from the FORM VALUE, not the saved doc — the form is
 * shaped slightly differently (FormArrays) from the flattened `queue generation`.
 */
import { FlowConfig, StageProperty } from './queue-flow.model';

/** Shape of a single `stageproperty` FormArray entry's value. */
interface StagePropertyFormValue {
  stage: string;
  selfmovable?: boolean;
  actiontype?: StageProperty['actiontype'];
  studiowidgets?: string[];
  /** FormArray of controls, each holding a string[] of activity docids. */
  compulsoryactivity?: string[][];
  participantform?: string[];
  enablezoom?: boolean;
  nextstage?: {
    stage: string;
    calltoaction?: string;
    markascompleted?: boolean;
    variations?: string[];
  }[];
}

interface VariationFormValue {
  variationname: string;
  /** The variation's ordered stage subset (form field is `variation`). */
  variation?: string[];
  docid: string;
}

export interface QueueFormValue {
  stages?: string[];
  queuevariation?: VariationFormValue[];
  stageproperty?: StagePropertyFormValue[];
}

/** Convert the compulsoryactivity FormArray (array-of-arrays) to the keyed record. */
function combosToRecord(arr: string[][] | undefined): Record<string, string[]> | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const rec: Record<string, string[]> = {};
  arr.forEach((combo, i) => (rec[String(i)] = Array.isArray(combo) ? combo : []));
  return rec;
}

export function formValueToFlowConfig(value: QueueFormValue | null | undefined): FlowConfig {
  const v = value || {};
  const stageproperty: Record<string, StageProperty> = {};
  (v.stageproperty || []).forEach((p) => {
    if (!p || !p.stage) return;
    stageproperty[p.stage] = {
      selfmovable: !!p.selfmovable,
      actiontype: p.actiontype ?? null,
      studiowidgets: Array.isArray(p.studiowidgets) ? p.studiowidgets : [],
      compulsoryactivity: combosToRecord(p.compulsoryactivity),
      participantform: Array.isArray(p.participantform) ? p.participantform : [],
      enablezoom: !!p.enablezoom,
      nextstage: (Array.isArray(p.nextstage) ? p.nextstage : []).map((b) => ({
        stage: b.stage,
        calltoaction: b.calltoaction || '',
        markascompleted: !!b.markascompleted,
        variations: Array.isArray(b.variations) ? b.variations : [],
      })),
    };
  });

  return {
    stages: Array.isArray(v.stages) ? v.stages : [],
    queuevariation: (v.queuevariation || []).map((e) => ({
      id: e.docid,
      variationname: e.variationname,
      stages: Array.isArray(e.variation) ? e.variation : [],
    })),
    stageproperty,
  };
}
