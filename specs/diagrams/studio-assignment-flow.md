# Dynamic studio assignment flow (runtime assembly)

See `LIVE-STUDIOS.md §5`. Almost all runtime-state; the only CONFIG is `arenaspace`. `file:line` = `dynamic-studio.component.ts` unless noted.

```
   queue_token (status=="ready", currentstage==<Activity stage>, liveassignmentid==null)     [:787]
        │  operator drops the token into an Activity column on the queue board
        ▼
   1. MINT     liveassignmentid = doc(collection('live assignment')).id                       [:1074]
   2. BUILD    { participantid, queueid, stagename, studioid, pairing[], status:'live' }       [:1098]
   3. PERSIST  setDoc('live assignment/'+id, data, {merge:true})                               [:1115]
   4. WRITEBK  updateDoc('queue_token', { liveassignmentid, studioid, status:'instudio' })     [:1090,:1124]
        │
        ▼ choose conferencing path by studio's `openvidu` flag (queue studio pairing)          [:410]
   ┌──────────────────────────────┐                 ┌─────────────────────────────────────────┐
   │ LiveKit path (openvidu==true) │                 │ Zoom path (otherwise)                     │
   │  createOpenViduRoom({         │                 │  zoomdata provisioned BACKEND             │
   │    roomid: liveassignmentid,  │ [:2490,:2486]   │  (Firestore trigger on live-assignment    │
   │    sessiontype:'live assignment'}            │   create — NOT in this repo)              │
   │  → openviduroom doc            │ authguard:1792  │  client READS zoomdata.join_url   [:422]  │
   │  token via createOpenViduToken │ join:593        │  regen via studioZoomLinkRegenerate [:1611]│
   │  record: openViduStart/Stop    │ join:859/877    │                                           │
   └──────────────┬───────────────┘                 └──────────────────┬────────────────────────┘
                  │                                                     │
                  ▼  THE JOIN KEY (LiveKit):                            ▼
        openviduroom.docid  ══  live assignment.docid  ══  queue_token.liveassignmentid
                  │
                  ▼
   5. COMPLETE  live assignment.status='completed' (arenastudioactivity:137)
                clear token { liveassignmentid:null, studioid:null }                           [:1286]
                log the stage move → queue stage log (QUEUE-AND-BIG.md)

   ── Worked example: live assignment nB91BRzO3kxQFYZvg1LV (Diagnostics, studioid WU0KYrffrWcbDW6U3GnL) ──
      Zoom-path studio: zoomdata present (server-provisioned), NO openviduroom with that id; status completed;
      token binding already cleared (historical). LiveKit contrast: openviduroom IV72tcdHPBno7BTz9o00 (egress recorded).

   CONFIG: arenaspace (93) — studio-space defs {spaceid, mentor[], pivottype, eventref, participantslist[], validated}
           (authored by create-arena-space.ts:740; ⚠️ live name `arenaspace`, empty twin `arena space`=0)
```
