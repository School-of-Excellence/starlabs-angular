const admin=require('firebase-admin');const sa=require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();
const QID=process.argv[2]||'vuvS7eBgTxLKufnesLQT';
const ymd=v=>v?.toDate?v.toDate().toISOString().slice(0,10):'-';
const n=v=>Array.isArray(v)?v.length:(v&&typeof v==='object'?Object.keys(v).length:0);
(async()=>{
 const x=(await db.collection('queue generation').doc(QID).get()).data();
 console.log('### TOP-LEVEL');
 const t={queuename:x.queuename,description:x.description,start:ymd(x.queuestartdate),end:ymd(x.queueenddate),lastreg:ymd(x.lastregistrationdate),venue:x.venue,
   admins:n(x.queueadmin),mentors:n(x.queuementor),targetcap:x.queuetargetcapacity,totalcap:x.totalcapacity,
   zoomlinkrequired:x.zoomlinkrequired,enablezoomsdk:x.enablezoommeetingsdk,commsdisabled:x.iscommunicationsdisabled,
   welcometemplate:x.queuewelcometemplate,pkgeligibility:n(x.packageeligibility),variations:n(x.queuevariation),
   stages:n(x.stages),stagegroups:n(x.stagegroup),arenaevents:n(x.arenaeventidlist),created:ymd(x.created),modified:ymd(x.modified)};
 Object.entries(t).forEach(([k,v])=>console.log(`${k}\t${v??'-'}`));
 console.log('\n### STAGES x STAGEPROPERTY');
 const sp=x.stageproperty||{};
 (x.stages||[]).forEach((st,i)=>{
   const p=sp[st]||{};
   const ca=p.compulsoryactivity; const caStr=ca&&typeof ca==='object'?Object.values(ca).map(a=>Array.isArray(a)?a.length:0).join('/'):'-';
   const ns=Array.isArray(p.nextstage)?p.nextstage:[];
   const nsStr=ns.length?ns.map(o=>o.stage+(o.markascompleted?'(done)':'')).join(' | '):'-';
   const ssg=p.studiostagegrouping||{};
   const widgets=Array.isArray(p.studiowidgets)?p.studiowidgets.join(','):'-';
   const ar=p.actionresource; const arT=ar==null?'-':(ar.path?'ref':(Array.isArray(ar)?'ref[]':typeof ar));
   console.log([i,st,p.selfmovable?'Y':'-',p.actiontype||'-',arT,(Array.isArray(p.participantform)?p.participantform.length:0),
     caStr, ns.length, p.enablezoom?'Y':'-',p.checkfinance?'Y':'-',
     n(ssg.mandatorystage||ssg.mandatorystagegrouping), n(ssg.optionalstage||ssg.optionalstagegrouping), n(ssg.activitymapping),
     widgets, nsStr].join('\t'));
 });
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
