# PI — Product subscription filter (approved 2026-10-21)

| # | Edit |
|---|---|
| 1 | Filter rail section **Product subscription**: one product + relation (same 8 as Subscription) + From–To |
| 2 | On pick, load that product's `participantsproduct` docs once (`where('productref','==',products/{id})`), cached per product — same pattern as Confirmed events |
| 3 | Match: any of the participant's docs for the product fits the dates; profileids deduplicated; docs with status cancelled / shifted (any case) ignored; missing dates never match |
| 4 | Saved under `pifilter.productSubscription` (analytics ignores it) |
| 5 | Unit tests (matching, dedupe, status exclusion, mapping) + `pi-filter-psub-*` hooks |
