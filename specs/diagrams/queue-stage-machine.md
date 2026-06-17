# Queue stage machine (config → runtime-state → log)

See `QUEUE-AND-BIG.md §5`, `CONFIGURATION.md §1`. The stage list is **resolved from config, never stored on the token**.

```
   CONFIG (queue generation, 96 docs)                 CONFIG (queue variation, 183 docs)
   ┌─────────────────────────────────────┐            ┌──────────────────────────────────┐
   │ stages: ["Diagnostics", …,           │            │ variationname: "Old Participant" │
   │          "Completed"]                │◀──queueref─│ stages: [ …15 stages… ]          │
   │ stageproperty: {<stage>:{rules…}}    │            │ atcmodel?                        │
   │ queuevariation[] · queueadmin[]      │            └──────────────────────────────────┘
   └───────────────┬─────────────────────┘                          ▲
                   │ read by dynamic-queue-manager-clone.ts:1812     │ selected by token.variationid
                   │ stages loop :1871-1873 → board :1372 → *ngFor   │ override :2733-2737
                   ▼                                                 │
   resolved stage list = variationStages ?? queueData.stages   (queue-web-version1.ts:189)
                   │
                   ▼
   RUNTIME-STATE: queue_token (7,046)              ── "where am I" ──┐
   { profile_id, queueref, variationid,                             │ currentstage
     currentstage, previousstage, tokenstatus,                      │
     studioid, liveassignmentid }                                   ▼
                   │                          next = resolvedStages[ indexOf(currentstage) + 1 ]
                   │                          (AuthguardService.moveQueueStage  authguard.service.ts:1173-1176)
                   │ advance (board drag/drop OR moveQueueStage)
                   ▼
   updateDoc(queue_token, {previousstage, currentstage})   [:1201-1202 / clone :2911,:3137,:3168]
                   │
                   ▼
   TRANSACTIONAL: queue stage log (68,662)  setDoc(...)    [:1206-1208 / clone :2917,:3143,:3175]
   { previousstage, currentstage, manuallymoved, queueposition, createdon, logdocid==token.docid }

   ── Worked example: token 00dyh4CxBHvM0NjWivlu, queue "CTD D&I Dec 2022", variationid=null (default path) ──
   yet to join → In Air meet → Ready for diagnostics → In Diagnostics
       → Ready for Changework → In changework → (cycle) → Ready for Review → In Review → Completed
   (10 moves; createdon all = 2022-12-15 14:08 = bulk migration → order read from the from→to chain — see §8)

   ── Drop into an Activity stage → pair into a live studio (LIVE-STUDIOS.md) ──
   queue_token ──▶ live assignment (studioid, zoomdata) ──▶ studioid/liveassignmentid written back to token
```
