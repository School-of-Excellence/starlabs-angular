# Specialist Appointment Studio — testing report round 1 (approved 2026-10-01)

Source: "Specialist Availability Screen – Testing Report". Logic locked point by point with the operator.

| # | Item | Decision |
|---|---|---|
| 1 | Responsive layout | **Parked** — don't touch the UI layout for now |
| 2 | Time format | `50 min` · `1h` · `1h 10m`; totals stay in hours (`26h 30m`), never days. One change in `fmtHours` |
| 3 | Date not highlighted until mouse-out | Bug fix: hover style no longer overrides the selected style in the Add-availability range calendar |
| 4+5 | Delivery types on a window | Calendar (Home + A&H Overview): hover a window → tooltip with type names; click → Availability details dialog (time, specialist, types + duration, slots given / still open per type, bookings, Delete when unbooked) |
| 6 | Edit availability | **Parked** — no edit; delete an unbooked window and add a new one |
| 7 | Day view | Day · Week · Month on calendar screens only (Home, Overview). Today → Day mode on today. Prev/next = ±1 day. Month date click / week header click → Day. Stats follow the day. Opens on Week |
| 8 | Many windows a day | Day view = one column per delivery type, listing **slots**; blocked (overlap) and past-unbooked slots hidden; specialist name on each slot in All-specialists mode |
| 9 | Settings label | Renamed **Delivery Type Details** (nav + title) |
| 10 | Select all | Separate list under the calendar: future, unbooked windows selectable; Select all + Delete selected (confirm). Same permissions as single delete |
| 11 | Join timing | Disabled with tooltip until 5 min before start; closes at end time; 30 s clock |
| 12 | Date pick updates stats | Covered by #7 |
| New | Product + type filter | Home (applies to everything: calendar, Day, stats, upcoming, past, select list) and Book Session (narrows the participant's products and type radios). Picking a product auto-ticks its delivery-sequence types. Multi-type windows show only matching slots; hours counted from those slots. Products: A&H all · Mentor owned · CW products with their mapped types |
| New | Booked / Not booked | Home only. Not booked = future open slots. Stats ignore it |
| E1 | Pre-assign specialists | **Parked** |
| E2 | Participant tracker for mentors | **Parked** |
