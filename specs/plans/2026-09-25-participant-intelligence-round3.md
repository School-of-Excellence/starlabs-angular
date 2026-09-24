# Participant Intelligence — round 3 APPROVED plan (2026-09-25)

## Flag list (NOT building — report after final build)
1. **Move 4 cards to the Journey Coaching Dashboard** (`power-user-no-upgrade`, `fully-consumed-ready`, `active-never-contacted`, `high-value-lapse`). Open: which dashboard (JourneycoachDashboard-new vs journey-coach-health), and whether it's done by us or the owning team. **They stay on Participant Intelligence until the move happens**, so nothing is lost in between.
2. **"Has product, never consumed any in the last 6 months"** (card `product-never-consumed`). There's no consumption date in the data. Options were A (purchase / subscription start 6+ months ago and nothing consumed), B (find a dated consumption source), C (no event attended in 6 months). **The card keeps its current rule** ("never consumed any") until this is decided.

## Decisions
- **R3-1 Remove Insight cards:** `active-no-product`, `idle-active-product`, `expiring-soon`, `finance-overdue`, `finance-locked`. The Financial category row disappears once it's empty. **Keep:** the Watson Financial status filter, the Watson R1–R5 checklists, all Checklists-menu items (including "Active without product"), and the topbar Insights badge (its count drops naturally).
- **R3-4 Lapsed card** (`recently-lapsed`): customerstatus == 'non active' only (excludes discontinued, late, banned, none); subscriptionend within the last 183 days (> 0 and ≤ 183 days ago). Label: "Lapsed in the last 6 months (non active), not renewed".
- **R3-5 Selection bar**: every analytics action, each opening analytics' own dialog with the **raw metadata doc**.
  - Communication: Email, WhatsApp (WatiInput), In-App Notification, Send Wati Messages (SendmessagesComponent + chunked send), Send Broadcast in Breakthroughs (BroadcastComponent), Wati Configuration.
  - Organize: Manage Tags, Make as List, Manage Lists & Segments (ManageParticipantlistDialog).
  - App Actions: Recommend Playlist (MapRecommendedplaylist), View Recommended (toggles eiflix / solarvoice / generalcontent columns), Interim Report, Evolution Wishlist, App Action Pending (AddPendingAction).
  - Update: Add Remarks, Extend Subscription, Add Product (BulkAddProducts).
  - Reports: Evolution Summary, Export Selection, Export Table, Content Consumption.
- **R3-6 Export is back**: a top-bar **Export ▾** menu with Export Table (filtered rows), Export Selection (when rows are selected) and Content Consumption. Excel with the visible columns, as analytics. Round 1's "export out of scope" is overridden.

## Known facts
- No consumption date exists anywhere: `consumedproducts` is a plain id list.
- Analytics selection actions: Send Communication → Notification (AhNotification), Email (EmailInput), Wati (WatiInput = our "Send WhatsApp"); top-level "Send Wati Messages" = `SendmessagesComponent` workshop templates (`sendWattiWorkshop` + `workshopmessageChunked`); "App Action Pending" = `AddPendingActionComponent` (AppEngagement/app-action-pending/add-pending-action), bulk with profile ids; "Manage List & Segments" = `ManageParticipantlistDialogComponent`; Playlist → Recommend = `MapRecommendedplaylistToparticipantComponentComponent`; "Add Products" = `BulkAddProductsComponent` (the development version on charan-release, since 8411be85 reverted the newer one).
- Journey Coaching dashboards: `JourneycoachDashboard-new` (journeycoach-dashboard) and `journey-coach-health` (journey-coach-health-dashboard).
