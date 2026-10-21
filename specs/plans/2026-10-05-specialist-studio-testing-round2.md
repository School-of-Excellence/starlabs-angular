# Specialist Appointment Studio — testing report round 2 (approved 2026-10-05)

Logic locked point by point with the operator. Round 1: `2026-10-01-specialist-studio-testing-round1.md`.

| # | Item | Decision |
|---|---|---|
| 1 | Product → delivery types | Picking a product limits the type list to that product's delivery-sequence types (sequence order), all ticked. Label **Delivery types** |
| 2+3 | Booked and Not booked show the same item | Any filter on → Week view lists **slots** (not windows), per day; each slot once, so booked / not booked never overlap. Month view under a filter: "N open · M booked" per day. No filter → windows as now |
| new | Calendar grouping | Toggle **Group by type / Sort by time** wherever slots are listed (Week slot view, Day view, Book calendar). Default: group by type |
| 4 | Specialist search | Searchable dropdown (ngx-mat-select-search) for the Overview specialist picker and the Add availability specialist picker |
| 5 | Responsive | Desktop + tablet. Remove the 1320px cap; week grid shrinks to ~700px then scrolls; side nav → icon rail below 1100px; filter/period bars wrap; Add availability stacks |
| 6 | Collaborative session pending for one host only | A session attaches to **each** host's window (calendar + Day view; it was deduped to the first window). Hosts read as `hosts` ∪ every profile in `hostRole` (fix A) |
| 7 | Book Session calendar | Two modes: **Calendar** (default) and **By participant** (existing). Calendar needs a product + delivery type; shows open slots (collaborative types: only times every required role is free). Click a slot → pick a participant (search) → Book. Participants: product active + the type **ready** in their delivery sequence. Booking write moves into a shared service used by both modes |
| 8 | Select all when adding | Add availability, Auto mode: **Select all** delivery types |
