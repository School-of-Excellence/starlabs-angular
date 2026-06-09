/**
 * fake-data.js — instantiate faithful FAKE documents for every queue-feature collection,
 * from the redacted schema skeletons in specs/queue-collection-schemas.json.
 *
 * The skeleton gives the field SHAPE (key -> type token like '<string>', '<timestamp>',
 * '<ref:products>', nested maps/arrays). This module turns a skeleton into a concrete fake
 * doc: type tokens become deterministic fake values, and a set of per-field OVERRIDES wires
 * the queue-critical fields (refs, ids, stage names, variation ids) so referential integrity
 * holds and the app/engine behave as in production.
 *
 * Two layers:
 *   1. instantiate()/makeDoc() — the generic skeleton→doc instantiator (token-driven, with
 *      per-keyPath overrides). Drives any collection from its JSON skeleton shape.
 *   2. buildDoc(collection, ctx) — the queue-aware factory. Knows the per-collection set of
 *      overrides that the app/CF actually reads (the §0 app-wide invariants from
 *      e2e/queue/recon/schemas.md: docid self-id, queueref-as-ref, tokenstatus "Active",
 *      variationid==variation docid, queueid-as-string). The seeder calls THIS, not makeDoc
 *      directly, so the field shapes the cloud seeder writes and the emulator seeder writes
 *      stay in lockstep (single source of truth for the contract).
 *
 * Pure: no Firebase calls. The seeder supplies a `ctx` (refs, ids, testrunid) and writes.
 * `ctx` shape (supplied by the seeder):
 *   { testrunid, now()->Timestamp, future()->Timestamp, past()->Timestamp,
 *     queueGenRef(queueDocId?)->DocumentReference (default DB),
 *     queueGenRefForms(queueDocId?)->DocumentReference (firestore-forms DB),
 *     tokenRef(tokenDocId)->DocumentReference, tokenRefForms(tokenDocId)->DocumentReference,
 *     refFor(collection)->DocumentReference (placeholder/seeded ref), geopoint()->GeoPoint,
 *     overrides?:Record<keyPath,value|fn> }
 */
'use strict';

