// @ts-nocheck
// Segment Board engine: the standalone prototype's script, run against the component's root element.
// Ported as-is from "Segment Board (standalone).html"; all data below is the prototype's sample data.
// Type checking is off for this file on purpose: it is the prototype verbatim, to be replaced when
// the board is wired to Firestore (segment_sets / segment_membership).
// Master segment configuration is read from and written to Firestore through `store`
// (collection segmentboardconfig, one doc per segment). Participants are still sample data.
export interface SegmentBoardStore {
  load(): Promise<any[]>;                                   // every doc in segmentboardconfig, archived included
  saveSegment(doc: any, opts: { isNew: boolean; sequenceUpdates: { id: string; sequence: number }[] }): Promise<void>;
  saveDisplayOrder(ids: string[]): Promise<void>;          // displayIndex = position on the board
  archiveSegment(id: string): Promise<void>;
  loadParticipants(): Promise<any[]>;                      // participant metadata docs, already mapped (segment-board.facts.ts)
  loadLists(): Promise<{ segmentid: string; profilelist: string[]; lastupdated: Date | null }[]>;   // segmentboardlist
  saveLists(lists: { segmentid: string; segmentname: string; profilelist: string[] }[]): Promise<void>;
  // journeys from `journey`, products from `products` (ids + names); countDefaults = products counted as uP! / CPM events
  readTable(file: File): Promise<string[][]>;               // rows x cells of an uploaded CSV / Excel file
  loadCatalog(): Promise<{ journeys: { id: string; name: string }[]; products: { id: string; name: string }[]; countDefaults: { upCount: string[]; cpmCount: string[] } }>;
}
export function mountSegmentBoard(root: HTMLElement, store: SegmentBoardStore): () => void {
const cleanups: Array<() => void> = [];
const listen = (target, type, fn, opts?) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };

const CFG = {"set":"master","version":6,"notes":"Automated segments are evaluated in ascending 'sequence'; the first match wins. Manual segments have no sequence: a participant placed there is pinned, and 'eligibility' only drives the 'no longer eligible' warning. Ongoing products are listed explicitly per segment (no product category field). Ongoing-product segments apply to Onboarded AND Yet-to-Onboard participants and to ACTIVE customers only; a non-active participant cannot have a product ongoing, so they fall to Ecosystem Non Active or DFU Non Active. A non-active participant must have no ongoing product: if one is ongoing, they fall to Unsegmented with reason NON_ACTIVE_WITH_PRODUCT so the data can be fixed. Segments are a flat list: there are no segment groups.","journeyGroups":{"UP":["uP!","uP! Continuity","uP! Lite"],"CPM":["CPM","CPM Upgrade","CPM Continuity"],"FTM_LYL":["FTM","FTM with SLDCI","FTM Continuity","LYL"],"BIG":["B!G","B!G with SLDCI","B!G Continuity"],"DI":["CTD D&I","SMP D&I","EISP","EI Solution","W!SH"],"ARENA":["DEEE","Winning Heart","CTD Live Event"]},"fragments":{"financeOk":{"field":"financeStatus","op":"in","value":["REGULAR","DEFAULTED","LOCKED"]},"onboarded":{"field":"onboardingStatus","op":"eq","value":"ONBOARDED"},"active":{"field":"customerStatus","op":"eq","value":"ACTIVE"},"nonActive":{"field":"customerStatus","op":"eq","value":"NON_ACTIVE"},"activeOrNon":{"field":"customerStatus","op":"in","value":["ACTIVE","NON_ACTIVE"]},"ecosystem":{"field":"journeyGroup","op":"in","value":["UP","CPM","FTM_LYL","BIG"]},"prodigyJourney":{"field":"journeyGroup","op":"in","value":["UP","CPM","FTM_LYL"]},"adult":{"field":"age","op":"gte","value":22},"minor":{"field":"age","op":"between","value":[0,21]},"noProduct":{"field":"ongoingProducts","op":"isEmpty"}},"segments":[{"id":"DNU_LATE","name":"Do Not Use – Late","mode":"auto","sequence":1,"rule":{"any":[{"field":"customerStatus","op":"eq","value":"LATE"},{"field":"financeStatus","op":"eq","value":"LATE"}]}},{"id":"DNU_BANNED","name":"Do Not Use – Banned","mode":"auto","sequence":2,"rule":{"any":[{"field":"customerStatus","op":"eq","value":"BANNED"},{"field":"financeStatus","op":"eq","value":"BANNED"}]}},{"id":"DNU_DISCONTINUED","name":"Do Not Use – Discontinued","mode":"auto","sequence":3,"rule":{"any":[{"field":"customerStatus","op":"eq","value":"DISCONTINUED"},{"field":"financeStatus","op":"eq","value":"DISCONTINUED"}]}},{"id":"ECO_LIVE_ARENA","name":"Live Arena Events","mode":"auto","sequence":4,"rule":{"all":["@ecosystem","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["BIG_ARENA","CTD_LIVE","DEEE_ARENA","WINNING_HEART"]}]}},{"id":"ECO_DFU_QUEUE","name":"DFU (Queue)","mode":"auto","sequence":5,"rule":{"all":["@ecosystem","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["WISH_DI","SMP_DI","CTD_DI"]}]}},{"id":"ECO_DFU_APPT","name":"DFU (Appointment)","mode":"auto","sequence":6,"rule":{"all":["@ecosystem","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["DFU_APPT","EI_CONSULT"]}]}},{"id":"DI_ONGOING","name":"DFU Ongoing","mode":"auto","sequence":7,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"DI"},"@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["WISH_DI","SMP_DI","CTD_DI","DFU_APPT","EI_CONSULT"]}]}},{"id":"ARENA_LIVE","name":"Live Arena Events","mode":"auto","sequence":8,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"ARENA"},"@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["BIG_ARENA","CTD_LIVE","DEEE_ARENA","WINNING_HEART"]}]}},{"id":"UP_IN_QUEUE","name":"uP! – In Queue","mode":"auto","sequence":9,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"UP"},"@adult","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["UP_LIVE","CPM_LIVE","LEGACY_CONSULT","MOMENTUM_CALL"]}]}},{"id":"PROD_IN_QUEUE","name":"uP! for Prodigies – In Queue","mode":"auto","sequence":10,"rule":{"all":["@prodigyJourney","@minor","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["UP_LIVE","CPM_LIVE","LEGACY_CONSULT","MOMENTUM_CALL"]}]}},{"id":"CPM_IN_QUEUE","name":"CPM – In Queue","mode":"auto","sequence":11,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["UP_LIVE","CPM_LIVE","LEGACY_CONSULT","MOMENTUM_CALL"]}]}},{"id":"LYL_IN_QUEUE","name":"LYL – In Queue","mode":"auto","sequence":12,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["UP_LIVE","CPM_LIVE","LEGACY_CONSULT","MOMENTUM_CALL"]}]}},{"id":"BIG_IN_QUEUE","name":"B!G – In Queue","mode":"auto","sequence":13,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@active","@financeOk",{"field":"ongoingProducts","op":"hasAny","value":["UP_LIVE","CPM_LIVE","LEGACY_CONSULT","MOMENTUM_CALL"]}]}},{"id":"YTO_NEW","name":"New Journey – Yet to be Onboard","mode":"auto","sequence":14,"rule":{"all":[{"field":"onboardingStatus","op":"eq","value":"YTO_NEW"},{"field":"upCount","op":"eq","value":0},{"field":"cpmCount","op":"eq","value":0},"@active","@financeOk","@noProduct"]}},{"id":"YTO_UPDOWN","name":"Upgraded / Downgraded – Yet to be Onboard","mode":"auto","sequence":15,"rule":{"all":[{"field":"onboardingStatus","op":"in","value":["YTO_UPGRADE","YTO_DOWNGRADE"]},"@active","@financeOk","@noProduct"]}},{"id":"YTO_ADDON","name":"Addon Purchased – Yet to be Onboard","mode":"auto","sequence":16,"rule":{"all":[{"field":"onboardingStatus","op":"eq","value":"YTO_ADDON"},"@active","@financeOk","@noProduct"]}},{"id":"DI_PRE","name":"Pre DFU","mode":"auto","sequence":17,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"DI"},"@onboarded","@active","@financeOk","@noProduct",{"field":"unconsumedProducts","op":"notEmpty"}]}},{"id":"DI_POST","name":"Post DFU","mode":"auto","sequence":18,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"DI"},"@onboarded","@active","@financeOk","@noProduct",{"field":"unconsumedProducts","op":"isEmpty"}]}},{"id":"ARENA_PRE","name":"Pre Arena Events","mode":"auto","sequence":19,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"ARENA"},"@onboarded","@active","@financeOk","@noProduct",{"field":"unconsumedProducts","op":"notEmpty"}]}},{"id":"ARENA_POST","name":"Post Arena Events","mode":"auto","sequence":20,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"ARENA"},"@onboarded","@active","@financeOk","@noProduct",{"field":"unconsumedProducts","op":"isEmpty"}]}},{"id":"ECO_NON_ACTIVE","name":"Ecosystem Non Active","mode":"auto","sequence":21,"rule":{"all":["@ecosystem","@onboarded","@nonActive","@financeOk","@noProduct"]}},{"id":"DFU_NON_ACTIVE","name":"DFU Non Active","mode":"auto","sequence":22,"rule":{"all":[{"field":"journeyGroup","op":"in","value":["DI","ARENA"]},"@onboarded","@nonActive","@financeOk","@noProduct"]}},{"id":"BIG_PRE_UP","name":"B!G – Pre uP!","mode":"auto","sequence":23,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":0},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"BIG_PRE_CPM","name":"B!G – Pre CPM","mode":"auto","sequence":24,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"gte","value":1},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"BIG_CPM_1","name":"B!G – 1 CPM Event","mode":"auto","sequence":25,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":1}]}},{"id":"BIG_CPM_2","name":"B!G – 2 CPM Events","mode":"auto","sequence":26,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":2}]}},{"id":"BIG_CPM_3P","name":"B!G – 3+ CPM Events","mode":"auto","sequence":27,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"gte","value":3}]}},{"id":"LYL_PRE_UP","name":"FTM / LYL – Pre uP!","mode":"auto","sequence":28,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":0},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"LYL_PRE_CPM","name":"FTM / LYL – Pre CPM","mode":"auto","sequence":29,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"gte","value":1},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"LYL_CPM_1","name":"FTM / LYL – 1 CPM Event","mode":"auto","sequence":30,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":1}]}},{"id":"LYL_CPM_2","name":"FTM / LYL – 2 CPM Events","mode":"auto","sequence":31,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":2}]}},{"id":"LYL_CPM_3P","name":"FTM / LYL – 3+ CPM Events","mode":"auto","sequence":32,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"FTM_LYL"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"gte","value":3}]}},{"id":"CPM_PRE_UP","name":"CPM – Pre uP!","mode":"auto","sequence":33,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":0},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"CPM_PRE_CPM","name":"CPM – Pre CPM","mode":"auto","sequence":34,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"gte","value":1},{"field":"cpmCount","op":"eq","value":0}]}},{"id":"CPM_CPM_1","name":"CPM – 1 CPM Event","mode":"auto","sequence":35,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":1}]}},{"id":"CPM_CPM_2","name":"CPM – 2 CPM Events","mode":"auto","sequence":36,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"eq","value":2}]}},{"id":"CPM_CPM_3P","name":"CPM – 3+ CPM Events","mode":"auto","sequence":37,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"CPM"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"cpmCount","op":"gte","value":3}]}},{"id":"UP_PRE","name":"Pre uP!","mode":"auto","sequence":38,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"UP"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":0}]}},{"id":"UP_1","name":"1 uP! Event","mode":"auto","sequence":39,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"UP"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":1}]}},{"id":"UP_2","name":"2 uP! Events","mode":"auto","sequence":40,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"UP"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":2}]}},{"id":"UP_3P","name":"3+ uP! Events","mode":"auto","sequence":41,"rule":{"all":[{"field":"journeyGroup","op":"eq","value":"UP"},"@adult","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"gte","value":3}]}},{"id":"PROD_PRE","name":"Pre uP! for Prodigies","mode":"auto","sequence":42,"rule":{"all":["@prodigyJourney","@minor","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":0}]}},{"id":"PROD_1","name":"Prodigies – 1 uP! Event","mode":"auto","sequence":43,"rule":{"all":["@prodigyJourney","@minor","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":1}]}},{"id":"PROD_2","name":"Prodigies – 2 uP! Events","mode":"auto","sequence":44,"rule":{"all":["@prodigyJourney","@minor","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"eq","value":2}]}},{"id":"PROD_3P","name":"Prodigies – 3+ uP! Events","mode":"auto","sequence":45,"rule":{"all":["@prodigyJourney","@minor","@onboarded","@active","@financeOk","@noProduct",{"field":"upCount","op":"gte","value":3}]}},{"id":"BIG_L_PRE_CW","name":"Pre CW Mastery – Field Preparation","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_SHOW","name":"Showmanship (CW Mastery + Scope Enhancement)","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_CW","name":"CW Mastery","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_IA","name":"IA","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_IB","name":"IB","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_IC","name":"IC","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}},{"id":"BIG_L_ID","name":"ID","mode":"manual","eligibility":{"all":[{"field":"journeyGroup","op":"eq","value":"BIG"},"@onboarded","@active","@financeOk"]}}],"products":[{"id":"UP_LIVE","name":"uP! Live Event"},{"id":"CPM_LIVE","name":"CPM Live Event"},{"id":"LEGACY_CONSULT","name":"Legacy Consultation"},{"id":"MOMENTUM_CALL","name":"Momentum Call"},{"id":"BIG_ARENA","name":"B!G Accelerator Arena"},{"id":"CTD_LIVE","name":"CTD Live Event"},{"id":"DEEE_ARENA","name":"DEEE Arena"},{"id":"WINNING_HEART","name":"Winning Heart Arena"},{"id":"WISH_DI","name":"W!SH Diagnostics and Implementation"},{"id":"SMP_DI","name":"SMP D&I Implementation"},{"id":"CTD_DI","name":"CTD D&I Implementation"},{"id":"DFU_APPT","name":"DFU Appointment Session"},{"id":"EI_CONSULT","name":"EI Solution Consultation"}]};
const FRAG = CFG.fragments;

// ---------- vocabulary ----------
const VAL = {
  journeyGroup:{UP:'uP!',CPM:'CPM',FTM_LYL:'FTM / LYL',BIG:'B!G',DI:'D&I DFU',ARENA:'Installation Arena'},
  onboardingStatus:{ONBOARDED:'Onboarded',YTO_NEW:'Yet to onboard',YTO_UPGRADE:'Yet to Onboard (Upgrade)',YTO_DOWNGRADE:'Yet to Onboard (Downgrade)',YTO_ADDON:'Yet to Onboard (Addon)'},
  customerStatus:{ACTIVE:'Active',NON_ACTIVE:'Non active',DISCONTINUED:'Discontinued',LATE:'Late',BANNED:'Banned',NO_STATUS:'No status'},
  financeStatus:{REGULAR:'Regular',FULLY_PAID:'Fully paid',DEFAULTED:'Defaulted',LOCKED:'Locked',DISCONTINUED:'Discontinued',LATE:'Late',BANNED:'Banned',NO_STATUS:'No status'}
};
// catalogue from Firestore, filled by setCatalog() in load(): products (`products`) and journeys (`journey`)
let PRODUCTS=[];
let PROD={};
let JOURNEYS=[];
const QUEUE_STAGES=['Registered','Invited','Ready','In studio','Completed'];
// names as they are created in the events, queue and workshop screens
const EVENTS=[
  {id:'E_UP_AUG25',name:'uP! Live Aug 2025',product:'UP_LIVE'},
  {id:'E_UP_FEB26',name:'uP! Live Feb 2026',product:'UP_LIVE'},
  {id:'E_UP_MAY26',name:'uP! Live May 2026',product:'UP_LIVE'},
  {id:'E_CPM_SEP25',name:'CPM Live Sep 2025',product:'CPM_LIVE'},
  {id:'E_CPM_MAR26',name:'CPM Live Mar 2026',product:'CPM_LIVE'},
  {id:'E_BIG_NOV25',name:'B!G Accelerator Nov 2025',product:'BIG_ARENA'},
  {id:'E_CTD_JUN25',name:'CTD Live Jun 2025',product:'CTD_LIVE'},
  {id:'E_DEEE_MAR26',name:'DEEE Arena Mar 2026',product:'DEEE_ARENA'},
  {id:'E_WH_JAN26',name:'Winning Heart Jan 2026',product:'WINNING_HEART'}
];
const QUEUES=['uP!/LYL D&I','Walk in Clinic','CTD D&I','B!G Studio','SMP D&I'];
const WORKSHOPS=['CTD Workshop','SMP Workshop','Scope Enhancement Workshop','W!SH Workshop'];
const BIG_LEVELS=['SE Solo','SE Shadow','Diagnostics Shadow','Diagnostics Collaborator','Diagnostics Solo'];
const EVENT_NAME=Object.fromEntries(EVENTS.map(e=>[e.id,e.name]));
const asMap=a=>Object.fromEntries(a.map(x=>[x,x]));
const FIELDS = [
  {key:'journeyGroup',label:'Journey',type:'enum'},
  {key:'journeyId',label:'Journey',type:'enum'},   // segment-level Journey setting (journey doc ids)
  {key:'onboardingStatus',label:'Onboarding status',type:'enum'},
  {key:'customerStatus',label:'Customer status',type:'enum'},
  {key:'financeStatus',label:'Finance status',type:'enum'},
  {key:'upCount',label:'uP! events attended',type:'number'},
  {key:'cpmCount',label:'CPM events attended',type:'number'},
  {key:'age',label:'Age',type:'number'},
  {key:'ongoingProducts',label:'Ongoing product',type:'productList'},
  {key:'consumedProducts',label:'Consumed product',type:'products'},
  {key:'unconsumedProducts',label:'Unconsumed product',type:'products'}
];
const FIELD = Object.fromEntries(FIELDS.map(f=>[f.key,f]));
const OPS_FOR = {
  enum:[],
  number:[['eq','is exactly'],['gte','is at least'],['lte','is at most'],['between','is between']],
  enumList:[['hasAny','is'],['isEmpty','is empty (none)']],
  productList:[['hasAny','any of these'],['equals','equals'],['isEmpty','none (nothing ongoing)']],   // ongoing product
  products:[['counts','products with a count']],   // fixed: the builder shows no operator dropdown
  list:[['notEmpty','has at least one'],['isEmpty','is empty']]
};
const CMP_WORDS={gte:'is at least',eq:'is exactly',lte:'is at most'};
// uP! / CPM attended: the count is the total consumed across the picked products (condition.products)
let COUNT_DEFAULT={upCount:[],cpmCount:[]};   // set from the catalogue in setCatalog()
const sameSet=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const sumConsumed=(f,ids)=>ids.reduce((a,id)=>a+((f.consumedProducts||{})[id]||0),0);
// onboarding is a two-way choice in the builder: Onboarded, or Yet to onboard (all four YTO statuses)
const YTO=['YTO_NEW','YTO_UPGRADE','YTO_DOWNGRADE','YTO_ADDON'];
const obKind=v=>{const a=Array.isArray(v)?v:[v];
  return a.length===1&&a[0]==='ONBOARDED'?'ONBOARDED':a.length===YTO.length&&YTO.every(x=>a.includes(x))?'YTO':null;};
const DESC_MAX=280;   // segment description length limit
const REASONS = {
  JOURNEY_UNMAPPED:'No journey on the participant', STATUS_MISSING:'Customer or finance status missing',
  YTO_NON_ACTIVE:'Yet to Onboard and Non active', YTO_NEW_WITH_EVENTS:'New journey but has uP!/CPM events',
  PRODUCT_NOT_IN_ANY_SEGMENT:'Ongoing product not listed in any segment', AGE_MISSING:'Date of birth missing',
  NON_ACTIVE_WITH_PRODUCT:'Non active but has an ongoing product',
  PRODUCT_NOT_VALID_FOR_JOURNEY:'Ongoing product not valid for journey', NO_RULE_MATCH:'Matches no segment',
  LIST_NOT_REFRESHED:'No segment list refreshed yet'
};

// ---------- evaluator (same logic as rules/evaluate.mjs) ----------
const OPS = {
  eq:(v,x)=>v===x, in:(v,x)=>x.includes(v),
  gte:(v,x)=>typeof v==='number'&&v>=x, lte:(v,x)=>typeof v==='number'&&v<=x,
  between:(v,x)=>typeof v==='number'&&v>=x[0]&&v<=x[1],
  isEmpty:v=>!v||keysOf(v).length===0, notEmpty:v=>!!v&&keysOf(v).length>0,
  hasAny:(v,x)=>!!v&&keysOf(v).some(i=>x.includes(i)),
  equals:(v,x)=>{const k=keysOf(v); return k.length===x.length&&x.every(i=>k.includes(i));},   // exactly these, nothing else
  countFor:(v,x)=>cmpCount(v,x),
  counts:(v,x)=>x.mode==='any'?x.items.some(i=>cmpCount(v,i)):x.items.every(i=>cmpCount(v,i))
};
function cmpCount(v,x){const n=(v&&v[x.product])||0;return x.op==='eq'?n===x.n:x.op==='lte'?n<=x.n:n>=x.n;}
function keysOf(v){return Array.isArray(v)?v:Object.keys(v||{}).filter(k=>v[k]>0);}
function matches(n,f){
  if(typeof n==='string') return matches(FRAG[n.slice(1)],f);
  if(n.all) return n.all.every(c=>matches(c,f));
  if(n.any) return n.any.some(c=>matches(c,f));
  return OPS[n.op](n.products?sumConsumed(f,n.products):f[n.field],n.value);
}
function expand(n){
  if(typeof n==='string') return expand(FRAG[n.slice(1)]);
  if(n.all) return {all:n.all.flatMap(c=>{const e=expand(c);return e.all?e.all:[e];})};
  if(n.any) return {any:n.any.map(expand)};
  return {...n};
}
function describe(n){   // products note only when it differs from the default for that count
  const pc=n.products&&COUNT_DEFAULT[n.field]&&!sameSet(n.products,COUNT_DEFAULT[n.field])?` · counting ${n.products.map(id=>PROD[id]||id).join(', ')}`:'';
  return describeLeaf(n)+pc;
}
function describeLeaf(n){
  const f=FIELD[n.field], L=(f&&/^product/.test(f.type))?PROD:(VAL[n.field]||{}), lab=f?f.label:n.field;
  const list=a=>a.map(v=>L[v]||v).join(', ').replace(/, ([^,]*)$/,' or $1');
  const cword=n.field==='unconsumedProducts'?'unconsumed':'consumed';
  const one=i=>`${PROD[i.product]||i.product} ${cword} ${CMP_WORDS[i.op]} ${i.n}`;
  if(n.op==='countFor') return one(n.value);
  if(n.op==='counts') return n.value.items.map(one).join(n.value.mode==='any'?' or ':' and ');
  switch(n.op){
    case 'eq': return typeof n.value==='number'?`${lab} is ${n.value}`:`${lab} is ${L[n.value]||n.value}`;
    case 'in': if(n.field==='onboardingStatus'&&obKind(n.value)==='YTO') return `${lab} is Yet to onboard`;
      return `${lab} is ${list(n.value)}`;
    case 'gte': return `${lab} is ${n.value} or more`;
    case 'lte': return `${lab} is ${n.value} or less`;
    case 'between': return `${lab} is ${n.value[0]}–${n.value[1]}`;
    case 'isEmpty': return n.field==='ongoingProducts'?'No ongoing product':`No ${lab.toLowerCase()}`;
    case 'notEmpty': return `Has ${lab.toLowerCase()}`;
    case 'hasAny': return `${lab} includes ${list(n.value)}`;
    case 'equals': return `${lab} is exactly ${n.value.map(v=>L[v]||v).join(', ').replace(/, ([^,]*)$/,' and $1')}`;
  }
  return JSON.stringify(n);
}
function diagnose(set,f){
  if(set.type!=='master') return (f.customerStatus==null||f.financeStatus==null)?'STATUS_MISSING':'NO_RULE_MATCH';
  if(f.journeyGroup==null) return 'JOURNEY_UNMAPPED';
  if(f.customerStatus==null||f.financeStatus==null) return 'STATUS_MISSING';
  if(f.customerStatus==='NON_ACTIVE'&&f.ongoingProducts.length) return 'NON_ACTIVE_WITH_PRODUCT';
  if(f.onboardingStatus!=='ONBOARDED'&&f.customerStatus==='NON_ACTIVE') return 'YTO_NON_ACTIVE';
  if(f.onboardingStatus==='YTO_NEW'&&(f.upCount>0||f.cpmCount>0)) return 'YTO_NEW_WITH_EVENTS';
  if(f.ongoingProducts.length&&!PROD[f.ongoingProducts[0]]) return 'PRODUCT_NOT_IN_ANY_SEGMENT';
  if(f.age==null&&['UP','CPM','FTM_LYL'].includes(f.journeyGroup)) return 'AGE_MISSING';
  if(['DI','ARENA'].includes(f.journeyGroup)&&f.ongoingProducts.length) return 'PRODUCT_NOT_VALID_FOR_JOURNEY';
  return 'NO_RULE_MATCH';
}

// ---------- scope: the segment-level journey setting, not a condition ----------
// stored as segment.journeys = [journey ids]; empty = all journeys. (B.scope is the dialog's working copy.)
const SCOPE_FIELDS=['journeyGroup','journeyId'];
const SCOPE={
  journey:{label:'Journey',plural:'journeys',field:'journeyId',opts:()=>JOURNEYS.map(j=>[j.id,j.name])}
};
const fragOf=n=>typeof n==='string'?FRAG[n.slice(1)]:n;
function liftJourney(rule){   // seeded rules: move a top-level journey condition out of the rule
  if(!rule||!rule.all) return {journeys:[],rule};
  const j=rule.all.find(n=>fragOf(n)?.field==='journeyGroup'); if(!j) return {journeys:[],rule};
  const e=fragOf(j);
  return {journeys:e.op==='eq'?[e.value]:[...e.value], rule:{all:rule.all.filter(n=>n!==j)}};
}
const withScope=(sc,rule)=>sc&&sc.ids.length?{all:[{field:SCOPE[sc.type].field,op:'in',value:sc.ids},...(rule?(rule.all||[rule]):[])]}:rule;
const jScope=ids=>({type:'journey',ids:ids||[]});
const segRule=s=>withScope(jScope(s.journeys),s.rule);
const segElig=s=>withScope(jScope(s.journeys),s.eligibility);
const scopeLabel_=sc=>SCOPE[sc?.type||'journey'].label;
const scopeText=sc=>{const t=sc?.type||'journey', map=Object.fromEntries(SCOPE[t].opts());
  return sc&&sc.ids.length?sc.ids.map(v=>map[v]||v).join(', '):`All ${SCOPE[t].plural}`;};
const scopeKey=sc=>sc&&sc.ids.length?sc.type+':'+sc.ids.join(','):'';

// ---------- example data ----------
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const R=rng(20260922);
const pickW=o=>{const e=Object.entries(o);let r=R()*e.reduce((a,x)=>a+x[1],0);for(const [k,w] of e){if((r-=w)<0)return k;}return e[e.length-1][0];};
const ri=(a,b)=>a+Math.floor(R()*(b-a+1));
const pick=a=>a[Math.floor(R()*a.length)];
const FIRST=['Aarav','Diya','Ishaan','Ananya','Vihaan','Saanvi','Arjun','Meera','Kabir','Nila','Rohan','Priya','Karthik','Lakshmi','Aditya','Kavya','Siddharth','Divya','Rahul','Sneha','Vikram','Pooja','Naveen','Keerthana','Harish','Janani','Suresh','Revathi','Ganesh','Anjali','Farhan','Zara','Joseph','Mary','Deepak','Nandini','Arun','Bhavya','Manoj','Swathi','Nikhil','Tara','Varun','Ishita'];
const LAST=['Sharma','Iyer','Reddy','Nair','Menon','Patel','Krishnan','Rao','Gupta','Pillai','Subramanian','Das','Joshi','Kumar','Chandran','Varma','Bose','Mehta','Raman','Thomas','Fernandes','Khan','Srinivasan','Ganesan','Balaji','Shetty','Kapoor'];
// participants = participant metadata docs, loaded in load() (mapping: segment-board.facts.ts)
let P=[];
let PI=new Map();
// segment lists (segmentboardlist): segmentId -> { ids: Set<profileid>, lastupdated }
const LISTS=new Map();
const MEMBERSHIP_EDIT=false;   // lists come from conditions; moving people by hand is off for now

// ---------- sets & membership ----------
const clone=o=>JSON.parse(JSON.stringify(o));
const MEM={};
function refresh(set){
  // checked in sequence order; inactive segments place no one
  set._auto=set.segments.filter(s=>s.mode==='auto'&&s.status!=='inactive').sort((a,b)=>a.sequence-b.sequence);
  set._members=[...set._auto,...set.segments.filter(s=>s.mode==='manual'&&s.status!=='inactive')];   // every segment with a list
  set._by=new Map(set.segments.map(s=>[s.id,s]));
}
function assign(set,p,m){
  // every active automated segment whose refreshed list holds this participant, in sequence order
  m.segs=set._members.filter(s=>LISTS.get(s.id)?.ids.has(p.pid)).map(s=>s.id);
  m.matched=m.segs; m.pinned=false; m.warning=null;
  m.segmentId=m.segs[0]||null;
  m.reason=m.segmentId?null:!set._members.some(s=>LISTS.has(s.id))?'LIST_NOT_REFRESHED'
    :p.f.journeyId==null?'JOURNEY_UNMAPPED':(p.f.customerStatus==null||p.f.customerStatus==='NO_STATUS'||p.f.financeStatus==null||p.f.financeStatus==='NO_STATUS')?'STATUS_MISSING':'NO_RULE_MATCH';
}
function computeSet(set){
  refresh(set);
  const mm=MEM[set.id]=new Map();
  for(const p of P){const m={pinned:false,segmentId:null,segs:[]}; mm.set(p.pid,m); assign(set,p,m);}
}
function rank(s){return /IN_QUEUE/.test(s.id)?900:/NON_ACTIVE/.test(s.id)?950:(s.sequence??1000);}
function defaultOrder(segs){ return segs.slice().sort((a,b)=>rank(a)-rank(b)).map(s=>s.id); }
// master segments are loaded from segmentboardconfig in load() below; the board starts empty
const master={id:'master',type:'master',name:'Master Segments',segments:[],displayOrder:[],defaultDisplayOrder:[]};
const SETS=[master];
const ARCHIVED_IDS=new Set();   // archived docs keep their id reserved
computeSet(master);
const AUDIT=[];                 // change history for this session only (not stored yet)

// a stored doc -> the board's in-memory segment
function fromDoc(d){
  const seg={...d, journeys:d.journeys||[], status:d.status||'active'};
  if(seg.mode==='auto') seg.rule=Array.isArray(d.rule)?{all:d.rule}:(d.rule||{all:[]});   // stored rule = plain condition list
  return seg;
}
function setCatalog(cat){
  const byName=(a,b)=>a.name.localeCompare(b.name);
  PRODUCTS=cat.products.slice().sort(byName); PROD=Object.fromEntries(PRODUCTS.map(p=>[p.id,p.name]));
  JOURNEYS=cat.journeys.slice().sort(byName); VAL.journeyId=Object.fromEntries(JOURNEYS.map(j=>[j.id,j.name]));
  COUNT_DEFAULT={upCount:cat.countDefaults.upCount.filter(id=>PROD[id]),cpmCount:cat.countDefaults.cpmCount.filter(id=>PROD[id])};
}
async function load(){
  S.loading=true; S.loadError=null; render();
  try{
    const [docs,parts,lists,cat]=await Promise.all([store.load(),store.loadParticipants(),store.loadLists(),store.loadCatalog()]);
    setCatalog(cat);
    // A–Z by name (then profile id): every list on the board walks P, so they all come out in this order
    P=parts.slice().sort((x,y)=>x.name.localeCompare(y.name,undefined,{sensitivity:'base',numeric:true})||x.pid.localeCompare(y.pid)); PI=new Map(P.map(p=>[p.pid,p]));
    LISTS.clear(); for(const l of lists) LISTS.set(l.segmentid,{ids:new Set(l.profilelist||[]),lastupdated:l.lastupdated||null});
    ARCHIVED_IDS.clear();
    const live=[];
    for(const d of docs){ if(d.archived) ARCHIVED_IDS.add(d.id); else live.push(fromDoc(d)); }
    master.segments=live;
    master.defaultDisplayOrder=defaultOrder(live);
    master.displayOrder=live.slice().sort((a,b)=>(a.displayIndex??1e9)-(b.displayIndex??1e9)||master.defaultDisplayOrder.indexOf(a.id)-master.defaultDisplayOrder.indexOf(b.id)).map(x=>x.id);
    computeSet(master);
  }catch(e){ S.loadError=e?.message||String(e); }
  S.loading=false; render();
}

// ---------- helpers ----------
const $=(s,r=root)=>r.querySelector(s), $$=(s,r=root)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-IN');
const pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—';
const plural=(n,w)=>`${fmt(n)} ${w}${n===1?'':'s'}`;
const TIME=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const Sortable=window.Sortable; const sortableOk=typeof Sortable!=='undefined';
const LOCK='<svg class="lock" width="12" height="12" viewBox="0 0 16 16" aria-label="Placed by hand" role="img"><title>Placed by hand</title><path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Zm2 0h4V5a2 2 0 1 0-4 0v2Z"/></svg>';
const LOGO='<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke-width="5"><circle cx="16" cy="16" r="11" stroke="var(--primary)" stroke-dasharray="20 3.04"/><circle cx="16" cy="16" r="11" stroke="var(--bar)" stroke-dasharray="11 58.1" stroke-dashoffset="-23"/></g></svg>';

// participant metadata.participantmode — the 15-value lifecycle catalog (`modes`), lowest sequence first
const MODES=['Big','Installation Event','Event','Integration','Priority','Preparation','Performance','Journey Priority Planning','Extended Performance','Early Preparation','Journey Planning','Exploration','After Extended Performance','Snooze','Investment'];
const WORKSHOP_STATES=[['any','Any'],['enrollednotstarted','Enrolled, not started'],['inprogress','In progress'],['completed','Completed'],['attended','Attended a live session'],['missed','Missed the last live session'],['none','Never enrolled']];
const emptyFilters=()=>({journey:[],customer:[],finance:[],mode:[],product:'',
  events:[],eventsMode:'attended', queues:[],queueStage:'', workshops:[],workshopState:'any',
  ongoing:[], ageMin:'', ageMax:'', bigLevel:[]});
const OPTS={journey:()=>VAL.journeyId, customer:()=>VAL.customerStatus, finance:()=>VAL.financeStatus,
  mode:()=>asMap(MODES), events:()=>EVENT_NAME, queues:()=>asMap(QUEUES), workshops:()=>asMap(WORKSHOPS),
  ongoing:()=>PROD, bigLevel:()=>asMap(BIG_LEVELS)};
const S={stale:new Set(),refreshing:null,role:'admin',setId:'master',teamId:null,arranging:false,drawer:null,sel:new Set(),dq:'',limit:150,dev:false,dragPids:null,cardView:{},filters:emptyFilters(),fids:null,collapsed:new Set(),prevCollapsed:null,cardSel:new Set()};
function filtersOn(){const F=S.filters;
  return !!(F.journey.length||F.customer.length||F.finance.length||F.mode.length||F.product||F.events.length
    ||F.queues.length||F.queueStage||F.workshops.length||F.workshopState!=='any'||F.ongoing.length
    ||F.ageMin!==''||F.ageMax!==''||F.bigLevel.length);}
function matchFilter(p){
  const F=S.filters, f=p.f;
  if(F.journey.length&&!F.journey.includes(f.journeyId)) return false;
  if(F.customer.length&&!F.customer.includes(f.customerStatus)) return false;
  if(F.finance.length&&!F.finance.includes(f.financeStatus)) return false;
  if(F.mode.length&&!F.mode.includes(p.mode)) return false;
  if(F.product&&!(p.ongoingProducts.includes(F.product)||(f.consumedProducts[F.product]||0)>0||(f.unconsumedProducts[F.product]||0)>0)) return false;
  if(F.ongoing.length&&!p.ongoingProducts.some(id=>F.ongoing.includes(id))) return false;
  if(F.events.length){
    const any=F.events.some(id=>p.attendedEvents.includes(id));
    if(F.eventsMode==='attended'?!any:any) return false;
  }
  if(F.queues.length&&!F.queues.includes(p.queue.name)) return false;
  if(F.queueStage&&p.queue.stage!==F.queueStage) return false;
  if(F.workshops.length&&!F.workshops.includes(p.workshop.name)) return false;
  if(F.workshopState!=='any'){const w=p.workshop;
    if(F.workshopState==='attended'&&!w.attendedSession) return false;
    if(F.workshopState==='missed'&&!w.missedLast) return false;
    if(F.workshopState==='none'&&w.status) return false;
    if(['enrollednotstarted','inprogress','completed'].includes(F.workshopState)&&w.status!==F.workshopState) return false;}
  if(F.ageMin!==''&&!(typeof f.age==='number'&&f.age>=+F.ageMin)) return false;
  if(F.ageMax!==''&&!(typeof f.age==='number'&&f.age<=+F.ageMax)) return false;
  if(F.bigLevel.length&&!F.bigLevel.includes(p.bigLevel)) return false;
  return true;
}
function refreshFilter(){S.fids=filtersOn()?new Set(P.filter(matchFilter).map(p=>p.pid)):null;}
const inFilter=pid=>!S.fids||S.fids.has(pid);
const curSet=()=>SETS.find(s=>s.id===S.setId);
const canEdit=()=>S.role==='admin';                       // master segments
const canEditTeam=()=>S.role==='admin'||S.role==='team';  // grouped segments
// Teams group MASTER segments. They never move participants and never create segments.
const TEAMS=[{id:'t1',name:'Content Team',groups:[
  {id:'G_ONBOARD',name:'New & onboarding',segmentIds:['YTO_NEW','YTO_UPDOWN','YTO_ADDON']},
  {id:'G_UP',name:'uP! journey',segmentIds:['UP_PRE','UP_1','UP_2','UP_3P','UP_IN_QUEUE']},
  {id:'G_REENGAGE',name:'Needs re-engagement',segmentIds:['ECO_NON_ACTIVE','DFU_NON_ACTIVE']},
  {id:'G_DFU',name:'DFU in progress',segmentIds:['ECO_LIVE_ARENA','ECO_DFU_QUEUE','ECO_DFU_APPT','DI_ONGOING','ARENA_LIVE']}]}];
const curTeam=()=>TEAMS.find(t=>t.id===S.teamId);
const groupPids=g=>{const mm=MEM.master,set=master,out=[];
  for(const p of P){const m=mm.get(p.pid); if(m.segmentId&&g.segmentIds.includes(m.segmentId)&&inFilter(p.pid)) out.push(p);} return out;};
const groupCount=(g,t)=>g.segmentIds.reduce((a,id)=>a+((filtersOn()?t.fby[id]:t.by[id])||0),0);
function teamTabs(){ return ''; }   // master segments tab only; teams are out of scope for now
const who=()=>S.role==='admin'?'You (Admin)':'You (AH Member)';
const segName=(set,id)=>!id||id==='__UNSEG__'?'Unsegmented':(set._by.get(id)?.name||id);
function tally(set){
  const t={by:{},fby:{},lost:{},warn:{},reasons:{},unseg:0,funseg:0,pinned:0,warns:0,dups:0,fdups:0,total:P.length,ftotal:0,max:1};
  for(const [pid,m] of MEM[set.id]){
    const inF=inFilter(pid); if(inF) t.ftotal++;
    for(const id of m.segs){ t.by[id]=(t.by[id]||0)+1; if(inF) t.fby[id]=(t.fby[id]||0)+1; }
    if(!m.segs.length){ t.unseg++; t.reasons[m.reason]=(t.reasons[m.reason]||0)+1; if(inF) t.funseg++; }
    if(m.segs.length>1){ t.dups++; if(inF) t.fdups++; }
  }
  t.max=Math.max(1,...Object.values(t.by));
  return t;
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),4200);}