/** Instantiate a concrete value from a schema token/shape. `over` lets callers pin fields. */
function instantiate(token, ctx, keyPath = '') {
  // explicit override for this exact field path wins
  if (ctx.overrides && Object.prototype.hasOwnProperty.call(ctx.overrides, keyPath)) {
    const o = ctx.overrides[keyPath];
    return typeof o === 'function' ? o(ctx) : o;
  }
  if (Array.isArray(token)) {
    if (token[0] === '<empty>') return [];
    return [instantiate(token[0], ctx, keyPath + '[]')];
  }
  if (token && typeof token === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(token)) {
      out[k] = instantiate(v, ctx, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  // scalar / special tokens
  switch (token) {
    case '<null>': return null;
    case '<string>': return `fake_${keyPath || 'val'}`;
    case '<redacted>': return `fake_${keyPath || 'val'}`; // PII fields → harmless fake string
    case '<number>': return 0;
    case '<boolean>': return false;
    case '<timestamp>': return ctx.now();
    case '<geopoint>': return ctx.geopoint ? ctx.geopoint() : null;
    case '<deep>': return null;
    default:
      if (typeof token === 'string' && token.startsWith('<ref:')) {
        const col = token.slice(5, -1);
        return ctx.refFor ? ctx.refFor(col) : null; // a DocumentReference into a sensible collection
      }
      return null;
  }
}

/**
 * Build a fake document for `collection` from its skeleton, applying overrides from ctx.
 * @param {string} collection
 * @param {object} schemaEntry  { _db, fields }
 * @param {object} ctx  generator context (see seeder)
 */
function makeDoc(collection, schemaEntry, ctx) {
  const fields = schemaEntry && schemaEntry.fields ? schemaEntry.fields : {};
  const base = instantiate(fields, ctx, '');
  // always stamp the test markers
  return { ...base, testrunid: ctx.testrunid, _testdata: true };
}

// ---------------------------------------------------------------------------
// Layer 2 — the queue-aware per-collection factory.
//
// Each builder returns ONLY the fields the app/CF actually reads (the schemas.md
// "required for the app" subset), with the §0 app-wide invariants honored. We deliberately
// hand-author these (rather than instantiate the full 40-field skeleton) because:
//   - the app reads a small, well-understood subset; the rest is CF-populated or unread,
//   - hand-authoring lets us pin queueref AS A REF, tokenstatus EXACTLY "Active", docid
//     self-id, variationid == variation docid, queueid AS A STRING — the invariants that a
//     blind skeleton-instantiate would get wrong (it would stringify refs and zero booleans).
// The seeder stamps docid/testrunid; builders below return the body. Every builder is PURE.
// ---------------------------------------------------------------------------

/** queue planning — slot/segment plan per variation (db default). schemas.md §B. */
function queuePlanning(ctx) {
  const { docid, queueDocId, variationId } = ctx;
  return {
    docid,
    queueid: queueDocId,                                 // STRING (§0.5)
    queueref: ctx.queueGenRef(queueDocId),               // REF (§0.2)
    variationlist: [variationId],
    segmentlist: [`${docid}_seg1`],
    planning: [{
      variationid: variationId,
      segments: [{ segmentid: `${docid}_seg1`, slots: [], stagecohort: [] }],
    }],
    slotinterest: [],
    createdAt: ctx.now(), updatedAt: ctx.now(),
  };
}

/** queue studio pairing — a live studio room (db default). schemas.md §B. */
function queueStudioPairing(ctx) {
  const {
    docid, queueDocId, participants = [], studioin = true, checkin = true,
    // participantsactivity drives dynamic-studio.onStudioSelect's studioStage derivation
    // (ts:645-671): Object.values(...).sort().join(',') must EQUAL a Diagnostics
    // compulsoryactivity combo for the studio token query (ts:695) to run at all. Default {}
    // is the EMPTY-studio case; the studio cohort seeder passes a Diagnostics-matching map.
    participantsactivity = {},
    // atcmodel === null makes the waiting-list eligibility filter (ts:808) short-circuit
    // ([null,undefined].includes(atcmodel)) BEFORE it dereferences token.productref.id — which
    // the seeded tokens omit (else the filter throws). Use null, NOT [] (an array does NOT
    // short-circuit and the filter would touch the missing productref). Caller may override.
    atcmodel = null,
  } = ctx;
  return {
    docid,
    queueref: ctx.queueGenRef(queueDocId),               // REF (§0.2); board filters on it (:1752)
    participants,                                        // [profileid] — array-contains queried (:395)
    participantsactivity,                                // map; values join-match a Diagnostics combo (:647)
    studioin,                                            // true to surface on board (:1753)
    checkin,                                             // true to surface on board
    openvidu: false,
    status: null,
    atcmodel,                                            // null ⇒ waiting-list filter short-circuits (:808)
    created: ctx.now(),
  };
}

/** studioinvitation — invite a participant into a studio (db default). schemas.md §B. */
function studioInvitation(ctx) {
  const {
    docid, queueDocId, studioId, tokenDocId, profileid, participantname,
    stage, type = 'stagegrouping', status = 'pending',
    invitedstudio = [], specialistpairing = [], createdby,
  } = ctx;
  return {
    docid,
    studioid: studioId,
    queueref: ctx.queueGenRef(queueDocId),               // REF (§0.2)
    tokenref: ctx.tokenRef(tokenDocId),                  // REF to the invited token (:974)
    profileid,
    participantname: participantname || `fake_${profileid}`,
    type,
    status,                                              // pending → success/cancelled
    stage,
    invitedstudio,                                       // array-contains-any queried (:484)
    mandatorystudio: invitedstudio.slice(),
    optionalstudio: [],
    deniedstudio: [],
    acceptedstudio: [],
    specialistpairing,                                   // array-contains queried (:546)
    clientresponse: null,                                // board filters ==null for active (:1770)
    createddate: ctx.now(),
    expirydate: ctx.future(),                            // MUST be future (expirydate>=now, :546/974)
    createdby: createdby || profileid,
  };
}

/** live assignment — the live studio session record (db default). schemas.md §B. */
function liveAssignment(ctx) {
  const {
    docid, queueDocId, studioId, stagename, stagetype = 'studio',
    participantid, status = 'live', pairing = [], bonusactivityparticipant = [],
    zoomdata = {},  // iscommunicationsdisabled:true ⇒ no real Zoom; minimal stub (schemas.md)
  } = ctx;
  return {
    docid,
    queueid: queueDocId,                                 // STRING (§0.5) — NOT a ref (:4660)
    studioid: studioId,
    stagename,
    stagetype,
    status,                                              // live/completed/instudio
    participantid,
    participantsactivity: {},
    bonusactivity: null,
    bonusactivityparticipant,                            // array-contains queried (:412)
    pairing,
    shadowperson: [],
    changeworkbrief: [],
    groupid: `${docid}_grp`,
    zoomlinkrequired: false,
    signature: `fake_sig_${docid}`,
    zoomdata,
    created: ctx.now(), updated: ctx.now(),
  };
}

/** arena participant — a participant's live-arena enrolment/role (db default). schemas.md §B. */
function arenaParticipant(ctx) {
  const {
    docid, queueDocId, profileid, pairingmode = 'pair',
    stagerole = ['participant'], liveassignmentstatus = 'pending', status = 'active',
  } = ctx;
  return {
    docid,
    queueid: queueDocId,                                 // STRING (§0.5)
    profileid,
    pairingmode,
    stagerole,
    liveassignmentstatus,
    status,
    tentativenextready: null,
  };
}

/** participant mode checklist — per-mode widget checklist (db default). schemas.md §B. */
function participantModeChecklist(ctx) {
  const { docid, profileid, mode, aelid, participantproductid } = ctx;
  return {
    docid,
    profileid,
    mode,
    aelid: aelid || `${docid}_ael`,
    participantproductid: participantproductid || `${docid}_pp`,
    productref: ctx.refFor('products'),
    createddate: ctx.now(),
    widget: [{
      widgetid: `${docid}_w0`,
      title: 'fake_checklist_item',
      mandatory: true,
      reference: [ctx.refFor('solar voice playlist')],
      dos: [], donts: [],
      result: null, completed: null, completedcontent: null, status: null,
    }],
  };
}

/** participantvideoask — a participant's uploaded video answer (db default). schemas.md §B. */
function participantVideoAsk(ctx) {
  const { docid, profileid, videoaskid } = ctx;
  return {
    docid,
    profileid,
    videoaskid,
    filename: `fake_${docid}.mp4`,
    filetype: 'video/mp4',
    mediatype: 'video',
    fileurl: 'https://example.test/v.mp4',
    created: ctx.now().toDate ? ctx.now().toDate().toISOString() : `${Date.now()}`, // prod stores a STRING
    uploaded: ctx.now(),
    convertedtohls: false,
    addtohighlights: false,
    workshopref: ctx.refFor('eiflix workshop'),
    arenaevent: ctx.refFor('event collection'),
    tags: [], watchedby: [],
    hls: {},                                             // large nested map — stub, not asserted
  };
}

/** arenavideoask — the video-ask QUESTION template (db default). schemas.md §B. orderBy('title'). */
function arenaVideoAsk(ctx) {
  const { docid, title, description = 'fake video ask', questiontype = 'video', questionurl = 'https://example.test/q.mp4' } = ctx;
  return {
    docid,
    title,                                               // orderBy key (queue-creation-v3:393)
    description,
    questiontype,
    questionurl,
    eventref: ctx.refFor('event collection'),
    active: true,
    createddate: ctx.now(),
  };
}

/** modes — the ordered mode list (db default). schemas.md §B. orderBy('sequence','asc'). */
function mode(ctx) {
  const { docid, mode: modeName, sequence } = ctx;
  return { docid, mode: modeName, sequence, info: null };
}

/** journey — the journey catalog entry (db default; uses `id` not `docid`). schemas.md §B. */
function journey(ctx) {
  const { id, journey: journeyName, type = 'core', sequence, originalfee = 0, atcmodel = 'none' } = ctx;
  return {
    id,                                                  // self-id via `id` (§0.1)
    journey: journeyName,
    type,
    sequence,                                            // orderBy('sequence','asc') (addjourney:75)
    originalfee,
    atcmodel,
    updatedAt: ctx.now(),
    journeyupgrades: [], extras: [], addonproducts: [],
    playlist: null,
  };
}

/** delivery forms — a FORM TEMPLATE (db firestore-forms). schemas.md §B. */
function deliveryForm(ctx) {
  const { docid, formname, formtype = 'queue', formfor = 'participant', formarray } = ctx;
  return {
    docid,
    formname: formname || `fake_form_${docid}`,
    formdescription: 'fake delivery form',
    formtype, formfor,
    formarray: formarray || [{
      fieldname: 'fake_field', type: 'text', required: false,
      options: [], array: [], maxitems: null,
      maxcount: false, mincount: false, flipping: false,
      fielddescription: null, fieldnotes: null,
    }],
    delete: false,
  };
}

/** formsByClient — a SUBMITTED form instance (db firestore-forms). schemas.md §B.
 *  NOTE: queueref/queuetokenref are refs created with the firestore-forms handle (named-DB
 *  ref caveat, schemas.md) — the seeder MUST pass ctx.queueGenRefForms/ctx.tokenRefForms. */
function formsByClient(ctx) {
  const { docid, formid, profileid, loginid, stagename, queueDocId, tokenDocId, formname } = ctx;
  return {
    docid,
    formid,                                              // the delivery forms template id
    profileid,                                           // submitter
    loginid: loginid || profileid,
    submittedin: 'queue',
    formname: formname || `fake_form_${formid}`,
    formarray: [{
      fieldname: 'fake_field', type: 'text', required: false,
      options: [], array: [], fielddescription: 'fake', fieldnotes: null,
      maxcount: false, mincount: false, flipping: false,
    }],
    stagename,
    queueref: ctx.queueGenRefForms(queueDocId),          // REF within firestore-forms (§0.2 + named-DB caveat)
    queuetokenref: ctx.tokenRefForms(tokenDocId),        // REF within firestore-forms
    // workshopref is NULL here on purpose: this doc lives in the firestore-forms named DB, and a
    // DocumentReference into the (default) DB is a cross-database ref — on cloud the Firestore SDK logs
    // an error-level "document reference within a different database … not supported" for every such doc
    // when dynamic-studio hydrates the forms widget. The app never dereferences workshopref, so null is
    // faithful and removes the benign-but-noisy cross-DB warning at the source (vs the emulator, where
    // firestore-forms was never connected so the read never happened). See cross-db-lowerbound.spec.ts.
    workshopref: null,
    date: ctx.now(),
  };
}

const BUILDERS = {
  'queue planning': queuePlanning,
  'queue studio pairing': queueStudioPairing,
  'studioinvitation': studioInvitation,
  'live assignment': liveAssignment,
  'arena participant': arenaParticipant,
  'participant mode checklist': participantModeChecklist,
  'participantvideoask': participantVideoAsk,
  'arenavideoask': arenaVideoAsk,
  'modes': mode,
  'journey': journey,
  'delivery forms': deliveryForm,
  'formsByClient': formsByClient,
};

/**
 * Queue-aware factory: build the app-read body for `collection` with all §0 invariants honored,
 * then stamp the test markers. The seeder supplies the collection-specific ctx fields.
 * @param {string} collection  one of the keys of BUILDERS
 * @param {object} ctx
 * @returns {object} the document body (incl. testrunid/_testdata)
 */
function buildDoc(collection, ctx) {
  const fn = BUILDERS[collection];
  if (!fn) throw new Error(`fake-data.buildDoc: no builder for collection "${collection}"`);
  const body = fn(ctx);
  return { ...body, testrunid: ctx.testrunid, _testdata: true };
}

module.exports = { instantiate, makeDoc, buildDoc, BUILDERS };