// ---------- render: main ----------
function groupCard(team,g,t){
  const n=groupCount(g,t), edit=canEditTeam()&&!S.arranging, collapsed=S.collapsed.has(g.id);
  const view=S.cardView[g.id]||'people';
  const segs=g.segmentIds.map(id=>master._by.get(id)).filter(Boolean);
  let body;
  if(view==='rules'){
    body=`<div style="padding:4px 6px"><h4>Segments in this group</h4><ul class="rules">${segs.map(s=>`<li>${esc(s.name)} <span class="subtle small">${fmt(t.by[s.id]||0)} participants</span></li>`).join('')}</ul>
      <p class="subtle small">A participant is in this group when they are in one of these master segments. Membership follows the master segments and updates with them.</p></div>`;
  } else {
    const rows=groupPids(g).slice(0,25).map(p=>prow(master,p,MEM.master.get(p.pid),false));
    body=rows.length?rows.join('')+(n>rows.length?`<div class="card-empty">${plural(n-rows.length,'more participant')}</div>`:'')
      :`<div class="card-empty">${filtersOn()?'No one here matches the filters.':'No participants in these segments right now.'}</div>`;
  }
  const chips=[`<span class="chip">${plural(segs.length,'segment')}</span>`,
    ...segs.slice(0,2).map(s=>`<span class="chip">${esc(s.name)}</span>`),
    segs.length>2?`<span class="chip">+${segs.length-2} more</span>`:'',
    `<span class="dev-note">${g.id}</span>`].filter(Boolean);
  return `<article class="card ${n?'':'zero'} ${collapsed?'collapsed':''} ${S.cardSel.has(g.id)?'picked':''}" style="--icon:${colorFor(g.name)}" data-group-id="${g.id}">
    <div class="card-h" ${S.arranging?'':`tabindex="0" role="button" aria-label="Open ${esc(g.name)}"`}>
      ${S.arranging?'':`<input type="checkbox" class="cardsel" data-cardsel="${g.id}" ${S.cardSel.has(g.id)?'checked':''} aria-label="Select ${esc(g.name)} for an action">`}
      <div class="card-icon" aria-hidden="true">${esc(g.name.replace(/[^A-Za-z0-9]/g,'')[0]||'G')}</div>
      <div class="card-info"><div class="card-title">${esc(g.name)}</div><div class="card-sub">${esc(team.name)}</div>
        <button class="card-count" data-cardtab="${g.id}">${filtersOn()?`${fmt(n)} match`:plural(n,'participant')} · ${view==='people'?'segments':'list'}</button></div>
      <div class="card-acts">${edit?`<button class="icon-btn" data-act="edit-group" data-group="${g.id}" title="Edit group" aria-label="Edit ${esc(g.name)}">✎</button>`:''}
        <button class="icon-btn collapse-btn" data-collapse="${g.id}" aria-expanded="${!collapsed}" aria-label="${collapsed?'Expand':'Collapse'} ${esc(g.name)}">⌄</button></div>
    </div>
    <div class="card-chips">${chips.join('')}</div>
    <div class="card-body">${body}</div>
    <div class="card-f">
      <button class="btn" data-opengroup="${g.id}">View all</button>
      <details class="fdrop menu"><summary class="btn">Actions</summary><div class="fpanel menu-panel">
        <div class="subtle small" style="padding:2px 6px 6px">Applies to the ${fmt(n)} participants in this group</div>
        <button class="menu-item" data-act="comm" data-group="${g.id}">Send communication</button>
        <button class="menu-item" data-act="content" data-group="${g.id}">Recommend content</button>
        <button class="menu-item" data-act="appaction" data-group="${g.id}">Assign app action</button>
      </div></details>
    </div></article>`;
}
function renderTeamMain(){
  const team=curTeam(), t=tally(master), edit=canEditTeam();
  const covered=new Set(); for(const g of team.groups) for(const p of groupPids(g)) covered.add(p.pid);
  const pool=filtersOn()?t.ftotal:t.total;
  let h=`<div class="freeze">${teamTabs()}<header class="top">
    <div><div class="eyebrow">Team · grouped segments</div><h1>${esc(team.name)}</h1><p class="sub">Groups built from the master segments. This team can group segments and act on them, but cannot move participants or create segments.</p></div>
    <div class="controls">
      <label class="ctl" for="roleSel">Preview as <select id="roleSel"><option value="admin">Admin (can edit)</option><option value="team">Team member</option><option value="viewer">Other roles (view only)</option></select></label>
      <label class="ctl" for="devToggle"><input type="checkbox" id="devToggle" ${S.dev?'checked':''}> Developer notes</label>
    </div></header>
  <section class="stats" aria-label="Summary">
    <div class="stat"><b>${fmt(team.groups.length)}</b><span>Groups</span></div>
    <div class="stat"><b>${fmt(covered.size)}</b><span>Participants in a group</span></div>
    <button class="stat ${pool-covered.size?'':'ok'}" data-open="ungrouped"><b>${fmt(Math.max(0,pool-covered.size))}</b><span>Not in any group</span></button>
    ${filtersOn()?`<div class="stat"><b>${fmt(t.ftotal)}</b><span>Match the filters</span></div>`:''}
    <span class="dev-note">counts come from the master stats doc: a group's count is the sum of its segments</span>
  </section>
  <div class="toolbar">
    <div class="search"><input id="q" type="search" placeholder="Find a participant by name or ID" autocomplete="off" aria-label="Find a participant"><div id="qres" class="qres" hidden></div></div>
    <div class="spacer"></div>
    <button class="btn" data-act="collapse-all">${team.groups.length&&team.groups.every(g=>S.collapsed.has(g.id))?'Expand all':'Collapse all'}</button>
    <button class="btn" data-act="activity">Activity</button>
    <button class="btn" data-act="arrange" ${!edit||!sortableOk||S.arranging?'disabled':''}>Arrange</button>
    <button class="btn primary" data-act="new-group" ${!edit||S.arranging?'disabled':''}>New group</button>
  </div>`;
  h+=filterBar(t)+'</div><div class="board-scroll">';
  if(!edit) h+=`<div class="banner"><div><b>View only.</b> Team members and Admins can create groups here.</div></div>`;
  h+=`<div class="banner"><div><b>Grouped segments.</b> A group is a selection of master segments. Membership follows the master segments and updates with them, so nobody is moved between segments here.<span class="dev-note">group = { name, segmentIds[] }; members = segment_membership where segmentId in segmentIds</span></div></div>`;
  if(S.arranging) h+=`<div class="banner arrange"><div><b>Arrange groups</b><p>Drag a group by its card header. This only changes the layout for ${esc(team.name)}.</p></div>
    <div class="acts"><button class="btn" data-act="arr-cancel">Cancel</button><button class="btn primary" data-act="arr-save">Save arrangement</button></div></div>`;
  h+=!team.groups.length
    ? `<div class="empty"><h3>No groups yet</h3><p class="subtle">Build a group by choosing the master segments it covers.</p>${edit?'<button class="btn primary" data-act="new-group">Create the first group</button>':''}</div>`
    : `<div class="${S.arranging?'arranging':''}" id="groups"><section class="gsec" data-group="${esc(team.name)}"><div class="cards">${team.groups.map(g=>groupCard(team,g,t)).join('')}</div></section></div>`;
  $('#main').innerHTML=h+'</div>';
  $('#roleSel').value=S.role;
}
function renderMain(){
  if(S.loading||S.loadError){
    $('#main').innerHTML=`<div class="empty">${S.loading?'<h3>Loading segments…</h3><p class="subtle">Reading segmentboardconfig, participant metadata, segmentboardlist, journey and products.</p>'
      :`<h3>Couldn’t load the segments</h3><p class="subtle">${esc(S.loadError)}</p><button class="btn primary" data-act="reload">Try again</button>`}</div>`;
    return;
  }
  if(S.teamId) return renderTeamMain();
  const set=curSet(), t=tally(set), edit=canEdit(set), inSeg=t.total-t.unseg;
  const sub=set.type==='master'
    ?'Each segment’s list is built from its conditions when you refresh it, so a participant can be in more than one segment. These drive Breakthroughs app content, mode content and queue delivery.'
    :'This team’s own segments, separate from the master set. Every participant sits in exactly one of them.';
  const topReasons=Object.entries(t.reasons).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([r,n])=>`${fmt(n)} · ${REASONS[r].toLowerCase()}`).join('  ·  ');
  let h=`<div class="freeze">${teamTabs()}<header class="top">
    <div><div class="eyebrow">Master set · ${plural(set.segments.length,'segment')}</div><h1>${esc(set.name)}</h1><p class="sub">${sub}</p></div>
    <div class="controls">
      <label class="ctl" for="roleSel">Preview as <select id="roleSel"><option value="admin">Admin (can edit)</option><option value="team">Team member</option><option value="viewer">Other roles (view only)</option></select></label>
      <label class="ctl" for="devToggle"><input type="checkbox" id="devToggle" ${S.dev?'checked':''}> Developer notes</label>
    </div></header>
  <section class="stats" aria-label="Summary">
    <div class="stat" title="Documents in participant metadata"><b>${fmt(t.total)}</b><span>Participants</span></div>
    <div class="stat"><b>${fmt(inSeg)}</b><span>In a segment · ${pct(inSeg,t.total)}</span></div>
    <button class="stat ${t.unseg?'bad':''}" data-open="unseg"><b>${fmt(t.unseg)}</b><span>Not in a segment</span></button>
    <button class="stat ${t.dups?'warn':''}" data-open="dups"><b>${fmt(t.dups)}</b><span>In more than one segment</span></button>
    ${filtersOn()?`<div class="stat"><b>${fmt(t.ftotal)}</b><span>Match the filters</span></div>`:''}
    <span class="dev-note">participants = participant metadata docs · lists = segmentboardlist</span>
  </section>
  <div class="toolbar">
    <div class="search"><input id="q" type="search" placeholder="Find a participant by name or ID" autocomplete="off" aria-label="Find a participant"><div id="qres" class="qres" hidden></div></div>
    <div class="spacer"></div>
    <button class="btn" data-act="collapse-all">${set.segments.length&&set.segments.every(s=>S.collapsed.has(s.id))?'Expand all':'Collapse all'}</button>
    <button class="btn" data-act="activity">Activity</button>
    ${set.type==='master'?'<button class="btn" data-act="history">Change history</button>':''}
    <button class="btn" data-act="arrange" ${!edit||!sortableOk||S.arranging?'disabled':''} title="${sortableOk?'':'Drag-and-drop library did not load'}">Arrange</button>
    <button class="btn" data-act="refresh-all" ${!edit||S.arranging||S.refreshing||!set._auto.length?'disabled':''}>${S.refreshing&&S.refreshing.size>1?'Refreshing…':'Refresh all lists'}</button>
    <button class="btn primary" data-act="new-seg" ${!edit||S.arranging?'disabled':''}>New segment</button>
  </div>`;
  h+=filterBar(t)+'</div><div class="board-scroll">';
  if(!edit) h+=`<div class="banner"><div><b>View only.</b> Master segments can be changed by Admins. Everyone else can look, filter and export.</div></div>`;
  if(S.arranging) h+=`<div class="banner arrange"><div><b>Arrange segments</b><p>Drag a segment by its <b>card header</b> into the order you want. This changes the layout for everyone and never changes who is in which segment.</p><span class="dev-note">seg_saveDisplayOrder → segment_sets/${set.id}.displayOrder</span></div>
    <div class="acts"><button class="btn" data-act="arr-reset">Reset to default</button><button class="btn" data-act="arr-cancel">Cancel</button><button class="btn primary" data-act="arr-save">Save arrangement</button></div></div>`;
  h+=`<div class="attn">
    <button class="attn-tile ${t.unseg?'':'ok'}" data-open="unseg" data-drop="__UNSEG__"><b>${fmt(t.unseg)}</b><div><div class="t">Not in a segment</div><div class="d">${t.unseg?esc(topReasons):'Everyone is in a segment'}</div></div></button>
    <button class="attn-tile warn ${t.dups?'':'ok'}" data-open="dups"><b>${fmt(t.dups)}</b><div><div class="t">In more than one segment</div><div class="d">${t.dups?'Their data matches the conditions of two or more segments':'Nobody is in two segments'}</div></div></button>
  </div>`;
  if(!set.segments.length){
    h+=`<div class="empty"><h3>No segments yet</h3><p class="subtle">Everyone is Unsegmented until you add segments.</p>${edit?'<button class="btn primary" data-act="new-seg">Create the first segment</button>':''}</div>`;
  } else {
    const segs=set.displayOrder.map(id=>set._by.get(id)).filter(Boolean);
    h+=`<div class="${S.arranging?'arranging':''}" id="groups"><div class="cards">${segs.map(x=>segCard(set,x,t)).join('')}</div></div>`;
  }
  $('#main').innerHTML=h+'</div>';
  $('#roleSel').value=S.role;
}
function checkList(key,map){
  const picked=S.filters[key];
  return `<div class="ms-tools"><button type="button" data-fall="${key}:1">Select all</button><button type="button" data-fall="${key}:0">Clear</button>
      <span class="subtle small">${picked.length} of ${Object.keys(map).length}</span></div>
    <div class="checks">${Object.entries(map).map(([v,l])=>`<label><input type="checkbox" data-fk="${key}" value="${v}" ${picked.includes(v)?'checked':''}>${esc(l)}</label>`).join('')}</div>`;
}
function fdrop(key,label,on,panel){
  return `<details class="fdrop" data-on="${on?1:0}" data-drop="${key}"><summary>${esc(label)}</summary><div class="fpanel">${panel}</div></details>`;
}
function filterBar(t){
  const F=S.filters, sel=(a,all)=>a.length?`${a.length} selected`:all;
  const bar=[
    fdrop('journey',`Journey: ${sel(F.journey,'All')}`,F.journey.length,checkList('journey',VAL.journeyId)),
    fdrop('customer',`Customer status: ${sel(F.customer,'All')}`,F.customer.length,checkList('customer',VAL.customerStatus)),
    fdrop('finance',`Finance status: ${sel(F.finance,'All')}`,F.finance.length,checkList('finance',VAL.financeStatus)),
    fdrop('product',`Product + Mode${F.product?': '+PROD[F.product]:''}${F.mode.length?' · '+sel(F.mode,''):''}`,F.product||F.mode.length,
      `<label class="f" for="fProd">Product</label><select id="fProd" data-fk="product"><option value="">Any product</option>${PRODUCTS.map(p=>`<option value="${p.id}" ${p.id===F.product?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
       <label class="f">Participant mode</label>${checkList('mode',asMap(MODES))}
       <p class="subtle small" style="margin:8px 0 0">Combines a product with the participant's current mode, like the participants product screen.</p>`),
    fdrop('ongoing',`Ongoing product: ${sel(F.ongoing,'Any')}`,F.ongoing.length,
      checkList('ongoing',PROD)+`<p class="subtle small" style="margin:8px 0 0">Products that are ongoing or initiated right now.</p>`),
    fdrop('events',`Events: ${F.events.length?`${F.eventsMode==='attended'?'attended':'not attended'} · ${F.events.length}`:'Any'}`,F.events.length,
      `<label class="f" for="fEvMode">Attendance</label><select id="fEvMode" data-fk="eventsMode">${[['attended','Attended any of these'],['not','Did not attend any of these']].map(([v,l])=>`<option value="${v}" ${v===F.eventsMode?'selected':''}>${l}</option>`).join('')}</select>
       <label class="f">Events</label>${checkList('events',EVENT_NAME)}
       <p class="subtle small" style="margin:8px 0 0">Events come from the create events screen; only attendance counts.</p>`),
    fdrop('queues',`Queue: ${F.queues.length?sel(F.queues,''):'Any'}${F.queueStage?' · '+F.queueStage:''}`,F.queues.length||F.queueStage,
      `<label class="f">Queue</label>${checkList('queues',asMap(QUEUES))}
       <label class="f" for="fQS">Stage</label><select id="fQS" data-fk="queueStage"><option value="">Any stage</option>${QUEUE_STAGES.map(x=>`<option value="${x}" ${x===F.queueStage?'selected':''}>${x}</option>`).join('')}</select>
       <p class="subtle small" style="margin:8px 0 0">Queues come from the queue list screen; it reads live tokens.</p>`),
    fdrop('workshops',`Workshop: ${F.workshops.length?sel(F.workshops,''):'Any'}${F.workshopState!=='any'?' · '+Object.fromEntries(WORKSHOP_STATES)[F.workshopState]:''}`,F.workshops.length||F.workshopState!=='any',
      `<label class="f">Workshop</label>${checkList('workshops',asMap(WORKSHOPS))}
       <label class="f" for="fW">Status</label><select id="fW" data-fk="workshopState">${WORKSHOP_STATES.map(([v,l])=>`<option value="${v}" ${v===F.workshopState?'selected':''}>${l}</option>`).join('')}</select>
       <p class="subtle small" style="margin:8px 0 0">Workshops come from the EI Flix workshop screen.</p>`),
    fdrop('age',`Age: ${F.ageMin===''&&F.ageMax===''?'Any':`${F.ageMin===''?'0':F.ageMin}–${F.ageMax===''?'∞':F.ageMax}`}`,F.ageMin!==''||F.ageMax!=='',
      `<label class="f" for="fAgeMin">From</label><input id="fAgeMin" type="number" min="0" data-fk="ageMin" value="${F.ageMin}" placeholder="0">
       <label class="f" for="fAgeMax">To</label><input id="fAgeMax" type="number" min="0" data-fk="ageMax" value="${F.ageMax}" placeholder="99">`),
    fdrop('bigLevel',`B!G Level: ${sel(F.bigLevel,'Any')}`,F.bigLevel.length,
      checkList('bigLevel',asMap(BIG_LEVELS))+`<p class="subtle small" style="margin:8px 0 0">No participant carries a B!G level yet; this fills in once the levels are fed in.</p>`)
  ].join('');
  return `<section class="filters" aria-label="Filters"><span class="flabel">Filter</span>${bar}
    <span class="fsum">${filtersOn()?`<b>${fmt(t.ftotal)}</b> of ${fmt(t.total)} participants match <button class="btn ghost" data-act="clear-filters">Clear filters</button>`:`<span class="subtle">Filters narrow what you see and who an action applies to. They never change who is in which segment.</span>`}</span>
    <span class="dev-note">events / queues / workshops are read from their own screens by id</span></section>`;
}
const ICON_COLORS=['#4c769d','#6a4c9d','#1a7a6d','#9d6a4c','#4c9d68','#9d4c78','#3f5ea8','#7a6a1a'];
const colorFor=g=>ICON_COLORS[[...g].reduce((a,c)=>a+c.charCodeAt(0),0)%ICON_COLORS.length];
function prow(set,p,m,edit){
  return `<div class="prow" data-pid="${p.pid}" ${edit?'draggable="true"':''}><span class="pav">${esc(p.name[0])}</span>
    <span class="nm"><div>${esc(p.name)}${m.pinned?LOCK:''}</div><div class="subtle small">${p.pid} · ${esc(p.journey)}</div></span>
    ${m.warning?'<span class="chip warn">Not eligible</span>':''}</div>`;
}
function segCard(set,s,t){
  const n=t.by[s.id]||0, fn=filtersOn()?(t.fby[s.id]||0):n, lost=t.lost[s.id]||0, w=t.warn[s.id]||0, edit=canEdit(set)&&!S.arranging;
  const view=S.cardView[s.id]||'people', collapsed=S.collapsed.has(s.id), chips=[];
  chips.push(`<span class="chip ${s.mode}">${s.mode==='auto'?'Automated':'Manual'}</span>`);
  if(s.status==='inactive') chips.push('<span class="chip">Inactive</span>');
  if(s.mode==='auto'){const L=LISTS.get(s.id);
    chips.push(S.stale.has(s.id)?'<span class="chip warn" title="Conditions changed after the last refresh">Out of date: refresh</span>'
      :L?`<span class="chip" title="Last refreshed">Updated ${L.lastupdated?esc(TIME.format(L.lastupdated)):''}</span>`:'<span class="chip warn">List not refreshed</span>');}
  else{const L=LISTS.get(s.id); if(L?.lastupdated) chips.push(`<span class="chip" title="Last changed">Updated ${esc(TIME.format(L.lastupdated))}</span>`);}
  if(w) chips.push(`<span class="chip warn">${fmt(w)} not eligible</span>`);
  if(lost&&s.mode==='auto') chips.push(`<span class="chip" title="Match this segment’s conditions but are placed in a higher-ranked or manual segment">+${fmt(lost)} placed elsewhere</span>`);
  if(s.sourceSegmentId) chips.push('<span class="chip">From master</span>');
  if(s.contentRules&&s.contentRules.length) chips.push(`<span class="chip" title="${esc(s.contentRules.join(' · '))}">${plural(s.contentRules.length,'content rule')}</span>`);
  chips.push(`<span class="dev-note">${s.id}${s.mode==='auto'?' · sequence '+s.sequence:''}</span>`);
  let body;
  if(view==='rules') body=`<div style="padding:4px 6px">${conditionsHtml(set,s,true)}</div>`;
  else{
    const mm=MEM[set.id], rows=[];
    for(const p of P){const m=mm.get(p.pid); if(m.segs.includes(s.id)&&inFilter(p.pid)){rows.push(prow(set,p,m,edit&&MEMBERSHIP_EDIT)); if(rows.length>=25) break;}}
    body=rows.length?rows.join('')+(fn>rows.length?`<div class="card-empty">${plural(fn-rows.length,'more participant')}</div>`:'')
      :`<div class="card-empty">${s.mode==='auto'&&!LISTS.has(s.id)?'List not built yet. Use <b>Refresh list</b> to build it from the conditions.':filtersOn()?'No one here matches the filters.':s.mode==='manual'?'No one added yet. Use <b>Add</b> to pick participants.':'No participant matches these conditions right now.'}</div>`;
  }
  return `<article class="card ${n?'':'zero'} ${collapsed?'collapsed':''} ${S.cardSel.has(s.id)?'picked':''} ${s.status==='inactive'?'inactive':''}" style="--icon:${colorFor(s.id)}" data-seg="${s.id}" data-drop="${s.id}">
    <div class="card-h" ${S.arranging?'':`tabindex="0" role="button" aria-label="Open ${esc(s.name)}"`}>
      ${S.arranging?'<span class="handle c-handle" title="Drag segment"></span>':`<input type="checkbox" class="cardsel" data-cardsel="${s.id}" ${S.cardSel.has(s.id)?'checked':''} aria-label="Select ${esc(s.name)} for an action">`}
      <div class="card-icon" aria-hidden="true">${esc(s.name.replace(/[^A-Za-z0-9]/g,'')[0]||'S')}</div>
      <div class="card-info"><div class="card-title">${esc(s.name)}</div>
        <button class="card-count" data-cardtab="${s.id}">${filtersOn()?`${fmt(fn)} of ${fmt(n)} match`:plural(n,'participant')} · ${view==='people'?'conditions':'list'}</button></div>
      <div class="card-acts">${edit?`<button class="icon-btn" data-act="edit-seg" data-seg="${s.id}" title="Edit segment" aria-label="Edit ${esc(s.name)}">✎</button>`:''}
        <button class="icon-btn collapse-btn" data-collapse="${s.id}" aria-expanded="${!collapsed}" aria-label="${collapsed?'Expand':'Collapse'} ${esc(s.name)}" title="${collapsed?'Expand':'Collapse'}">⌄</button></div>
    </div>
    ${s.description?`<div class="card-desc" title="${esc(s.description)}">${esc(s.description)}</div>`:''}
    <div class="card-chips">${chips.join('')}</div>
    <div class="card-body">${body}</div>
    <div class="card-f">
      <button class="btn" data-openseg="${s.id}">View all</button>
      ${s.mode==='auto'?`<button class="btn" data-act="refresh-list" data-seg="${s.id}" ${!canEdit(set)||S.arranging||S.refreshing||s.status==='inactive'?'disabled':''} title="${s.status==='inactive'?'Inactive segments place no one':'Build this list from the conditions and store it'}">${S.refreshing?.has(s.id)?'Refreshing…':'Refresh list'}</button>`:''}
      ${s.mode==='manual'?`<button class="btn" data-act="add-people" data-seg="${s.id}" ${!edit||S.arranging||s.status==='inactive'?'disabled':''} title="${s.status==='inactive'?'Inactive segments place no one':'Pick participants to add to this segment'}">Add</button>`:''}
      <details class="fdrop menu"><summary class="btn">Actions</summary><div class="fpanel menu-panel">
        <div class="subtle small" style="padding:2px 6px 6px">Applies to ${filtersOn()?`the ${fmt(fn)} filtered participants`:plural(n,'participant')} in this segment</div>
        <button class="menu-item" data-act="comm" data-seg="${s.id}">Send communication</button>
        <button class="menu-item" data-act="content" data-seg="${s.id}">Recommend content</button>
        <button class="menu-item" data-act="appaction" data-seg="${s.id}">Assign app action</button>
      </div></details>
    </div></article>`;
}

// ---------- drawer ----------
function openDrawer(d){S.drawer=d;S.sel.clear();S.dq='';S.limit=150;renderDrawer(true);$('#drawer').classList.add('open');$('#app').classList.add('drawer-open');}
function closeDrawer(){S.drawer=null;S.sel.clear();$('#drawer').classList.remove('open');$('#app').classList.remove('drawer-open');}
function drawerRows(set,d){
  const mm=MEM[set.id], out=[];
  for(const p of P){const m=mm.get(p.pid);
    if(!inFilter(p.pid)) continue;
    if(d.kind==='seg'){ if(d.live?d.live.has(p.pid):m.segs.includes(d.id)) out.push([p,m]); }
    else if(d.kind==='dups'){ if(m.segs.length>1) out.push([p,m]); }
    else if(d.kind==='unseg'){ if(!m.segmentId&&(!d.reason||m.reason===d.reason)) out.push([p,m]); }
    else if(d.kind==='attention'){ if(m.warning) out.push([p,m]); }
  }
  let rows=out;
  if(S.dq){const q=S.dq.toLowerCase(); rows=rows.filter(([p])=>p.name.toLowerCase().includes(q)||p.pid.toLowerCase().includes(q));}
  if(d.hl) rows.sort((a,b)=>(b[0].pid===d.hl)-(a[0].pid===d.hl));
  return rows;
}
function statusCell(p){
  const f=p.f, bad=v=>['DISCONTINUED','LATE','BANNED'].includes(v);
  const c=f.customerStatus&&f.customerStatus!=='NO_STATUS'?`<span class="${bad(f.customerStatus)?'chip bad':''}">${VAL.customerStatus[f.customerStatus]}</span>`:'<span class="chip bad">No status</span>';
  const fi=f.financeStatus&&f.financeStatus!=='NO_STATUS'?`<span class="${bad(f.financeStatus)?'chip bad':''}">${VAL.financeStatus[f.financeStatus]}</span>`:'<span class="chip bad">No status</span>';
  const prod=f.ongoingProducts.length?`<div class="subtle small">Ongoing: ${esc(f.ongoingProducts.map(x=>PROD[x]||x).join(', '))}</div>`:'';
  return `${c} · ${fi}${prod}`;
}
// ---------- export: the rows shown in the side panel (search applied) as a CSV download ----------
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function exportList(){
  const set=curSet(), d=S.drawer; if(!d) return;
  const rows=drawerRows(set,d); if(!rows.length) return toast('Nothing to export.');
  const cp=countProducts(set,d), cnt=(p,k)=>cp[k]?sumConsumed(p.f,cp[k]):'';
  const seg=d.kind==='seg'?set._by.get(d.id):null, L=seg?LISTS.get(seg.id):null;
  const title=seg?seg.name:d.kind==='dups'?'In more than one segment':'Not in a segment';
  const extra=seg&&seg.mode==='auto'?['Saved list',(p)=>L?.ids.has(p.pid)?'In list':'Not saved yet']
    :d.kind==='dups'?['In segments',(p,m)=>m.segs.map(id=>segName(set,id)).join('; ')]
    :d.kind==='unseg'?['Why',(p,m)=>REASONS[m.reason]||'']:null;
  const head=['Profile ID','Name','Journey','Customer status','Finance status','Onboarding','uP! events','CPM events','Age',...(extra?[extra[0]]:[])];
  const lines=rows.map(([p,m])=>[p.pid,p.name,p.journey,VAL.customerStatus[p.f.customerStatus]||'',VAL.financeStatus[p.f.financeStatus]||'',
    VAL.onboardingStatus[p.f.onboardingStatus]||'',cnt(p,'upCount'),cnt(p,'cpmCount'),p.f.age??'',...(extra?[extra[1](p,m)]:[])]);
  downloadCsv(title,head,lines);
  toast(`Exported ${plural(rows.length,'participant')}.`);
}
function downloadCsv(title,head,lines){
  const cell=v=>{const t=String(v??''); return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const csv='\ufeff'+[head,...lines].map(r=>r.map(cell).join(',')).join('\r\n');   // BOM so Excel reads UTF-8 names
  const a=document.createElement('a'), url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.href=url; a.download=`${title.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'segment'}-${localDate()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// ---------- import & compare: an uploaded / pasted list vs the segment's View all list ----------
let CMP=null;
const normEmail=v=>String(v??'').trim().toLowerCase();
const normName=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const cmpKey=(by,v)=>by==='email'?normEmail(v):normName(v);
function openCompare(){
  const set=curSet(), d=S.drawer; if(!d||d.kind!=='seg') return;
  CMP={segId:d.id,by:'email',table:null,fileName:'',col:0,header:true,paste:'',result:null,tab:'matched',busy:false};
  renderCmp(); $('#cmpDlg').showModal();
}
function cmpDetect(){   // pick the column that looks like email / name; row 1 is a header if it has a label-like cell
  const T=CMP.table; if(!T||!T.length) return;
  const first=T[0], want=CMP.by==='email'?/e-?mail/i:/name/i;
  let col=first.findIndex(c=>want.test(c));
  CMP.header=first.some(c=>/e-?mail|name|profile|phone|id/i.test(c)&&!c.includes('@'));
  if(col<0&&CMP.by==='email'){ const probe=T.slice(0,20); const w=Math.max(...T.map(r=>r.length)); for(let i=0;i<w&&col<0;i++) if(probe.some(r=>String(r[i]||'').includes('@'))) col=i; }
  CMP.col=Math.max(0,col);
}
function cmpValues(){   // pasted lines win over the file; blanks dropped
  if(CMP.paste.trim()) return CMP.paste.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!CMP.table) return [];
  return CMP.table.slice(CMP.header?1:0).map(r=>String(r[CMP.col]??'').trim()).filter(Boolean);
}
function cmpCurrentRows(){   // the View all list, without the search box
  const set=curSet(), d=S.drawer, dq=S.dq; S.dq=''; const rows=drawerRows(set,d); S.dq=dq; return rows;
}
function runCompare(){
  const by=CMP.by, vals=cmpValues(), cur=cmpCurrentRows();
  const imported=new Map(); let dupImports=0;
  for(const v of vals){ const k=cmpKey(by,v); if(!k) continue; if(imported.has(k)) dupImports++; else imported.set(k,v); }
  const curKeys=new Set(), matched=[], onlyCurrent=[];
  for(const [p] of cur){ const k=cmpKey(by,by==='email'?p.email:p.name); if(k) curKeys.add(k); (k&&imported.has(k)?matched:onlyCurrent).push({p,value:k?imported.get(k)||'':''}); }
  const everyone=new Map(); for(const p of P){ const k=cmpKey(by,by==='email'?p.email:p.name); if(!k) continue; if(!everyone.has(k)) everyone.set(k,[]); everyone.get(k).push(p); }
  const onlyImported=[...imported].filter(([k])=>!curKeys.has(k)).map(([k,v])=>({value:v,found:everyone.get(k)||[]}));
  CMP.result={by,matched,onlyCurrent,onlyImported,imported:imported.size,dupImports,current:cur.length}; CMP.tab='matched';
}
const CMP_TABS=[['matched','Matched','In both lists'],['onlyCurrent','Only in current list','In View all, missing from the import'],['onlyImported','Only in imported list','In the import, not in View all']];
function cmpRowsFor(tab){
  const R=CMP.result, res=CMP_TABS.find(x=>x[0]===tab)[1];
  if(tab!=='onlyImported') return R[tab].map(({p,value})=>[res,value,p.pid,p.name,p.email,p.journey,VAL.customerStatus[p.f.customerStatus]||'','']);
  return R.onlyImported.map(({value,found})=>{const p=found[0];
    return [res,value,p?.pid||'',p?.name||'',p?.email||'',p?.journey||'',p?VAL.customerStatus[p.f.customerStatus]||'':'',
      found.length?`In participant metadata but not in this list${found.length>1?` (${found.length} people share this ${CMP.result.by})`:''}`:'Not found in participant metadata'];});
}
const CMP_HEAD=['Result','Imported value','Profile ID','Name','Email','Journey','Customer status','Note'];
function renderCmp(){
  const set=curSet(), s=set._by.get(CMP.segId), R=CMP.result;
  let body='', foot='';
  if(!R){
    const vals=cmpValues(), T=CMP.table, w=T?Math.max(0,...T.map(r=>r.length)):0;
    body=`<label class="f">Match by</label><div class="seg-toggle" role="radiogroup" aria-label="Match by">${[['email','Email'],['name','Name']].map(([v,l])=>`<label><input type="radio" name="cmpBy" value="${v}" ${CMP.by===v?'checked':''}>${l}</label>`).join('')}</div>
      <p class="subtle small" style="margin:6px 0 0">${CMP.by==='email'?'Emails are compared ignoring case and spaces.':'Names are compared ignoring case and extra spaces. People who share a name all count as a match.'}</p>
      <label class="f" for="cmpFile">Upload a list <span class="opt">CSV or Excel</span></label><input id="cmpFile" type="file" accept=".csv,.txt,.xlsx,.xls">
      ${T?`<div class="cmp-col"><label class="f" for="cmpCol">Column in ${esc(CMP.fileName)}</label><select id="cmpCol">${Array.from({length:w},(_,i)=>`<option value="${i}" ${i===CMP.col?'selected':''}>${esc(CMP.header&&T[0][i]?T[0][i]:'Column '+String.fromCharCode(65+i%26))}</option>`).join('')}</select>
        <label class="f" style="font-weight:400"><input type="checkbox" id="cmpHead" ${CMP.header?'checked':''}> First row is a header</label></div>`:''}
      <label class="f" for="cmpPaste">…or paste ${CMP.by==='email'?'emails':'names'}, one per line <span class="opt">used instead of the file</span></label>
      <textarea id="cmpPaste" rows="4" placeholder="${CMP.by==='email'?'someone@example.com':'Full name'}">${esc(CMP.paste)}</textarea>
      <div class="info" id="cmpInfo">${vals.length?`${plural(vals.length,'value')} to compare against the ${plural(cmpCurrentRows().length,'participant')} in View all.`:'Upload a file or paste a list to compare.'}</div>`;
    foot=`<span class="err" id="cmpErr"></span><button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="cmpGo" ${vals.length&&!CMP.busy?'':'disabled'}>Compare</button>`;
  } else {
    const n={matched:R.matched.length,onlyCurrent:R.onlyCurrent.length,onlyImported:R.onlyImported.length}, rows=cmpRowsFor(CMP.tab), shown=rows.slice(0,200);
    body=`<div class="cmp-tiles">${CMP_TABS.map(([k,l,sub])=>`<button class="cmp-tile ${k}" data-cmptab="${k}" aria-pressed="${CMP.tab===k}"><b>${fmt(n[k])}</b><span>${l}</span><small>${sub}</small></button>`).join('')}</div>
      <p class="subtle small" style="margin:8px 0">Matched by ${R.by} · ${plural(R.imported,'unique imported value')}${R.dupImports?` (${fmt(R.dupImports)} repeated ${R.dupImports===1?'value':'values'} ignored)`:''} · ${plural(R.current,'participant')} in View all.</p>
      ${rows.length?`<div class="tbl-wrap"><table class="pt"><thead><tr><th>${CMP.tab==='onlyImported'?'Imported value':'Participant'}</th><th>${CMP.tab==='onlyImported'?'Found in participant metadata':'Email'}</th><th>Journey</th></tr></thead><tbody>
        ${shown.map(r=>CMP.tab==='onlyImported'?`<tr><td>${esc(r[1])}</td><td>${r[2]?`${esc(r[3])} <span class="mono subtle small">${esc(r[2])}</span><div class="subtle small">${esc(r[7])}</div>`:'<span class="chip bad">Not found</span>'}</td><td>${esc(r[5])}</td></tr>`
          :`<tr><td><div class="pn">${esc(r[3])}</div><div class="pid mono">${esc(r[2])}</div></td><td>${esc(r[4])||'<span class="subtle">—</span>'}</td><td>${esc(r[5])}</td></tr>`).join('')}
      </tbody></table></div>${rows.length>shown.length?`<p class="subtle small">Showing 200 of ${fmt(rows.length)}. Export for the full list.</p>`:''}`:'<p class="subtle" style="padding:12px 0">Nobody in this group.</p>'}`;
    foot=`<button class="btn" data-act="cmp-back" style="margin-right:auto">← Compare another list</button><button class="btn" data-act="cmp-export" ${rows.length?'':'disabled'}>Export this group</button><button class="btn primary" data-act="cmp-export-all">Export all three</button>`;
  }
  $('#cmpDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="cmpTitle">Import &amp; compare</h2><p class="subtle">${esc(s.name)} · compare an outside list with who is in View all</p></div>
    <div class="dlg-b">${body}</div><div class="dlg-f">${foot}</div>`;
}
function cmpExport(all){
  const s=curSet()._by.get(CMP.segId), tabs=all?CMP_TABS.map(x=>x[0]):[CMP.tab];
  const lines=tabs.flatMap(cmpRowsFor);
  downloadCsv(`${s.name} compare ${all?'all':CMP_TABS.find(x=>x[0]===CMP.tab)[1]}`,CMP_HEAD,lines);
  toast(`Exported ${plural(lines.length,'row')}.`);
}
// uP! / CPM column: counted with the products picked in this segment's own uP! / CPM attended conditions
// (the operator configures those per condition); no such condition, or not a segment list → "—"
function countProducts(set,d){
  const s=d.kind==='seg'?set._by.get(d.id):null, out={upCount:null,cpmCount:null};
  if(!s||s.mode!=='auto') return out;
  const leaves=expand(s.rule); for(const n of (leaves.all||leaves.any||[])) if(n.products&&n.field in out) out[n.field]=n.products;
  return out;
}
function tableHtml(set,d,rows,extra){
  const cp=countProducts(set,d), cnt=(p,k)=>cp[k]?fmt(sumConsumed(p.f,cp[k])):'—';
  const edit=canEdit(set)&&!['group','ungrouped'].includes(d.kind), shown=rows.slice(0,S.limit);
  if(!rows.length) return `<p class="subtle" style="padding:16px 0">${S.dq?'No participants match your search.':'No participants here.'}</p>`;
  return `<div class="tbl-wrap"><table class="pt"><thead><tr>${edit?'<th class="c"><input type="checkbox" id="selAll" aria-label="Select all shown"></th>':''}<th>Participant</th><th>Journey</th><th>Customer · Finance</th><th class="num">uP! / CPM</th><th class="num">Age</th>${extra?`<th>${extra.h}</th>`:''}</tr></thead><tbody>
  ${shown.map(([p,m])=>`<tr data-pid="${p.pid}" ${edit&&MEMBERSHIP_EDIT?'draggable="true"':''} class="${S.sel.has(p.pid)?'sel':''} ${d.hl===p.pid?'hl':''}">
    ${edit?`<td class="c"><input type="checkbox" data-selpid="${p.pid}" ${S.sel.has(p.pid)?'checked':''} aria-label="Select ${esc(p.name)}"></td>`:''}
    <td><div class="pn">${esc(p.name)}${m.pinned?LOCK:''}</div><div class="pid mono">${p.pid}</div></td>
    <td>${esc(p.journey)}<div class="subtle small">${esc(p.mode)}${p.queue.inQueue?` · ${esc(p.queue.name)} #${p.queue.position}`:''}${p.workshop.name?` · ${esc(p.workshop.name)}`:''}${p.pending.length?` · ${plural(p.pending.length,'action')} pending`:''}</div>${p.f.onboardingStatus!=='ONBOARDED'?`<div class="subtle small">${VAL.onboardingStatus[p.f.onboardingStatus]}</div>`:''}</td>
    <td>${statusCell(p)}</td><td class="num" title="Counted from consumedproducts with the products picked in this segment's uP! / CPM conditions">${cnt(p,'upCount')} / ${cnt(p,'cpmCount')}</td><td class="num">${p.f.age??'<span class="chip bad">—</span>'}</td>
    ${extra?`<td>${extra.cell(p,m)}</td>`:''}</tr>`).join('')}
  </tbody></table></div>${rows.length>shown.length?`<button class="btn more" data-act="more">Show ${fmt(Math.min(150,rows.length-shown.length))} more of ${fmt(rows.length-shown.length)}</button>`:''}`;
}
function conditionsHtml(set,s,compact){
  const edit=canEdit(set);
  const js=jScope(s.journeys), jline=`<p class="seg-journey"><b>Journey:</b> ${esc(scopeText(js))}</p>`;
  if(s.mode==='manual'){
    const el=s.eligibility?expand(s.eligibility).all:[];
    return `<div class="info">Manual segment. People are placed here by hand and stay until someone moves them. Automatic updates never move them out.</div>
      ${jline}
      ${el.length||js.ids.length?`<h4>Shows a “No longer eligible” warning when any of these stops being true</h4><ul class="rules">${[...(js.ids.length?[`Journey is ${scopeText(js)}`]:[]),...el.map(describe)].map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="subtle small">No eligibility conditions, so no warnings are shown.</p>'}
      ${compact?'':`<pre class="dev-note block">${esc(JSON.stringify({journeys:js.ids,eligibility:s.eligibility||null},null,2))}</pre>`}`;
  }
  const ex=expand(s.rule), any=!!ex.any, items=ex.any||ex.all;
  return `${jline}${items.length?`<h4>Placed here when ${any?'<em>any</em>':'<em>all</em>'} of these are true</h4>
    <ul class="rules">${items.map(n=>`<li>${esc(describe(n))}</li>`).join('')}</ul>`:'<p class="subtle small">No other conditions: everyone in this journey is placed here.</p>'}
    <p class="subtle small">Segments are checked in sequence order${s.sequence?` (this one is ${s.sequence})`:''}. If someone also matches a segment earlier in the sequence, they go there instead.</p>
    ${!compact&&edit?`<button class="btn" data-act="edit-seg" data-seg="${s.id}">Edit segment</button>`:''}
    ${compact?'':`<pre class="dev-note block">${esc(JSON.stringify({journeys:js.ids,rule:s.rule},null,2))}</pre>`}`;
}
function historyHtml(set){
  return `<ul class="h-list">${AUDIT.map(a=>{
    let title,detail='';
    if(a.type==='MANUAL_MOVE'){const p=PI.get(a.pid);title='Participant moved';
      detail=`${esc(p.name)} <span class="mono subtle">${a.pid}</span> from <b>${esc(segName(set,a.from))}</b> to <b>${esc(segName(set,a.to))}</b>${a.landed!==a.to?`. The rules then placed them in <b>${esc(segName(set,a.landed))}</b>`:''}.`;}
    else if(a.type==='SEGMENT_CREATE'){title='Segment created';detail=esc(a.text);}
    else if(a.type==='RULE_CHANGE'){title='Segment changed';detail=esc(a.text);}
    else if(a.type==='SEGMENT_ARCHIVE'){title='Segment archived';detail=esc(a.text);}
    return `<li class="h-item"><div class="h-top"><b>${title}</b><time>${TIME.format(a.at)}</time></div><div>${detail}</div>${a.reason?`<div class="h-reason">${esc(a.reason)}</div>`:''}<div class="subtle small">by ${esc(a.by)}</div></li>`;
  }).join('')}</ul>`;
}
function renderDrawer(fresh){
  const set=curSet(), d=S.drawer, t=tally(set);
  const edit=canEdit(set)&&!['group','ungrouped'].includes(d.kind);
  const body=$('#drawer .d-body'), keep=!fresh&&body?body.scrollTop:0;
  let eyebrow='',title='',desc='',chips='',tabs='',tools='',content='';
  if(d.kind==='seg'){
    const s=set._by.get(d.id); eyebrow='Master segment'; title=s.name; desc=s.description||'';
    // automated: evaluate the conditions over every participant now, so View all never depends on the last refresh
    const auto=s.mode==='auto', L=LISTS.get(s.id);
    d.live=auto?new Set(P.filter(p=>matches(segRule(s),p.f)).map(p=>p.pid)):null;
    const n=auto?d.live.size:(t.by[s.id]||0);
    const saved=L?L.ids.size:0, inBoth=auto&&L?[...d.live].filter(id=>L.ids.has(id)).length:0;
    chips=`<span class="chip ${s.mode}">${auto?'Automated':'Manual'}</span><span class="chip">${plural(n,'participant')}${auto?' match now':''}</span>${s.sourceSegmentId?'<span class="chip">Copied from master</span>':''}`;
    const tb=[['people',`Participants · ${fmt(n)}`],['rules','Conditions']];
    tabs=`<div class="tabs" role="tablist">${tb.map(([k,l])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${d.tab===k}">${l}</button>`).join('')}</div>`;
    if(d.tab==='rules') content=conditionsHtml(set,s);
    else if(d.tab==='elsewhere'){ tools=`<p class="subtle small" style="margin:0">These participants match this segment’s conditions, but sit in a segment that ranks higher or were placed by hand.</p>`; content=tableHtml(set,d,drawerRows(set,d),{h:'Placed in',cell:(p,m)=>esc(segName(set,m.segmentId))}); }
    else if(auto){
      const sync=!L?'The list hasn’t been saved yet.':(saved===n&&inBoth===n)?`The saved list matches (updated ${L.lastupdated?esc(TIME.format(L.lastupdated)):'just now'}).`
        :`The saved list has ${fmt(saved)} (updated ${L.lastupdated?esc(TIME.format(L.lastupdated)):'—'}): ${fmt(n-inBoth)} new match${n-inBoth===1?'':'es'} not in it, ${fmt(saved-inBoth)} in it that no longer match.`;
      tools=`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><p class="subtle small" style="margin:0;flex:1;min-width:220px">Everyone who matches the conditions right now. ${sync}</p>
        ${canEdit(set)&&s.status!=='inactive'?`<button class="btn" data-act="refresh-list" data-seg="${s.id}" ${S.refreshing?'disabled':''}>${S.refreshing?.has(s.id)?'Saving…':'Save as list'}</button>`:''}</div>`;
      content=tableHtml(set,d,drawerRows(set,d),{h:'Saved list',cell:(p)=>L?.ids.has(p.pid)?'In list':'<span class="chip warn">Not saved yet</span>'});
    }
    else content=tableHtml(set,d,drawerRows(set,d));
  } else if(d.kind==='group'){
    const team=curTeam(), g=team.groups.find(x=>x.id===d.id), n=groupCount(g,t);
    eyebrow=team.name; title=g.name;
    chips=`<span class="chip">${plural(n,'participant')}</span><span class="chip">${plural(g.segmentIds.length,'segment')}</span>`;
    tabs=`<div class="tabs" role="tablist">${[['people',`Participants · ${fmt(n)}`],['rules','Segments']].map(([k,l])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${d.tab===k}">${l}</button>`).join('')}</div>`;
    if(d.tab==='rules'){
      content=`<h4>Master segments in this group</h4><ul class="rules">${g.segmentIds.map(id=>master._by.get(id)).filter(Boolean)
        .map(s=>`<li>${esc(s.name)} <span class="subtle small">${fmt(t.by[s.id]||0)} participants</span></li>`).join('')}</ul>
        <p class="subtle small">Membership follows the master segments. Nobody can be moved between segments from here, and the group has no segments of its own.</p>
        ${canEditTeam()?`<button class="btn" data-act="edit-group" data-group="${g.id}">Edit group</button>`:''}`;
    } else {
      const rows=groupPids(g).filter(p=>!S.dq||p.name.toLowerCase().includes(S.dq.toLowerCase())||p.pid.toLowerCase().includes(S.dq.toLowerCase()))
        .map(p=>[p,MEM.master.get(p.pid)]);
      content=tableHtml(master,d,rows,{h:'Master segment',cell:(p,m)=>esc(segName(master,m.segmentId))});
    }
  } else if(d.kind==='ungrouped'){
    const team=curTeam(), inAny=new Set(); for(const g of team.groups) for(const p of groupPids(g)) inAny.add(p.pid);
    eyebrow=team.name; title='Not in any group';
    chips='<span class="chip">Participants no group of this team covers</span>';
    tools='<p class="subtle small" style="margin:0">These participants are in a master segment (or Unsegmented) that none of this team’s groups includes. Add the segment to a group to cover them.</p>';
    const rows=P.filter(p=>!inAny.has(p.pid)&&inFilter(p.pid)&&(!S.dq||p.name.toLowerCase().includes(S.dq.toLowerCase())||p.pid.toLowerCase().includes(S.dq.toLowerCase())))
      .map(p=>[p,MEM.master.get(p.pid)]);
    content=tableHtml(master,d,rows,{h:'Master segment',cell:(p,m)=>m.segmentId?esc(segName(master,m.segmentId)):'<span class="chip bad">Unsegmented</span>'});
  } else if(d.kind==='unseg'){
    eyebrow=set.name; title='Not in a segment'; chips=`<span class="chip bad">${plural(t.unseg,'participant')}</span>`;
    tools=`<p class="subtle small" style="margin:0">No segment matched these participants. Each one shows why. Most reasons point to data to fix at the source.</p>
      <div class="rchips">${['',...Object.keys(t.reasons).sort((a,b)=>t.reasons[b]-t.reasons[a])].map(r=>`<button class="rchip" data-reason="${r}" aria-pressed="${(d.reason||'')===r}">${r?`${esc(REASONS[r])} · ${fmt(t.reasons[r])}`:`All · ${fmt(t.unseg)}`}</button>`).join('')}</div>`;
    content=tableHtml(set,d,drawerRows(set,d),{h:'Why',cell:(p,m)=>esc(REASONS[m.reason])});
  } else if(d.kind==='attention'){
    eyebrow=set.name; title='No longer eligible'; chips=`<span class="chip warn">${plural(t.warns,'participant')}</span>`;
    tools=`<p class="subtle small" style="margin:0">These participants were placed in a manual segment by hand. Their data has since changed, so they no longer meet its conditions. They stay put until someone moves them.</p>`;
    content=tableHtml(set,d,drawerRows(set,d),{h:'Placed in · no longer true',cell:(p,m)=>{const s=set._by.get(m.segmentId);const fail=expand(segElig(s)).all.filter(n=>!matches(n,p.f)).map(describe);return `<b>${esc(s.name)}</b><div class="subtle small">${esc(fail.join('; '))}</div>`;}});
  } else if(d.kind==='dups'){
    eyebrow=set.name; title='In more than one segment'; chips=`<span class="chip warn">${plural(t.dups,'participant')}</span>`;
    tools='<p class="subtle small" style="margin:0">Each segment list is built from its own conditions, so a participant can match more than one. The last column shows every segment they are in.</p>';
    content=tableHtml(set,d,drawerRows(set,d),{h:'In segments',cell:(p,m)=>m.segs.map(id=>`<div>${esc(segName(set,id))}</div>`).join('')});
  } else if(d.kind==='activity'){
    eyebrow=set.name; title='Activity'; chips='<span class="chip">Communications, content and app actions</span>';
    const rows=ACTIVITY.filter(a=>a.setId===(S.teamId?'team:'+S.teamId:set.id));
    content=rows.length?`<ul class="h-list">${rows.map(a=>`<li class="h-item"><div class="h-top"><b>${({comm:'Communication sent',content:'Content recommended',appaction:'App action assigned',group:'Group changed'})[a.kind]}</b><time>${TIME.format(a.at)}</time></div>
      <div>${esc(a.text)}${a.segId?` · <b>${esc(segName(set,a.segId))}</b>`:''}</div><div class="subtle small">by ${esc(a.by)}</div></li>`).join('')}</ul>`
      :'<p class="subtle" style="padding:16px 0">Nothing sent or assigned yet. Use <b>Actions</b> on a segment card, or select participants and use the actions bar.</p>';
    content+='<span class="dev-note block">reads the activity log for this set (one doc per send / recommendation / assignment)</span>';
  } else if(d.kind==='history'){
    eyebrow='Master set'; title='Change history'; chips='<span class="chip">Manual moves, new segments and condition changes</span>';
    content=historyHtml(set)+'<span class="dev-note block">reads segment_audit where setId == "master" orderBy at desc</span>';
  }
  const showSearch=!['history','activity'].includes(d.kind)&&!(d.kind==='seg'&&d.tab==='rules');
  const hint=edit&&showSearch&&MEMBERSHIP_EDIT?`<p class="subtle small" style="margin:0">Select participants and use <b>Move to…</b>, or drag rows onto a segment on the board.</p>`:'';
  $('#drawer').innerHTML=`<div class="d-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${desc?`<p class="d-desc">${esc(desc)}</p>`:''}<div class="chips">${chips}</div></div><button class="icon-btn" data-act="close" aria-label="Close">×</button></div>
    ${tabs}<div class="d-tools">${tools}${showSearch?`<div class="dq-row"><input id="dq" type="search" placeholder="Search in this list" value="${esc(S.dq)}" aria-label="Search in this list">${d.kind==='seg'?'<button class="btn" data-act="compare" title="Compare an uploaded or pasted list with this list">Import &amp; compare</button>':''}${['seg','dups','unseg'].includes(d.kind)?'<button class="btn" data-act="export-list" title="Download the rows shown as a CSV file">Export CSV</button>':''}</div>`:''}${hint}</div>
    <div class="d-body">${content}</div>
    ${edit&&showSearch&&d.kind==='seg'&&set._by.get(d.id)?.mode==='manual'?`<div class="bulk" id="bulk" ${S.sel.size?'':'hidden'}><b>${plural(S.sel.size,'participant')} selected</b><button class="btn" data-act="clear-sel">Clear</button><button class="btn primary" data-act="remove-from-seg" data-seg="${d.id}">Remove from segment</button></div>`:''}
    ${edit&&showSearch&&MEMBERSHIP_EDIT?`<div class="bulk" id="bulk" ${S.sel.size?'':'hidden'}><b>${plural(S.sel.size,'participant')} selected</b><button class="btn" data-act="clear-sel">Clear</button><button class="btn primary" data-act="move">Move to…</button><span class="dev-note">seg_moveParticipants</span></div>`:''}`;
  $('#drawer .d-body').scrollTop=keep;
}
function updateBulk(){
  const b=$('#bulk');
  if(b){b.hidden=!S.sel.size; b.querySelector('b').textContent=`${plural(S.sel.size,'participant')} selected`;}
  $$('#drawer tr[data-pid]').forEach(tr=>tr.classList.toggle('sel',S.sel.has(tr.dataset.pid)));
  $$('.prow[data-pid]').forEach(r=>r.classList.toggle('sel',S.sel.has(r.dataset.pid)));
  renderSelBar();
}
const ICON={
  whatsapp:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2Zm0 18.1a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.02.79.8-2.95-.19-.3A8.1 8.1 0 1 1 12 20.1Zm4.46-5.9c-.24-.12-1.44-.71-1.66-.79s-.39-.12-.55.12-.63.79-.77.95-.28.18-.52.06a6.63 6.63 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32a.45.45 0 0 0 0-.42c0-.12-.55-1.33-.75-1.81s-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.73 2.73 0 0 0-.85 2.03 4.75 4.75 0 0 0 1 2.52 10.85 10.85 0 0 0 4.15 3.66c1.54.6 2.15.65 2.92.54a2.49 2.49 0 0 0 1.64-1.16 2.03 2.03 0 0 0 .14-1.16c-.06-.1-.22-.16-.46-.28Z"/></svg>',
  email:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 8.13L4.47 7H19.5L12 13.13ZM4 8.9V17h16V8.9l-7.36 6a1 1 0 0 1-1.27 0L4 8.9Z"/></svg>',
  app:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7-6.3v-4.9a7 7 0 0 0-5.3-6.8V3a1.7 1.7 0 0 0-3.4 0v1a7 7 0 0 0-5.3 6.8v4.9L3 17.5v.9h18v-.9Z"/></svg>',
  content:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-6l-3 3-3-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm6 3.5v7l6-3.5-6-3.5Z"/></svg>',
  more:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/></svg>'
};
function actionsWidget(scopeAttr){
  return `<div class="actions-widget">
    <span class="aw-label">Send</span>
    <div class="commgrp">
      <button class="commbtn" data-act="comm" data-ch="WhatsApp" ${scopeAttr} title="WhatsApp">${ICON.whatsapp}<span>WhatsApp</span></button>
      <button class="commbtn" data-act="comm" data-ch="Email" ${scopeAttr} title="Email">${ICON.email}<span>Email</span></button>
      <button class="commbtn" data-act="comm" data-ch="App notification" ${scopeAttr} title="App notification">${ICON.app}<span>App</span></button>
    </div>
    <button class="btn primary" data-act="content" ${scopeAttr}>${ICON.content} Recommend content</button>
    <details class="fdrop"><summary class="btn icon-only" title="More actions" aria-label="More actions">${ICON.more}</summary>
      <div class="fpanel menu-panel up">
        <button class="menu-item" data-act="appaction" ${scopeAttr}>App action pending</button>
        <div class="subtle small" style="padding:6px 8px 2px">More actions can be added here later.</div>
      </div></details>
  </div>`;
}
function renderSelBar(){
  const bar=$('#selbar'), t=tally(master), team=S.teamId?curTeam():null;
  if(S.sel.size){
    bar.hidden=false;
    bar.innerHTML=`<b>${plural(S.sel.size,'participant')} selected</b>
      ${actionsWidget('')}
      <span class="bar-sep"></span>
      ${canEdit()&&!S.teamId&&MEMBERSHIP_EDIT?'<button class="btn small" data-act="move">Move…</button>':''}
      <button class="btn small ghost" data-act="clear-sel">Clear</button>`;
    return;
  }
  if(S.cardSel.size){
    const ids=[...S.cardSel];
    const n=team?ids.reduce((a,id)=>a+groupCount(team.groups.find(g=>g.id===id),t),0)
               :ids.reduce((a,id)=>a+((filtersOn()?t.fby[id]:t.by[id])||0),0);
    bar.hidden=false;
    bar.innerHTML=`<b>${plural(ids.length,team?'group':'segment')} selected · ${fmt(n)} participants</b>
      ${actionsWidget('data-multi="1"')}
      <span class="bar-sep"></span>
      <button class="btn small ghost" data-act="clear-cardsel">Clear</button>`;
    return;
  }
  bar.hidden=true;
}
function toggleSel(pid){S.sel.has(pid)?S.sel.delete(pid):S.sel.add(pid);
  $$(`[data-pid="${pid}"]`).forEach(el=>{el.classList.toggle('sel',S.sel.has(pid));const c=el.querySelector('input[data-selpid]');if(c)c.checked=S.sel.has(pid);});
  updateBulk();}
function toggleCardSel(id){S.cardSel.has(id)?S.cardSel.delete(id):S.cardSel.add(id);
  $$(`[data-cardsel="${id}"]`).forEach(b=>{b.checked=S.cardSel.has(id);b.closest('.card')?.classList.toggle('picked',S.cardSel.has(id));});
  renderSelBar();}

// ---------- move ----------
let MV=null;
function openMove(pids,pre){
  const set=curSet(); if(!canEdit(set)) return;
  MV={pids,target:pre||null};
  const mm=MEM[set.id], froms=[...new Set(pids.map(id=>mm.get(id).segmentId))];
  const opts=`<div class="tg">Re-check</div><label><input type="radio" name="tgt" value="__UNSEG__" ${pre==='__UNSEG__'?'checked':''}><span class="grow">Unsegmented: re-check against the rules</span></label>`+
    '<div class="tg">Segments</div>'+set.displayOrder.map(id=>set._by.get(id)).filter(Boolean).map(s=>`<label data-name="${esc(s.name.toLowerCase())}"><input type="radio" name="tgt" value="${s.id}" ${pre===s.id?'checked':''}><span class="grow">${esc(s.name)}</span><span class="chip ${s.mode}">${s.mode==='auto'?'Automated':'Manual'}</span></label>`).join('');
  $('#moveDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="moveTitle">Move ${plural(pids.length,'participant')}</h2><p class="subtle">From ${esc(froms.map(f=>segName(set,f)).slice(0,3).join(', '))}${froms.length>3?` and ${froms.length-3} more`:''}</p></div>
    <div class="dlg-b"><label class="f" for="tq">Move to</label><input id="tq" type="search" placeholder="Search segments" autocomplete="off">
      <div class="target-list" id="tlist">${opts}</div><div class="info" id="tinfo">Choose where to move them.</div>
      ${set.type==='master'?'<label class="f" for="mreason">Reason <span class="req">required for master segments</span></label><textarea id="mreason" rows="2" placeholder="e.g. Cleared IA assessment"></textarea>':''}
      <span class="dev-note block">seg_moveParticipants({ setId: "${set.id}", profileids, toSegmentId, reason })${set.type==='master'?' → also writes segment_audit':''}</span></div>
    <div class="dlg-f"><span class="err" id="mErr"></span><button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="mGo">Move</button></div>`;
  moveInfo(); $('#moveDlg').showModal();
  const c=$('#tlist input:checked'); if(c) c.closest('label').scrollIntoView({block:'nearest'});
}
function moveInfo(){
  const set=curSet(), el=$('#tinfo'); const t=MV.target;
  if(!t){el.className='info';el.textContent='Choose where to move them.';return;}
  const s=t==='__UNSEG__'?null:set._by.get(t);
  const allAuto=MV.pids.every(id=>!MEM[set.id].get(id).pinned);
  if(s&&s.mode==='manual'){el.className='info';el.innerHTML=`They’ll be <b>locked in ${esc(s.name)}</b>. Automatic updates won’t move them out. Only a person can.`;}
  else if(allAuto){el.className='info warn';el.innerHTML='These participants are already placed by the rules. Moving them to an automated segment re-checks them, so they’ll stay where the rules put them.';}
  else {el.className='info';el.innerHTML=`${s?`They’ll be released from their manual segment and <b>re-checked against the rules</b>. If they don’t meet the conditions for ${esc(s.name)}, they go to the segment they do match, or to Unsegmented.`:'They’ll be released and re-checked against the rules, landing in whichever segment they match, or Unsegmented.'}`;}
}
function doMove(){
  const set=curSet(), mm=MEM[set.id], target=MV.target;
  if(!target){$('#mErr').textContent='Choose a segment to move them to.';return;}
  const reasonEl=$('#mreason'), reason=reasonEl?reasonEl.value.trim():'';
  if(set.type==='master'&&!reason){$('#mErr').textContent='Add a reason. Master moves are recorded in the change history.';reasonEl.focus();return;}
  const tseg=target==='__UNSEG__'?null:set._by.get(target);
  const landed=applyMove(set,MV.pids,target,reason);
  $('#moveDlg').close(); S.sel.clear(); render();
  if(tseg&&tseg.mode==='manual') toast(`Moved ${plural(MV.pids.length,'participant')} to ${tseg.name}.`);
  else toast(`Re-checked ${plural(MV.pids.length,'participant')}: `+Object.entries(landed).map(([k,n])=>`${fmt(n)} → ${segName(set,k)}`).join(', '));
}

// ---------- new / edit segment ----------
let B=null;
const defaultRow=field=>{const f=FIELD[field];
  if(field==='onboardingStatus') return {field,op:'in',value:['ONBOARDED']};
  if(f.type==='number') return COUNT_DEFAULT[field]?{field,op:'gte',value:1,products:[...COUNT_DEFAULT[field]]}:{field,op:'gte',value:1};
  if(f.type==='products') return {field,op:'counts',value:{mode:'all',items:[{product:PRODUCTS[0]?.id||'',op:'gte',n:1}]}};
  if(f.type==='list') return {field,op:'notEmpty',value:null};
  return {field,op:f.type==='enum'?'in':'hasAny',value:[]};};
const optsFor=field=>{const f=FIELD[field];
  return /^product/.test(f.type)?PRODUCTS.map(p=>[p.id,p.name]):Object.entries(VAL[field]||{});};
function multiSel(r){
  const opts=optsFor(r.field), map=Object.fromEntries(opts), sel=Array.isArray(r.value)?r.value:[];
  const label=sel.length?sel.map(v=>map[v]||v).join(', '):'Choose…';
  return `<details class="fdrop ms"><summary class="ms-sum ${sel.length?'has':''}">${esc(label)}</summary><div class="fpanel">
    ${opts.length>8?'<input type="search" class="ms-q" placeholder="Search" aria-label="Search options">':''}
    <div class="ms-tools"><button type="button" data-msall="1">Select all</button><button type="button" data-msall="0">Clear</button>
      <span class="subtle small ms-count">${sel.length} of ${opts.length}</span></div>
    <div class="checks">${opts.map(([v,l])=>`<label data-name="${esc(String(l).toLowerCase())}"><input type="checkbox" data-k="v" value="${esc(v)}" ${sel.includes(v)?'checked':''}>${esc(l)}</label>`).join('')}</div></div></details>`;
}
function syncMsSummary(scope,r){
  const map=Object.fromEntries(optsFor(r.field)), sum=scope.querySelector('.ms-sum');
  if(sum){sum.textContent=r.value.length?r.value.map(v=>map[v]||v).join(', '):'Choose…'; sum.classList.toggle('has',!!r.value.length);}
  const c=scope.querySelector('.ms-count'); if(c) c.textContent=`${r.value.length} of ${Object.keys(map).length}`;
}
function countsHtml(r){
  const items=r.value.items||[];
  return `${items.length>1?`<div class="comb">Match <select data-k="cmode"><option value="all" ${r.value.mode==='all'?'selected':''}>all</option><option value="any" ${r.value.mode==='any'?'selected':''}>any</option></select> of these products:</div>`:''}
    ${items.map((it,k)=>`<div class="citem" data-ci="${k}">
      <select data-k="cprod" aria-label="Product">${PRODUCTS.map(p=>`<option value="${p.id}" ${p.id===it.product?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
      <select data-k="ccop" aria-label="Comparison">${Object.entries(CMP_WORDS).map(([v,l])=>`<option value="${v}" ${v===it.op?'selected':''}>${l}</option>`).join('')}</select>
      <input type="number" min="0" data-k="ccn" value="${it.n}" aria-label="Count">
      ${items.length>1?'<button type="button" class="icon-btn" data-b="rmi" aria-label="Remove product">×</button>':'<span></span>'}</div>`).join('')}
    <button type="button" class="btn ghost" data-b="addi">+ Add product</button>`;
}
const toRows=list=>list.map(n=>{const f=FIELD[n.field];
  if(COUNT_DEFAULT[n.field]) return {field:n.field,op:n.op,value:Array.isArray(n.value)?[...n.value]:n.value,products:[...(n.products||COUNT_DEFAULT[n.field])]};if(n.op==='eq'&&f&&f.type==='enum')return {field:n.field,op:'in',value:[n.value]};return {field:n.field,op:n.op,value:Array.isArray(n.value)?[...n.value]:n.value};});
function openSegDlg(mode,segId){
  const set=curSet();
  if(mode==='edit'){
    const s=set._by.get(segId||S.drawer.id), auto=s.mode==='auto', ex=auto?expand(s.rule):null, comb=ex&&ex.any?'any':'all';
    B={mode,id:s.id,name:s.name,description:s.description||'',scope:jScope([...(s.journeys||[])]),type:s.mode,comb,rows:auto?toRows(ex[comb]):[],sequence:s.sequence,status:s.status||'active',eligibility:s.eligibility||null};}
  else B={mode:'create',name:'',description:'',scope:{type:'journey',ids:[]},type:'auto',status:'active',comb:'all',rows:[],eligibility:null,
    order:[...seqSegs(set).map(x=>x.id),NEW_ID]};   // where the new segment is checked; it starts last
  renderSegDlg(); $('#segDlg').showModal();
}
function rowHtml(r,i){
  const f=FIELD[r.field], used=new Set(B.rows.map(x=>x.field));
  const avail=FIELDS.filter(x=>!SCOPE_FIELDS.includes(x.key)&&(x.key===r.field||!used.has(x.key)));
  const field=`<select data-k="field" aria-label="Field">${avail.map(x=>`<option value="${x.key}" ${x.key===r.field?'selected':''}>${x.label}</option>`).join('')}</select>`;
  const rm=`<button type="button" class="icon-btn" data-b="rm" aria-label="Remove condition">×</button>`;
  // onboarding: one choice, Onboarded or Yet to onboard (they can't both be true)
  if(r.field==='onboardingStatus'){const k=obKind(r.value);
    // an older rule on specific YTO statuses (e.g. only New) stays as it is, shown read-only
    if(!k) return `<div class="cond" data-i="${i}">${field}<span class="cond-is">${esc(describe(r))}</span>${rm}</div>`;
    return `<div class="cond" data-i="${i}">${field}<select data-k="ob" aria-label="Onboarding status">${[['ONBOARDED','Onboarded'],['YTO','Yet to onboard']].map(([v,l])=>`<option value="${v}" ${v===k?'selected':''}>${l}</option>`).join('')}</select>${rm}</div>`;}
  // older "no ongoing product" rules (isEmpty) stay as they are, shown read-only
  if(r.field==='ongoingProducts'&&!['hasAny','equals','isEmpty'].includes(r.op)) return `<div class="cond" data-i="${i}">${field}<span class="cond-is">${esc(describe(r))}</span>${rm}</div>`;
  // no operator to choose: the picker itself sits beside the field
  if(!OPS_FOR[f.type].length) return `<div class="cond" data-i="${i}">${field}${multiSel(r)}${rm}</div>`;
  // consumed / unconsumed: no operator dropdown, always a product count list
  if(f.type==='products'){
    // older rules written by the backend (isEmpty / notEmpty) stay as they are, shown read-only
    if(r.op!=='counts') return `<div class="cond" data-i="${i}">${field}<span class="cond-is">${esc(describe(r))}</span>${rm}</div>`;
    return `<div class="cond" data-i="${i}">${field}<span class="cond-is">product counts</span>${rm}<div class="cond-val">${countsHtml(r)}</div></div>`;
  }
  return `<div class="cond" data-i="${i}">${field}
    <select data-k="op" aria-label="Condition">${OPS_FOR[f.type].map(([k,l])=>`<option value="${k}" ${k===r.op?'selected':''}>${l}</option>`).join('')}</select>
    ${rm}<div class="cond-val">${valHtml(r,f)}</div></div>`;
}
function productsSel(r){   // multi-select of the products whose consumed count adds up to this number
  const sel=r.products||[], label=sel.length?sel.map(id=>PROD[id]||id).join(', '):'Choose products…';
  return `<div class="cond-prod"><span class="subtle small">Counting these products</span><details class="fdrop ms pms"><summary class="ms-sum ${sel.length?'has':''}">${esc(label)}</summary><div class="fpanel">
    <input type="search" class="ms-q" placeholder="Search" aria-label="Search products">
    <div class="ms-tools"><button type="button" data-psall="1">Select all</button><button type="button" data-psall="0">Clear</button>
      <span class="subtle small pms-count">${sel.length} of ${PRODUCTS.length}</span></div>
    <div class="checks">${PRODUCTS.map(p=>`<label data-name="${esc(p.name.toLowerCase())}"><input type="checkbox" data-k="pv" value="${p.id}" ${sel.includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div></details></div>`;
}
function syncPms(row,r){
  const sum=row.querySelector('.pms .ms-sum');
  sum.textContent=r.products.length?r.products.map(id=>PROD[id]||id).join(', '):'Choose products…'; sum.classList.toggle('has',!!r.products.length);
  row.querySelector('.pms-count').textContent=`${r.products.length} of ${PRODUCTS.length}`;
}
function valHtml(r,f){ return valHtmlBase(r,f)+(COUNT_DEFAULT[r.field]?productsSel(r):''); }
function valHtmlBase(r,f){
  if(r.op==='isEmpty'||r.op==='notEmpty') return '';
  if(r.op==='counts') return countsHtml(r);
  if(r.op==='in'||r.op==='hasAny'||r.op==='equals') return multiSel(r);
  if(r.op==='between') return `<div class="nums"><input type="number" min="0" data-k="n0" value="${r.value[0]}" aria-label="From"> and <input type="number" min="0" data-k="n1" value="${r.value[1]}" aria-label="To"></div>`;
  return `<input type="number" min="0" class="num-in" data-k="n" value="${r.value}" aria-label="Value">`;
}
function renderSegDlg(){
  const set=curSet(), h=[];
  h.push(`<div class="dlg-h"><h2>${B.mode==='edit'?'Edit segment':'New segment'}</h2><p class="subtle">${esc(set.name)}${B.mode==='edit'?' · '+(B.type==='auto'?'automated':'manual')+' segment':''}</p></div><div class="dlg-b">`);
  h.push(`<label class="f" for="sName">Segment name</label><input id="sName" type="text" value="${esc(B.name)}" placeholder="e.g. CPM – ready for Arena" autocomplete="off">`);
  h.push(`<label class="f" for="sDesc">Description <span class="opt">optional</span></label><textarea id="sDesc" rows="2" maxlength="${DESC_MAX}" placeholder="Who this segment is for and what it is used for">${esc(B.description)}</textarea><div class="char-count" id="sDescN">${B.description.length} / ${DESC_MAX}</div>`);
  if(B.mode==='create')
    h.push(`<label class="f">How participants get in</label><div class="radio-cards"><label><input type="radio" name="sType" value="auto" ${B.type==='auto'?'checked':''}> <b>Automated</b><span>Rules place people here and keep it up to date.</span></label><label><input type="radio" name="sType" value="manual" ${B.type==='manual'?'checked':''}> <b>Manual</b><span>People are placed here by hand and stay until moved.</span></label></div><p class="subtle small">You can’t change this after the segment is created.</p>`);
  h.push(`<label class="f">Status</label><div class="seg-toggle" role="radiogroup" aria-label="Status">${[['active','Active'],['inactive','Inactive']].map(([v,l])=>`<label><input type="radio" name="sStatus" value="${v}" ${B.status===v?'checked':''}>${l}</label>`).join('')}</div>
    <p class="subtle small" id="sStatusHint" style="margin:6px 0 0">${statusHint()}</p>`);
  h.push(`<label class="f">Journey</label>
    <div id="sScopeBox">${scopeHtml()}</div>`);
  if(B.type==='auto'){
    // no all/any choice: new segments always match ALL conditions; an existing ANY rule keeps its B.comb
    h.push(`<label class="f">Conditions</label>
      <div id="conds">${B.rows.map(rowHtml).join('')}</div><button type="button" class="btn ghost" data-b="add">+ Add condition</button>
      <div class="preview" id="sPrev" aria-live="polite"></div>`);
    if(B.mode==='create') h.push(`<label class="f">Sequence</label><p class="subtle small" style="margin:0">Segments are checked from top to bottom, and a participant goes into the first one they match. Drag the new segment, or use the arrows, to set where it is checked.</p><div id="seqBox"></div>`);
  } else h.push(`<div class="info">A manual segment starts empty. Move participants in from any segment, by drag and drop or with “Move to…”.${B.eligibility?' It keeps the copied eligibility conditions, so you’ll see a warning when someone no longer qualifies.':''}</div>`);
  h.push(`<details class="store" open><summary>Stored as <span>· segmentboardconfig/{id}</span></summary><pre id="sJson"></pre></details>`);
  h.push(`</div><div class="dlg-f"><span class="err" id="sErr"></span>${B.mode==='edit'?'<button class="btn" id="sArchive">Archive segment</button>':''}<button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="sGo">${B.mode==='edit'?'Save changes':'Create segment'}</button></div>`);
  $('#segDlg .dlg').innerHTML=h.join('');
  renderSeq(); updatePreview();
}
// ---------- sequence: order of automated segments (create only) ----------
const NEW_ID='__NEW__';
const seqSegs=set=>set.segments.filter(x=>x.mode==='auto').sort((a,b)=>a.sequence-b.sequence);
const statusHint=()=>B.status==='active'?'Active: the segment places participants and can be used for actions.':'Inactive: the segment is kept but places no one. Automated rules skip it.';
let seqSort=null;
function renderSeq(){
  const box=$('#seqBox'); if(seqSort){seqSort.destroy();seqSort=null;} if(!box) return;
  const set=curSet(), last=B.order.length-1;
  box.innerHTML=`<ol class="seq-list" id="seqList">${B.order.map((id,i)=>{
    if(id!==NEW_ID){const x=set._by.get(id); return `<li class="seq-item ${x.status==='inactive'?'off':''}" data-sid="${id}"><span class="seq-n">${i+1}</span><span class="grow">${esc(x.name)}${x.status==='inactive'?' · inactive':''}</span></li>`;}
    return `<li class="seq-item new" data-sid="${NEW_ID}"><span class="seq-n">${i+1}</span><span class="seq-handle" aria-hidden="true" title="Drag">⠿</span><span class="grow" id="seqNewName">${esc(B.name.trim()||'New segment')}</span>
      <button type="button" class="icon-btn" data-seqmv="-1" aria-label="Move up" ${i===0?'disabled':''}>↑</button><button type="button" class="icon-btn" data-seqmv="1" aria-label="Move down" ${i===last?'disabled':''}>↓</button></li>`;}).join('')}</ol>`;
  if(sortableOk) seqSort=new Sortable($('#seqList'),{handle:'.seq-handle',animation:150,onEnd:()=>{B.order=$$('#seqList .seq-item').map(li=>li.dataset.sid);renderSeq();renderStore();}});
  const n=$('#seqList .seq-item.new'); if(n) n.scrollIntoView({block:'nearest'});
}
const jHint=()=>{const t=SCOPE[B.scope.type];
  return B.scope.ids.length?`Only participants in ${scopeText(B.scope)} can be in this segment.`:`No ${t.label.toLowerCase()} picked: the segment applies to all ${t.plural}.`;};
function scopeHtml(){   // the journey dropdown
  const t=SCOPE[B.scope.type], opts=t.opts(), sel=B.scope.ids;
  return `<details class="fdrop ms"><summary class="ms-sum ${sel.length?'has':''}" id="sJSum" aria-label="${t.label}">${esc(scopeText(B.scope))}</summary><div class="fpanel">
      ${opts.length>8?`<input type="search" class="ms-q" placeholder="Search ${t.plural}" aria-label="Search ${t.plural}">`:''}
      <div class="ms-tools"><button type="button" data-jall="1">Select all</button><button type="button" data-jall="0">Clear</button><span class="subtle small" id="sJCount">${sel.length} of ${opts.length}</span></div>
      <div class="checks">${opts.map(([v,l])=>`<label data-name="${esc(l.toLowerCase())}"><input type="checkbox" data-jg="${esc(v)}" ${sel.includes(v)?'checked':''}>${esc(l)}</label>`).join('')}</div></div></details>
    <p class="subtle small" id="sJText" style="margin:6px 0 0">${jHint()}</p>`;
}
function syncJourney(){   // keep the scope dropdown summary, count and hint in step with B.scope
  const sum=$('#sJSum'); sum.textContent=scopeText(B.scope); sum.classList.toggle('has',!!B.scope.ids.length);
  $('#sJCount').textContent=`${B.scope.ids.length} of ${SCOPE[B.scope.type].opts().length}`;
  $('#sJText').textContent=jHint(); updatePreview();
}
function renderConds(){$('#conds').innerHTML=B.rows.map(rowHtml).join('');updatePreview();}
function buildRule(){return {[B.comb]:B.rows.map(r=>({field:r.field,op:r.op,value:r.value,...(r.products?{products:[...r.products]}:{})}))};}
function validRule(){
  if(!B.rows.length&&!B.scope.ids.length) return `Pick a ${SCOPE[B.scope.type].label.toLowerCase()} or add at least one condition.`;
  for(const r of B.rows){const f=FIELD[r.field];
    if(r.op==='counts'&&(!r.value.items.length||!r.value.items.every(i=>Number.isFinite(i.n)))) return `Enter a count for every product in “${f.label}”.`;
    if((r.op==='in'||r.op==='hasAny'||r.op==='equals')&&!r.value.length) return `Pick at least one value for “${f.label}”.`;
    if(COUNT_DEFAULT[r.field]&&!(r.products||[]).length) return `Pick at least one product for “${f.label}”.`;
    if(f.type==='number'&&(r.op==='between'?!r.value.every(Number.isFinite):!Number.isFinite(r.value))) return `Enter a number for “${f.label}”.`;}
  return true;
}
function newSequence(set){   // create: its position in the sequence list; edit: unchanged
  if(B.mode==='edit') return B.sequence;
  return B.order.indexOf(NEW_ID)+1;
}
function seqShifts(set){   // existing segments whose sequence changes when the new one is inserted
  return B.order.filter((id,i)=>id!==NEW_ID&&set._by.get(id).sequence!==i+1).length;
}
// no match preview: the box only shows what is still missing, and hides once the conditions are complete
function segIdFor(set,name){   // id from the name, made unique within the set
  let id=name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24)||'SEG'; while(set._by.has(id)||ARCHIVED_IDS.has(id)) id+='_2'; return id;
}
function buildDoc(){   // the Firestore document this dialog saves, exactly as shown in "Stored as"
  const set=curSet(), name=B.name.trim(), desc=B.description.trim(), edit=B.mode==='edit';
  const doc={id:edit?B.id:(name?segIdFor(set,name):'<from name>'), name};
  if(desc) doc.description=desc;
  doc.mode=B.type; doc.status=B.status;
  doc.journeys=[...B.scope.ids];
  // rule is stored as a plain list of conditions, all of which must be true (no "all" wrapper);
  // only an older ANY rule (the Do Not Use segments) keeps its { any: [...] } form
  if(B.type==='auto'){doc.sequence=newSequence(set); const r=buildRule(); doc.rule=r.all||r;}
  else doc.eligibility=B.eligibility||null;
  if(!edit) doc.displayIndex=set.displayOrder.length;   // new segments go at the end of the board
  Object.assign(doc,edit?{updatedAt:'<serverTimestamp>',updatedBy:'<your email>'}:{createdAt:'<serverTimestamp>',createdBy:'<your email>'});
  return doc;
}
function renderStore(){
  const el=$('#sJson'); if(!el) return;
  let txt=JSON.stringify(buildDoc(),null,2);
  if(B.mode==='create'&&B.type==='auto'){const k=seqShifts(curSet()); if(k) txt+=`\n\n// also updates ${k} segment${k===1?'':'s'} below it: sequence + 1`;}
  el.textContent=txt;
}
function updatePreview(){
  renderStore();
  const el=$('#sPrev'); if(!el) return;
  const v=validRule(); el.hidden=v===true; el.innerHTML=v===true?'':`<span class="subtle">${esc(v)}</span>`;
}
// build each segment's list from its conditions over every participant, then store it in segmentboardlist
async function refreshLists(ids){
  const segs=ids.map(id=>master._by.get(id)).filter(s=>s&&s.mode==='auto'&&s.status!=='inactive');
  if(!segs.length||S.refreshing) return;
  if(!P.length) return toast('No participants loaded.');
  S.refreshing=new Set(segs.map(s=>s.id)); render();
  const lists=segs.map(s=>{const rule=segRule(s); return {segmentid:s.id,segmentname:s.name,profilelist:P.filter(p=>matches(rule,p.f)).map(p=>p.pid)};});
  try{ await store.saveLists(lists); }
  catch(e){ S.refreshing=null; render(); return toast(`Couldn’t save to segmentboardlist: ${e?.message||e}`); }
  const now=new Date();
  for(const l of lists){ LISTS.set(l.segmentid,{ids:new Set(l.profilelist),lastupdated:now}); S.stale.delete(l.segmentid); }
  S.refreshing=null; computeSet(master); render();
  toast(lists.length===1?`${lists[0].segmentname}: ${plural(lists[0].profilelist.length,'participant')}.`:`Refreshed ${plural(lists.length,'segment list')}.`);
}
let saving=false;
async function saveSeg(){
  if(saving) return;
  const set=curSet(), err=m=>{$('#sErr').textContent=m;}, go=$('#sGo');
  if(B.type==='auto'){const v=validRule(); if(v!==true) return err(v);}
  const name=B.name.trim();
  if(name.length<3) return err('Give the segment a name of at least 3 characters.');
  if(set.segments.some(x=>x.id!==(B.mode==='edit'?B.id:null)&&x.name.toLowerCase()===name.toLowerCase())) return err('This set already has a segment with that name.');
  const doc=buildDoc(), isNew=B.mode!=='edit';
  let changes=[], sequenceUpdates=[];
  if(!isNew){
    const s=set._by.get(B.id);
    if((s.status||'active')!==B.status) changes.push(`status changed to ${B.status}`);
    if(name!==s.name) changes.push(`renamed from “${s.name}” to “${name}”`);
    const was=jScope(s.journeys); if(scopeKey(was)!==scopeKey(B.scope)) changes.push(`journey changed: ${scopeText(was)} → ${scopeText(B.scope)}`);
    const desc=B.description.trim(); if(desc!==(s.description||'')) changes.push(desc?'description updated':'description removed');
    if(B.type==='auto'){const before=describeRule(s.rule), after=describeRule(buildRule()); if(before!==after) changes.push(`conditions changed: ${before} → ${after}`);}
    if(!changes.length){$('#segDlg').close(); toast('No changes to save.'); return;}
  } else if(B.type==='auto'){
    // the automated segments are renumbered to match the order chosen in the dialog
    B.order.forEach((sid,i)=>{ if(sid!==NEW_ID&&set._by.get(sid).sequence!==i+1) sequenceUpdates.push({id:sid,sequence:i+1}); });
  }
  saving=true; err(''); if(go){go.disabled=true; go.textContent='Saving…';}
  try{ await store.saveSegment(doc,{isNew,sequenceUpdates}); }
  catch(e){ saving=false; if(go){go.disabled=false; go.textContent=isNew?'Create segment':'Save changes';} return err(`Couldn’t save to segmentboardconfig: ${e?.message||e}`); }
  saving=false;
  if(!isNew&&changes.some(c=>/^(conditions|journey|status)/.test(c))) S.stale.add(B.id);
  // written: apply the same doc to the board
  const seg=fromDoc(doc);
  if(isNew){
    set.segments.push(seg);
    for(const u of sequenceUpdates) set._by.get(u.id).sequence=u.sequence;
    set.displayOrder.push(seg.id); set.defaultDisplayOrder.push(seg.id);
  } else {
    const i=set.segments.findIndex(x=>x.id===seg.id), old=set.segments[i];
    set.segments[i]={...old,...seg};
    if(!doc.description) delete set.segments[i].description;
  }
  computeSet(set);
  AUDIT.unshift(isNew
    ?{at:Date.now(),by:who(),type:'SEGMENT_CREATE',text:`${name} (${seg.mode==='auto'?`automated, sequence ${seg.sequence}`:'manual'}${seg.status==='inactive'?', inactive':''}) created.`}
    :{at:Date.now(),by:who(),type:'RULE_CHANGE',text:`${name}: ${changes.join('; ')}`});
  $('#segDlg').close(); render();
  const n=tally(set).by[seg.id]||0;
  toast(isNew?(seg.mode==='auto'?`Created “${name}”. ${plural(n,'participant')} placed here.`:`Created “${name}”. Move participants in by hand.`)
    :`Saved. ${name} now has ${plural(n,'participant')}.`);
}
const describeRule=r=>{const ex=expand(r);return (ex.all||ex.any).map(describe).join(ex.any?' OR ':'; ');};
async function archiveSeg(){
  const set=curSet(), s=set._by.get(B.id), n=tally(set).by[s.id]||0;
  if(!confirm(`Archive “${s.name}”?\n\n${n?`${fmt(n)} participants will be re-checked against the remaining segments.`:'No participants are in it.'}\nArchived segments are kept, never deleted, so anything that points at this segment still resolves.`)) return;
  try{ await store.archiveSegment(s.id); }catch(e){ $('#sErr').textContent=`Couldn’t archive: ${e?.message||e}`; return; }
  ARCHIVED_IDS.add(s.id);
  set.segments=set.segments.filter(x=>x.id!==s.id);
  set.displayOrder=set.displayOrder.filter(i=>i!==s.id); set.defaultDisplayOrder=set.defaultDisplayOrder.filter(i=>i!==s.id);
  for(const m of MEM[set.id].values()) if(m.segmentId===s.id&&m.pinned) m.pinned=false;
  computeSet(set);
  if(set.type==='master') AUDIT.unshift({at:Date.now(),by:who(),type:'SEGMENT_ARCHIVE',text:`${s.name} archived. ${plural(n,'participant')} re-checked.`});
  $('#segDlg').close(); if(S.drawer&&S.drawer.id===s.id) closeDrawer(); render();
  toast(`Archived “${s.name}”. ${plural(n,'participant')} re-checked against the other segments.`);
}

// ---------- features: communication, content, app actions ----------
// content catalogues — three parallel lists on one recommendation, as the app stores them
const CONTENT={
  'EI Flix':{key:'eiflix',source:'series',items:['Emotional Agility (series)','Difficult Conversations (series)','Resilience Lab (series)']},
  'Solar Voice':{key:'solarvoice',source:'solar voice playlist',items:['Morning Charge','Deep Focus','Wind Down']},
  'General':{key:'generalcontent',source:'content_urls',items:['Breakthrough Basics: Week 1','Momentum Reset','Founder Mindset Series']}
};
const ACTION_TYPES={
  'Form':{field:'formspending',source:'delivery forms',items:['Onboarding form','Journey feedback form','Pre-event questionnaire','Consent & preferences']},
  'Quiz':{field:'quiz',source:'quiz',items:['Journey readiness quiz','Mode understanding check']},
  'VideoAsk':{field:'videoaskpending',source:'arenavideoask',items:['Arena reflection','Post-event reflection']},
  'Mandatory action':{field:'mandatoryaction',source:'fixed list',items:['Monthly Interim Report']}
};
const TEMPLATES={
  WhatsApp:{coll:'wati templates',items:['Event reminder','Queue update','Re-engagement nudge']},
  Email:{coll:'email templates (Postmark approved)',items:['Weekly digest','Event invitation','Payment reminder']},
  'App notification':{coll:'notification templates',items:['New content available','Action pending','Event starting soon']}
};
const ACTIVITY=[];
let ACT=null;
function actionTargets(scope){
  const mm=MEM.master, uniq=new Set();
  if(scope.groups){for(const id of scope.groups){const g=curTeam().groups.find(x=>x.id===id); if(g) groupPids(g).forEach(p=>uniq.add(p.pid));} return [...uniq];}
  if(scope.segs){for(const p of P){const m=mm.get(p.pid); if(m.segmentId&&scope.segs.includes(m.segmentId)&&inFilter(p.pid)) uniq.add(p.pid);} return [...uniq];}
  if(scope.group){const g=curTeam().groups.find(x=>x.id===scope.group); return groupPids(g).map(p=>p.pid);}
  if(scope.seg) return P.filter(p=>mm.get(p.pid).segmentId===scope.seg&&inFilter(p.pid)).map(p=>p.pid);
  return [...S.sel];
}
function scopeLabel(scope){
  const set=master, team=S.teamId?curTeam():null;
  if(scope.groups) return scope.groups.map(id=>team.groups.find(g=>g.id===id)?.name).filter(Boolean).join(', ');
  if(scope.segs) return scope.segs.map(id=>set._by.get(id)?.name).filter(Boolean).join(', ');
  if(scope.group) return team.groups.find(g=>g.id===scope.group).name;
  if(scope.seg) return set._by.get(scope.seg).name;
  return 'the selected participants';
}
function openAction(kind,scope,channel){
  const set=curSet(), teamScope=!!(scope.group||scope.groups||S.teamId);
  if(!(teamScope?canEditTeam():canEdit(set))) return;
  const pids=actionTargets(scope); if(!pids.length) return toast('No participants to act on.');
  ACT={kind,scope,pids};
  const multi=(scope.segs&&scope.segs.length>1)||(scope.groups&&scope.groups.length>1);
  const where=scopeLabel(scope)+(filtersOn()?' (filtered)':'');
  const head={comm:'Send communication',content:'Recommend content',appaction:'Assign app action'}[kind];
  let body='';
  if(kind==='comm'){
    body=`<label class="f">Channels</label><div class="checks">${Object.keys(TEMPLATES).map(c=>`<label><input type="checkbox" data-ch="${c}" ${(channel?c===channel:c==='App notification')?'checked':''}>${c}</label>`).join('')}</div>
      <label class="f" for="cTpl">Template</label><select id="cTpl">${Object.entries(TEMPLATES).flatMap(([g,v])=>v.items.map(x=>`<option>${esc(g)}: ${esc(x)}</option>`)).join('')}<option value="">Custom message…</option></select>
      <label class="f" for="cName">Broadcast name</label><input id="cName" type="text" placeholder="e.g. Sept queue update">
      <label class="f" for="cMsg">Message</label><textarea id="cMsg" rows="3" placeholder="Hi {{name}}, your next session is ready…"></textarea>
      <label class="f" for="cLand">App notification lands on</label><select id="cLand"><option>Home</option><option>My journey</option><option>Content library</option><option>Pending actions</option></select>
      <label class="f" for="cWhen">When</label><select id="cWhen"><option value="now">Send now</option><option value="later">Schedule</option></select>
      <div class="info">Goes to <b>${plural(pids.length,'participant')}</b> in ${esc(where)}. Only approved templates are listed, and anyone missing a number, email or device token is skipped and reported back.</div>
      <span class="dev-note block">Email: write \`email archive\` {profileid[], subject, body, templateid, broadcastname} → POST sendBatchEmail {archiveid}
WhatsApp: write \`wati archive\` {profileid[], templateid, watitemplateid, broadcastname} → POST sendwhatsappbroadcast {archiveid}
App: saveNotificationRecord → \`notificationrecord\` {title, subtitle, message, landingpage, sticky, notificationtype, profileid[]} → CF fans out to FCM</span>`;
  } else if(kind==='content'){
    body=`<label class="f" for="kTitle">Recommendation title</label><input id="kTitle" type="text" placeholder="e.g. Pre-Arena warm up">
      <label class="f" for="kType">Content type</label><select id="kType">${Object.keys(CONTENT).map(k=>`<option>${esc(k)}</option>`).join('')}</select>
      <label class="f" for="kItem">Content</label><select id="kItem">${CONTENT['EI Flix'].items.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
      <label class="f" for="kExp">Expires on</label><input id="kExp" type="text" placeholder="e.g. 31 Oct 2026">
      <label class="f">How it applies</label><div class="radio-cards"><label><input type="radio" name="kMode" value="once" checked> <b>One time</b><span>Recommend it to these participants now.</span></label>
        ${scope.seg&&!scope.group&&!scope.segs?`<label><input type="radio" name="kMode" value="standing"> <b>Standing rule</b><span>Everyone who enters this segment gets it, and it is removed when they leave.</span></label>`:''}</div>
      <div class="info">Applies to <b>${plural(pids.length,'participant')}</b> in ${esc(where)}. Participants whose tier doesn’t include the content are skipped.</div>
      <span class="dev-note block">one-time: write \`buffermix archive\` {profileid[], eiflix[], solarvoice[], generalcontent[], title, expiredate, recommendedby} → CF fans out to \`recommended mix playlist\`
standing rule: stored on the segment; the membership trigger writes/removes the recommendation as people enter and leave</span>`;
  } else {
    body=`<label class="f" for="aType">Action type</label><select id="aType">${Object.keys(ACTION_TYPES).map(k=>`<option>${esc(k)}</option>`).join('')}</select>
      <label class="f" for="aItem">Which one</label><select id="aItem">${ACTION_TYPES.Form.items.map(f=>`<option>${esc(f)}</option>`).join('')}</select>
      <label class="f" for="aDue">Due date</label><input id="aDue" type="text" placeholder="e.g. 30 Sep 2026">
      <label class="f"><input type="checkbox" id="aRemind" checked> Remind them in the app until it is done</label>
      <div class="info">Shows as pending for <b>${plural(pids.length,'participant')}</b> in ${esc(where)} until they complete it. It disappears on its own when they do.</div>
      <span class="dev-note block">merges into \`appactionpending/{profileid}\` — formspending[] / quiz[] / videoaskpending[] / mandatoryaction[]. Pending = the array is not empty; there is no status field.</span>`;
  }
  $('#actDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="actTitle">${head}</h2><p class="subtle">${esc(S.teamId?curTeam().name:set.name)} · ${multi?plural((scope.segs||scope.groups).length,S.teamId?'group':'segment')+': ':''}${esc(where)}</p></div>
    <div class="dlg-b">${body}</div>
    <div class="dlg-f"><span class="err" id="actErr"></span><button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="actGo">${kind==='comm'?'Send':kind==='content'?'Recommend':'Assign'}</button></div>`;
  $('#actDlg').showModal();
}
function doAction(){
  const set=curSet(), k=ACT.kind, n=ACT.pids.length; let text='';
  if(k==='comm'){
    const ch=$$('#actDlg input[data-ch]').filter(i=>i.checked).map(i=>i.dataset.ch);
    if(!ch.length){$('#actErr').textContent='Pick at least one channel.';return;}
    const msg=$('#cMsg').value.trim(), tpl=$('#cTpl').value;
    if(!msg&&!tpl){$('#actErr').textContent='Pick a template or write a message.';return;}
    text=`${ch.join(' + ')} to ${plural(n,'participant')}${tpl?` · ${tpl}`:''}${$('#cWhen').value==='later'?' · scheduled':''}`;
  } else if(k==='content'){
    const type=$('#kType').value, item=$('#kItem').value, standing=$('input[name=kMode]:checked')?.value==='standing';
    text=`${type}: ${item} → ${plural(n,'participant')}${standing?' · standing rule':''}`;
    if(standing&&ACT.scope.seg){const s=set._by.get(ACT.scope.seg);(s.contentRules=s.contentRules||[]).push(`${type}: ${item}`);}
  } else {
    const type=$('#aType').value, item=$('#aItem').value, a=`${type}: ${item}`;
    text=`${a} → ${plural(n,'participant')}`;
    for(const pid of ACT.pids){const p=PI.get(pid); if(!p.pending.includes(a)) p.pending.push(a);}
  }
  ACTIVITY.unshift({at:Date.now(),by:who(),setId:S.teamId?'team:'+S.teamId:set.id,kind:k,segId:ACT.scope.seg||null,count:n,text:text+` · ${scopeLabel(ACT.scope)}`});
  $('#actDlg').close(); render();
  toast({comm:'Sent',content:'Recommended',appaction:'Assigned'}[k]+`: ${text}`);
}

// ---------- add participants by hand ----------
let ADD=null;
// manual segments: participants are added by hand; the list is stored in segmentboardlist like any other
function openAdd(segId){
  const set=curSet(), s=set._by.get(segId); if(!canEdit(set)||!s||s.mode!=='manual') return;
  ADD={segId,sel:new Set(),q:''};
  $('#addDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="addTitle">Add participants to ${esc(s.name)}</h2><p class="subtle">They stay in this segment until someone removes them.</p></div>
    <div class="dlg-b"><label class="f" for="aq">Find participants</label><input id="aq" type="search" placeholder="Search by name or profile ID" autocomplete="off">
      <div class="target-list" id="alist"></div>
      <span class="dev-note block">segmentboardlist/${esc(segId)}.profilelist += picked profile ids</span></div>
    <div class="dlg-f"><span class="err" id="aErr"></span><button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="aGo">Add</button></div>`;
  renderAddList(); $('#addDlg').showModal(); $('#aq').focus();
}
function renderAddList(){
  const set=curSet(), q=ADD.q.trim().toLowerCase(), mm=MEM[set.id], here=LISTS.get(ADD.segId)?.ids;
  const hits=P.filter(p=>!here?.has(p.pid)&&(!q||p.name.toLowerCase().includes(q)||p.pid.toLowerCase().includes(q))).slice(0,60);
  $('#alist').innerHTML=hits.length?hits.map(p=>{const m=mm.get(p.pid);
    return `<label><input type="checkbox" data-addpid="${p.pid}" ${ADD.sel.has(p.pid)?'checked':''}><span class="grow">${esc(p.name)} <span class="mono subtle small">${p.pid}</span><div class="subtle small">${esc(p.journey)} · ${m.segs.length?'In '+esc(m.segs.map(id=>segName(set,id)).join(', ')):'Not in a segment'}</div></span></label>`;}).join('')
    :`<div class="subtle" style="padding:12px">${q?'No participant found.':'Everyone is already in this segment.'}</div>`;
  const go=$('#aGo'); go.textContent=ADD.sel.size?`Add ${plural(ADD.sel.size,'participant')}`:'Add'; go.disabled=!ADD.sel.size;
}
// write a manual segment's whole list, then show it
async function saveManualList(segId,ids,btn,errEl){
  const set=curSet(), s=set._by.get(segId), label=btn?.textContent;
  if(btn){btn.disabled=true; btn.textContent='Saving…';}
  try{ await store.saveLists([{segmentid:s.id,segmentname:s.name,profilelist:ids}]); }
  catch(e){ if(btn){btn.disabled=false; btn.textContent=label;} const m=`Couldn’t save to segmentboardlist: ${e?.message||e}`; if(errEl) errEl.textContent=m; else toast(m); return false; }
  LISTS.set(s.id,{ids:new Set(ids),lastupdated:new Date()}); computeSet(set); return true;
}
async function doAdd(){
  const s=curSet()._by.get(ADD.segId), before=[...(LISTS.get(s.id)?.ids||[])], added=[...ADD.sel].filter(id=>!before.includes(id));
  if(!(await saveManualList(s.id,[...before,...added],$('#aGo'),$('#aErr')))) return;
  AUDIT.unshift({at:Date.now(),by:who(),type:'RULE_CHANGE',text:`${s.name}: ${plural(added.length,'participant')} added by hand`});
  $('#addDlg').close(); render(); toast(`Added ${plural(added.length,'participant')} to ${s.name}.`);
}
async function removeFromSeg(segId){
  const s=curSet()._by.get(segId), gone=new Set(S.sel), keep=[...(LISTS.get(segId)?.ids||[])].filter(id=>!gone.has(id));
  if(!gone.size||!confirm(`Remove ${plural(gone.size,'participant')} from “${s.name}”?`)) return;
  if(!(await saveManualList(segId,keep,null,null))) return;
  AUDIT.unshift({at:Date.now(),by:who(),type:'RULE_CHANGE',text:`${s.name}: ${plural(gone.size,'participant')} removed by hand`});
  S.sel.clear(); render(); toast(`Removed ${plural(gone.size,'participant')} from ${s.name}.`);
}
function applyMove(set,pids,target,reason){
  const mm=MEM[set.id], tseg=target==='__UNSEG__'?null:set._by.get(target), landed={};
  for(const pid of pids){
    const p=PI.get(pid), m=mm.get(pid), from=m.segmentId;
    if(tseg&&tseg.mode==='manual'){m.pinned=true;m.segmentId=tseg.id;} else m.pinned=false;
    assign(set,p,m);
    const k=m.segmentId||'__UNSEG__'; landed[k]=(landed[k]||0)+1;
    if(set.type==='master') AUDIT.unshift({at:Date.now(),by:who(),type:'MANUAL_MOVE',pid,from,to:tseg?tseg.id:null,landed:m.segmentId,reason});
  }
  return landed;
}

// ---------- teams: grouped segments ----------
let GB=null;
function openGroupDlg(mode,groupId){
  const team=curTeam(); if(!canEditTeam()) return;
  const g=groupId?team.groups.find(x=>x.id===groupId):null;
  GB={mode,id:groupId||null,name:g?g.name:'',segmentIds:g?[...g.segmentIds]:[],q:''};
  renderGroupDlg(); $('#groupDlg').showModal(); if(mode==='create') $('#gName').focus();
}
function groupPreviewText(){
  const t=tally(master), total=GB.segmentIds.reduce((a,id)=>a+(t.by[id]||0),0);
  return `<b>${fmt(total)}</b> participants across ${plural(GB.segmentIds.length,'segment')}. Membership follows the master segments: nobody is moved, and the group updates when the segments do.`;
}
function updateGroupPreview(){const el=$('#gPrev'); if(el) el.innerHTML=groupPreviewText();}
function renderGroupDlg(){
  const t=tally(master), q=GB.q.trim().toLowerCase();
  const segs=master.displayOrder.map(id=>master._by.get(id)).filter(Boolean).filter(x=>!q||x.name.toLowerCase().includes(q));
  const list=segs.map(x=>`<label><input type="checkbox" data-gseg="${x.id}" ${GB.segmentIds.includes(x.id)?'checked':''}>
      <span class="grow">${esc(x.name)}<div class="subtle small">${plural(t.by[x.id]||0,'participant')}${x.mode==='manual'?' · manual segment':''}</div></span></label>`).join('');
  $('#groupDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="groupTitle">${GB.mode==='edit'?'Edit group':'New group'}</h2><p class="subtle">${esc(curTeam().name)} · a group is a selection of master segments</p></div>
    <div class="dlg-b">
      <label class="f" for="gName">Group name</label><input id="gName" type="text" value="${esc(GB.name)}" placeholder="e.g. Ready for Arena" autocomplete="off">
      <label class="f" for="gq">Segments in this group</label><input id="gq" type="search" placeholder="Search segments" value="${esc(GB.q)}" autocomplete="off">
      <div class="target-list">${list||'<div class="subtle" style="padding:12px">No segment matches your search.</div>'}</div>
      <div class="preview" id="gPrev">${groupPreviewText()}</div>
      <span class="dev-note block">segment_teams/${curTeam().id}/groups/{id} = { name, segmentIds[] } · members are read from segment_membership</span></div>
    <div class="dlg-f"><span class="err" id="gErr"></span>${GB.mode==='edit'?'<button class="btn" id="gDelete">Delete group</button>':''}
      <button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="gGo">${GB.mode==='edit'?'Save group':'Create group'}</button></div>`;
}
function saveGroup(){
  const team=curTeam(), name=GB.name.trim(), err=m=>{$('#gErr').textContent=m;};
  if(name.length<3) return err('Give the group a name of at least 3 characters.');
  if(team.groups.some(g=>g.id!==GB.id&&g.name.toLowerCase()===name.toLowerCase())) return err('This team already has a group with that name.');
  if(!GB.segmentIds.length) return err('Choose at least one segment.');
  if(GB.mode==='edit'){const g=team.groups.find(x=>x.id===GB.id); g.name=name; g.segmentIds=[...GB.segmentIds];}
  else {let id='G_'+name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,16); while(team.groups.some(g=>g.id===id)) id+='_2';
    team.groups.push({id,name,segmentIds:[...GB.segmentIds]});}
  ACTIVITY.unshift({at:Date.now(),by:who(),setId:'team:'+team.id,kind:'group',count:0,text:`${GB.mode==='edit'?'Updated':'Created'} group “${name}” (${plural(GB.segmentIds.length,'segment')})`});
  $('#groupDlg').close(); render(); toast(`${GB.mode==='edit'?'Saved':'Created'} “${name}”.`);
}
function deleteGroup(){
  const team=curTeam(), g=team.groups.find(x=>x.id===GB.id);
  if(!confirm(`Delete the group “${g.name}”?\n\nNo participant is affected: a group only points at master segments.`)) return;
  team.groups=team.groups.filter(x=>x.id!==g.id);
  ACTIVITY.unshift({at:Date.now(),by:who(),setId:'team:'+team.id,kind:'group',count:0,text:`Deleted group “${g.name}”`});
  $('#groupDlg').close(); if(S.drawer&&S.drawer.id===g.id) closeDrawer(); render(); toast(`Deleted “${g.name}”.`);
}
function openTeamDlg(){
  $('#teamDlg .dlg').innerHTML=`<div class="dlg-h"><h2 id="teamTitle">New team</h2><p class="subtle">A team groups the master segments for its own work. It cannot create segments or move participants.</p></div>
    <div class="dlg-b"><label class="f" for="tName">Team name</label><input id="tName" type="text" placeholder="e.g. Delivery Team" autocomplete="off">
      <div class="info">Team members can create groups, filter, and send communications, content and app actions. Only Admins change the master segments.</div>
      <span class="dev-note block">segment_teams/{id} = { name, access: { editRoles: ["admin","teammember"] } }</span></div>
    <div class="dlg-f"><span class="err" id="tErr"></span><button class="btn" data-dlg="cancel">Cancel</button><button class="btn primary" id="tGo">Create team</button></div>`;
  $('#teamDlg').showModal(); $('#tName').focus();
}
function createTeam(){
  const name=$('#tName').value.trim();
  if(name.length<3){$('#tErr').textContent='Give the team a name of at least 3 characters.';return;}
  if(TEAMS.some(t=>t.name.toLowerCase()===name.toLowerCase())){$('#tErr').textContent='A team with this name already exists.';return;}
  const id='t'+(TEAMS.length+1); TEAMS.push({id,name,groups:[]});
  S.teamId=id; closeDrawer(); $('#teamDlg').close(); render(); toast(`Created ${name}. Add its first group.`);
}

// ---------- arrange ----------
let sortables=[];
function enableSort(){
  const g=$('#groups'); if(!g||!sortableOk) return;
  $$('#groups .cards').forEach(l=>sortables.push(new Sortable(l,{handle:'.card-h',draggable:'.card',animation:150,fallbackOnBody:true})));
}
function stopSort(){sortables.forEach(s=>s.destroy());sortables=[];}
function readOrder(){return $$('#groups .card').map(x=>x.dataset.seg);}

// ---------- render all ----------
function render(){ stopSort(); renderMain(); if(S.drawer) renderDrawer(); if(S.arranging) enableSort(); }

// ---------- events ----------
listen(root,'click',e=>{
  const t=e.target;
  if(t.closest('dialog')){
    const dlg=t.closest('dialog');
    $$('dialog .fdrop[open]').forEach(d=>{if(!d.contains(t)) d.open=false;});
    if(t.closest('[data-dlg="cancel"]')){dlg.close();return;}
    if(dlg.id==='moveDlg'&&t.closest('#mGo')) doMove();
    if(dlg.id==='addDlg'&&t.closest('#aGo')) doAdd();
    if(dlg.id==='actDlg'&&t.closest('#actGo')) doAction();
    if(dlg.id==='groupDlg'&&t.closest('#gGo')) saveGroup();
    if(dlg.id==='groupDlg'&&t.closest('#gDelete')) deleteGroup();
    if(dlg.id==='teamDlg'&&t.closest('#tGo')) createTeam();
    if(dlg.id==='cmpDlg'&&CMP){
      if(t.closest('#cmpGo')){ runCompare(); renderCmp(); }
      else if(t.closest('[data-cmptab]')){ CMP.tab=t.closest('[data-cmptab]').dataset.cmptab; renderCmp(); }
      else if(t.closest('[data-act="cmp-back"]')){ CMP.result=null; renderCmp(); }
      else if(t.closest('[data-act="cmp-export"]')) cmpExport(false);
      else if(t.closest('[data-act="cmp-export-all"]')) cmpExport(true);
      return;
    }
    if(dlg.id==='segDlg'&&t.closest('#sArchive')) archiveSeg();
    if(dlg.id==='segDlg'){
      const mv=t.closest('[data-seqmv]');
      if(mv){const i=B.order.indexOf(NEW_ID), j=i+(+mv.dataset.seqmv);
        if(j>=0&&j<B.order.length){[B.order[i],B.order[j]]=[B.order[j],B.order[i]]; renderSeq(); renderStore(); $('#seqList .seq-item.new [data-seqmv="'+mv.dataset.seqmv+'"]')?.focus();}
        return;}
      const ps=t.closest('[data-psall]');
      if(ps){const row=ps.closest('.cond'), r=B.rows[+row.dataset.i], on=ps.dataset.psall==='1', picked=new Set(r.products||[]);
        $$('input[data-k="pv"]',ps.closest('.fpanel')).filter(x=>!x.closest('label').hidden).forEach(x=>{x.checked=on; on?picked.add(x.value):picked.delete(x.value);});
        r.products=PRODUCTS.map(p=>p.id).filter(id=>picked.has(id)); syncPms(row,r); updatePreview(); return;}
      const ja=t.closest('[data-jall]');
      if(ja){const on=ja.dataset.jall==='1', picked=new Set(B.scope.ids);
        $$('#segDlg input[data-jg]').filter(i=>!i.closest('label').hidden).forEach(i=>{i.checked=on; on?picked.add(i.dataset.jg):picked.delete(i.dataset.jg);});
        B.scope.ids=SCOPE[B.scope.type].opts().map(o=>o[0]).filter(v=>picked.has(v)); syncJourney(); return;}
      const b=t.closest('[data-b]'), ms=t.closest('[data-msall]');
      if(ms){
        const row=ms.closest('.cond'), r=B.rows[+row.dataset.i], panel=ms.closest('.fpanel');
        const boxes=$$('input[data-k="v"]',panel).filter(x=>!x.closest('label').hidden);
        const on=ms.dataset.msall==='1', picked=new Set(r.value||[]);
        boxes.forEach(x=>{x.checked=on; on?picked.add(x.value):picked.delete(x.value);});
        r.value=[...picked]; syncMsSummary(row,r); updatePreview(); return;
      }
      if(b&&b.dataset.b==='add'){const used=new Set(B.rows.map(r=>r.field));const next=FIELDS.find(f=>!SCOPE_FIELDS.includes(f.key)&&!used.has(f.key));
        if(!next) toast('Every condition is already used once.'); else {B.rows.push(defaultRow(next.key));renderConds();}}
      if(b&&b.dataset.b==='rm'){B.rows.splice(+b.closest('.cond').dataset.i,1);renderConds();}
      if(b&&b.dataset.b==='addi'){const r=B.rows[+b.closest('.cond').dataset.i];
        const used=new Set(r.value.items.map(x=>x.product));const nextP=(PRODUCTS.find(p=>!used.has(p.id))||PRODUCTS[0])?.id||'';
        r.value.items.push({product:nextP,op:'gte',n:1});renderConds();}
      if(b&&b.dataset.b==='rmi'){const r=B.rows[+b.closest('.cond').dataset.i];
        r.value.items.splice(+b.closest('[data-ci]').dataset.ci,1);renderConds();}
      if(t.closest('#sGo')) saveSeg();
    }
    return;
  }
  const qb=t.closest('[data-qpid]'); if(qb){const set=curSet(),m=MEM[set.id].get(qb.dataset.qpid);$('#qres').hidden=true;
    openDrawer(m.segmentId?{kind:'seg',id:m.segmentId,tab:'people',hl:qb.dataset.qpid}:{kind:'unseg',reason:null,hl:qb.dataset.qpid});return;}
  const tt=t.closest('[data-team]'); if(tt){if(S.arranging) return toast('Save or cancel the arrangement first.');S.teamId=tt.dataset.team||null;S.sel.clear();closeDrawer();render();return;}
  const setBtn=t.closest('[data-set]'); if(setBtn){if(S.arranging) return toast('Save or cancel the arrangement first.'); S.setId=setBtn.dataset.set;closeDrawer();render();return;}
  const tab=t.closest('[data-tab]'); if(tab){S.drawer.tab=tab.dataset.tab;S.sel.clear();S.dq='';S.limit=150;renderDrawer(true);return;}
  const rc=t.closest('[data-reason]'); if(rc){S.drawer.reason=rc.dataset.reason||null;S.sel.clear();S.limit=150;renderDrawer(true);return;}
  const op=t.closest('[data-open]'); if(op&&!S.arranging){const k=op.dataset.open;openDrawer(k==='unseg'?{kind:'unseg',reason:null}:k==='dups'?{kind:'dups'}:k==='ungrouped'?{kind:'ungrouped'}:{kind:'attention'});return;}
  const a=t.closest('[data-act]');
  if(a&&!a.disabled){
    const act=a.dataset.act, set=curSet();
    if(act==='close') closeDrawer();
    else if(act==='reload') load();
    else if(act==='export-list') exportList();
    else if(act==='compare') openCompare();
    else if(act==='refresh-list') refreshLists([a.dataset.seg]);
    else if(act==='refresh-all') refreshLists(set._auto.map(x=>x.id));
    else if(act==='more'){S.limit+=150;renderDrawer();}
    else if(act==='clear-sel'){S.sel.clear();$$('input[data-selpid]').forEach(i=>i.checked=false);updateBulk();}
    else if(act==='clear-cardsel'){S.cardSel.clear();render();renderSelBar();}
    else if(act==='move') openMove([...S.sel]);
    else if(act==='history') openDrawer({kind:'history'});
    else if(act==='new-seg') openSegDlg('create');
    else if(act==='edit-seg') openSegDlg('edit',a.dataset.seg);
    else if(act==='add-people') openAdd(a.dataset.seg);
    else if(act==='remove-from-seg') removeFromSeg(a.dataset.seg);
    else if(['comm','content','appaction'].includes(act)){$$('.fdrop[open]').forEach(d=>d.open=false);
      const scope=a.dataset.multi?(S.teamId?{groups:[...S.cardSel]}:{segs:[...S.cardSel]}):{seg:a.dataset.seg||null,group:a.dataset.group||null};
      openAction(act,scope,a.dataset.ch||null);}
    else if(act==='activity') openDrawer({kind:'activity'});
    else if(act==='new-group') openGroupDlg('create');
    else if(act==='edit-group') openGroupDlg('edit',a.dataset.group);
    else if(act==='new-team'){if(S.arranging) return toast('Save or cancel the arrangement first.');openTeamDlg();}
    else if(act==='clear-filters'){S.filters=emptyFilters();refreshFilter();render();}
    else if(act==='collapse-all'){const items=S.teamId?curTeam().groups:set.segments; const all=items.every(x=>S.collapsed.has(x.id));
      items.forEach(x=>all?S.collapsed.delete(x.id):S.collapsed.add(x.id)); render();}
    else if(act==='arrange'){closeDrawer();S.arranging=true;S.prevCollapsed=new Set(S.collapsed);(S.teamId?curTeam().groups:set.segments).forEach(x=>S.collapsed.add(x.id));render();
      toast('Cards are collapsed so they are easy to drag. Drag a card by its header, a group by its title.');}
    else if(act==='arr-cancel'){S.arranging=false;if(S.prevCollapsed){S.collapsed=S.prevCollapsed;S.prevCollapsed=null;}render();}
    else if(act==='arr-reset'){set.displayOrder=clone(set.defaultDisplayOrder);render();toast('Back to the default layout. Save to keep it.');}
    else if(act==='arr-save'){if(S.teamId){const ids=$('#groups .card').map(c=>c.dataset.groupId);const team=curTeam();team.groups.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));}else{const ids=readOrder(); store.saveDisplayOrder(ids).then(()=>{set.displayOrder=ids;S.arranging=false;if(S.prevCollapsed){S.collapsed=S.prevCollapsed;S.prevCollapsed=null;}render();toast(`Arrangement saved for everyone in ${set.name}.`);}).catch(e=>toast(`Couldn’t save the arrangement: ${e?.message||e}`)); return;}S.arranging=false;if(S.prevCollapsed){S.collapsed=S.prevCollapsed;S.prevCollapsed=null;}render();}
    return;
  }
  const fa=t.closest('[data-fall]');
  if(fa){const [key,on]=fa.dataset.fall.split(':');
    S.filters[key]= on==='1' ? Object.keys(OPTS[key]()) : [];
    refreshFilter(); render(); const d=$(`.fdrop[data-drop="${key}"]`); if(d) d.open=true; return;}
  const ct=t.closest('[data-cardtab]'); if(ct){const id=ct.dataset.cardtab;S.cardView[id]=(S.cardView[id]||'people')==='people'?'rules':'people';renderMain();updateBulk();return;}
  const cs=t.closest('[data-cardsel]'); if(cs){toggleCardSel(cs.dataset.cardsel);return;}
  const cb=t.closest('[data-collapse]'); if(cb){const id=cb.dataset.collapse;S.collapsed.has(id)?S.collapsed.delete(id):S.collapsed.add(id);render();updateBulk();return;}
  const og=t.closest('[data-opengroup]'); if(og){openDrawer({kind:'group',id:og.dataset.opengroup,tab:'people'});return;}
  const os=t.closest('[data-openseg]'); if(os){openDrawer({kind:'seg',id:os.dataset.openseg,tab:'people'});return;}
  const row=t.closest('[data-pid]');
  if(row&&canEdit(curSet())&&!S.arranging&&!t.closest('input')){toggleSel(row.dataset.pid);return;}
  const gcard=t.closest('[data-group-id]');
  if(gcard&&!S.arranging&&t.closest('.card-h')){openDrawer({kind:'group',id:gcard.dataset.groupId,tab:'people'});return;}
  const card=t.closest('.card');
  if(card&&!S.arranging&&t.closest('.card-h')){
    openDrawer({kind:'seg',id:card.dataset.seg,tab:'people'});return;
  }
  if(!t.closest('.search')) {const r=$('#qres'); if(r) r.hidden=true;}
  $$('.fdrop[open]').forEach(d=>{if(!d.contains(t)) d.open=false;});
  // click anywhere outside the side panel closes it
  if(S.drawer&&!t.closest('#drawer')&&!t.closest('dialog')&&!t.closest('#selbar')) closeDrawer();
});
listen(document,'keydown',e=>{
  if(e.key==='Escape'&&!$('dialog[open]')){ if(S.cardSel.size){S.cardSel.clear();render();renderSelBar();return;} if(S.drawer) closeDrawer(); }
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card-h[role=button]')){e.preventDefault();e.target.click();}
});
listen(root,'change',e=>{
  const t=e.target;
  if(CMP&&t.closest&&t.closest('#cmpDlg')){
    if(t.name==='cmpBy'){ CMP.by=t.value; cmpDetect(); renderCmp(); }
    else if(t.id==='cmpCol'){ CMP.col=+t.value; renderCmp(); }
    else if(t.id==='cmpHead'){ CMP.header=t.checked; renderCmp(); }
    else if(t.id==='cmpFile'&&t.files&&t.files[0]){ const f=t.files[0]; CMP.busy=true;
      store.readTable(f).then(T=>{ CMP.table=T; CMP.fileName=f.name; CMP.busy=false; cmpDetect(); renderCmp(); if(!cmpValues().length) $('#cmpErr').textContent='No values found in that file.'; })
        .catch(err=>{ CMP.busy=false; renderCmp(); $('#cmpErr').textContent=`Couldn’t read ${f.name}: ${err?.message||err}`; }); }
    return;
  }
  if(t.dataset.fk){
    const k=t.dataset.fk, F=S.filters, open=t.closest('.fdrop')?.dataset.drop;
    if(Array.isArray(F[k])){const set=new Set(F[k]);t.checked?set.add(t.value):set.delete(t.value);F[k]=[...set];}
    else F[k]=t.value;
    refreshFilter(); render();
    const d=$(`.fdrop[data-drop="${open}"]`); if(d) d.open=true;
    return;
  }
  if(t.id==='kType'){$('#kItem').innerHTML=(CONTENT[t.value]?.items||[]).map(x=>`<option>${esc(x)}</option>`).join('');return;}
  if(t.id==='aType'){$('#aItem').innerHTML=(ACTION_TYPES[t.value]?.items||[]).map(x=>`<option>${esc(x)}</option>`).join('');return;}
  if(t.id==='roleSel'){S.role=t.value; if(S.arranging&&!canEdit(curSet())) S.arranging=false; S.sel.clear(); render(); return;}
  if(t.id==='devToggle'){S.dev=t.checked;root.classList.toggle('dev',S.dev);return;}
  if(t.dataset.selpid){t.checked?S.sel.add(t.dataset.selpid):S.sel.delete(t.dataset.selpid);updateBulk();return;}
  if(t.id==='selAll'){$$('#drawer input[data-selpid]').forEach(i=>{i.checked=t.checked;t.checked?S.sel.add(i.dataset.selpid):S.sel.delete(i.dataset.selpid);});updateBulk();return;}
  if(t.name==='tgt'){MV.target=t.value;$('#mErr').textContent='';moveInfo();return;}
  if(t.dataset.gseg){const id=t.dataset.gseg, set=new Set(GB.segmentIds);
    t.checked?set.add(id):set.delete(id); GB.segmentIds=[...set];
    updateGroupPreview(); $('#gErr').textContent=''; return;}
  if(t.dataset.addpid){t.checked?ADD.sel.add(t.dataset.addpid):ADD.sel.delete(t.dataset.addpid);const go=$('#aGo');go.textContent=ADD.sel.size?`Add ${plural(ADD.sel.size,'participant')}`:'Add';go.disabled=!ADD.sel.size;$('#aErr').textContent='';return;}
  if(t.closest('#segDlg')){
    if(t.name==='sType'){B.type=t.value;renderSegDlg();return;}
    if(t.name==='sStatus'){B.status=t.value;$('#sStatusHint').textContent=statusHint();renderStore();return;}
    if(t.id==='sComb'){B.comb=t.value;updatePreview();return;}
    if(t.dataset.jg){const js=new Set(B.scope.ids);t.checked?js.add(t.dataset.jg):js.delete(t.dataset.jg);
      B.scope.ids=SCOPE[B.scope.type].opts().map(o=>o[0]).filter(v=>js.has(v));syncJourney();return;}
    const row=t.closest('.cond'); if(!row) return; const i=+row.dataset.i, r=B.rows[i], k=t.dataset.k;
    if(k==='field'){B.rows[i]=defaultRow(t.value);renderConds();}
    else if(k==='op'){const f=FIELD[r.field];r.op=t.value;
      if(f.type==='number') r.value=r.op==='between'?[0,21]:(Array.isArray(r.value)?r.value[0]:r.value);
      else if(f.type==='products') r.value=r.op==='counts'?{mode:'all',items:[{product:PRODUCTS[0]?.id||'',op:'gte',n:1}]}:(r.op==='hasAny'?[]:null);
      else if(f.type==='productList') r.value=r.op==='isEmpty'?null:Array.isArray(r.value)?r.value:[];   // keep picks between any/equals
      renderConds();}
    else if(k==='v'){const s=new Set(Array.isArray(r.value)?r.value:[]);t.checked?s.add(t.value):s.delete(t.value);r.value=[...s];
      const ms=t.closest('.ms'); if(ms) syncMsSummary(ms,r);
      updatePreview();}
    else if(k==='pv'){const ps=new Set(r.products||[]);t.checked?ps.add(t.value):ps.delete(t.value);
      r.products=PRODUCTS.map(p=>p.id).filter(id=>ps.has(id));syncPms(row,r);updatePreview();}
    else if(k==='ob'){r.value=t.value==='ONBOARDED'?['ONBOARDED']:[...YTO];updatePreview();}
    else if(k==='cmode'){r.value={...r.value,mode:t.value};updatePreview();}
    else if(k==='cprod'||k==='ccop'){const ci=+t.closest('[data-ci]').dataset.ci;
      r.value.items[ci]={...r.value.items[ci],[k==='cprod'?'product':'op']:t.value};updatePreview();}
  }
});
listen(root,'input',e=>{
  const t=e.target;
  if(t.id==='cmpPaste'&&CMP){ CMP.paste=t.value; const v=cmpValues(), go=$('#cmpGo'), info=$('#cmpInfo');
    if(go) go.disabled=!v.length; if(info) info.textContent=v.length?`${plural(v.length,'value')} to compare against the ${plural(cmpCurrentRows().length,'participant')} in View all.`:'Upload a file or paste a list to compare.'; return; }
  if(t.id==='q'){
    const q=t.value.trim().toLowerCase(), r=$('#qres'); if(q.length<2){r.hidden=true;return;}
    const set=curSet(), hits=P.filter(p=>p.name.toLowerCase().includes(q)||p.pid.toLowerCase().includes(q)).slice(0,8);
    r.innerHTML=hits.length?hits.map(p=>{const m=MEM[set.id].get(p.pid);return `<button data-qpid="${p.pid}"><div>${esc(p.name)} <span class="mono subtle small">${p.pid}</span></div><div class="where">${m.segs.length?esc(m.segs.map(id=>segName(set,id)).join(', ')):'Not in a segment · '+esc(REASONS[m.reason])}${m.pinned?' · placed by hand':''}</div></button>`;}).join(''):'<div class="subtle" style="padding:10px 12px">No participant found.</div>';
    r.hidden=false; return;
  }
  if(t.id==='dq'){S.dq=t.value;S.limit=150;const pos=t.selectionStart;renderDrawer(true);const n=$('#dq');n.focus();n.setSelectionRange(pos,pos);return;}
  if(t.id==='tq'){const q=t.value.trim().toLowerCase();$$('#tlist label[data-name]').forEach(l=>l.hidden=!!q&&!l.dataset.name.includes(q));return;}
  if(t.dataset.fk&&(t.type==='number')){S.filters[t.dataset.fk]=t.value;refreshFilter();
    const drop=t.closest('.fdrop')?.dataset.drop, pos=t.selectionStart, id=t.id;
    render(); const d=$(`.fdrop[data-drop="${drop}"]`); if(d){d.open=true; const n=$('#'+id); if(n){n.focus(); try{n.setSelectionRange(pos,pos);}catch(e){}}}
    return;}
  if(t.id==='aq'){ADD.q=t.value;renderAddList();return;}
  if(t.id==='gName'){GB.name=t.value;return;}
  if(t.id==='gq'){GB.q=t.value;const pos=t.selectionStart;renderGroupDlg();const n=$('#gq');n.focus();n.setSelectionRange(pos,pos);return;}
  if(t.classList.contains('ms-q')){const q=t.value.trim().toLowerCase();
    t.closest('.fpanel').querySelectorAll('label[data-name]').forEach(l=>l.hidden=!!q&&!l.dataset.name.includes(q));return;}
  if(t.closest('#segDlg')){
    if(t.id==='sName'){B.name=t.value;const nn=$('#seqNewName'); if(nn) nn.textContent=B.name.trim()||'New segment';renderStore();return;}
    if(t.id==='sDesc'){B.description=t.value;$('#sDescN').textContent=`${t.value.length} / ${DESC_MAX}`;renderStore();return;}
    const row=t.closest('.cond'); if(!row) return; const r=B.rows[+row.dataset.i], k=t.dataset.k, v=t.value===''?NaN:+t.value;
    if(k==='n'){r.value=v;updatePreview();} else if(k==='n0'){r.value=[v,r.value[1]];updatePreview();} else if(k==='n1'){r.value=[r.value[0],v];updatePreview();}
    else if(k==='ccn'){const ci=+t.closest('[data-ci]').dataset.ci;r.value.items[ci]={...r.value.items[ci],n:v};updatePreview();}
  }
});
// a dropdown opened inside a dialog scrolls the dialog body so its whole list is visible
listen(root,'toggle',e=>{
  const d=e.target; if(!d.open||!d.matches||!d.matches('dialog details.fdrop')) return;
  const panel=d.querySelector('.fpanel'); if(panel) requestAnimationFrame(()=>panel.scrollIntoView({block:'nearest'}));
},true);
// drag participants from the drawer onto a segment on the board
listen(root,'dragstart',e=>{
  const tr=e.target.closest&&e.target.closest('[data-pid]'); if(!tr) return;
  const pid=tr.dataset.pid; S.dragPids=S.sel.has(pid)?[...S.sel]:[pid];
  e.dataTransfer.setData('text/plain',S.dragPids.join(',')); e.dataTransfer.effectAllowed='move';
  root.classList.add('dragging-people');
});
listen(root,'dragend',()=>{S.dragPids=null;root.classList.remove('dragging-people');$$('.drop-ok').forEach(x=>x.classList.remove('drop-ok'));});
listen(root,'dragover',e=>{
  if(!S.dragPids) return; const d=e.target.closest&&e.target.closest('[data-drop]'); if(!d) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  $$('.drop-ok').forEach(x=>{if(x!==d)x.classList.remove('drop-ok');}); d.classList.add('drop-ok');
});
listen(root,'drop',e=>{
  if(!S.dragPids) return; const d=e.target.closest&&e.target.closest('[data-drop]'); if(!d) return;
  e.preventDefault(); const pids=S.dragPids; d.classList.remove('drop-ok'); openMove(pids,d.dataset.drop);
});

load();
return () => { cleanups.forEach(f => f()); stopSort(); if (seqSort) seqSort.destroy(); clearTimeout(toast._t); };
}
