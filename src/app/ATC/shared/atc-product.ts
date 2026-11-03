/**
 * ATC product (model) name matching — the one place that decides "is this ATC EI Solution / WiSH?".
 *
 * The name is matched by SUBSTRING, not equality: the real `atc model` records say "EI Solutions" (plural) while the
 * code and the prototype were written against "EI Solution". The records cannot be renamed (ATCs already reference
 * them), so the check had to widen instead. "EI Starter Pack" still does not match "ei solution", which keeps the
 * Starter Pack out of the EI Solution template — that exclusion is deliberate (see delivery-dashboard.engine.ts).
 *
 * Consequence accepted with the operator (2026-11-02): "EI Solution for Wife" / "EI Solution for Husband" are EI
 * Solution variants and now get the EI Solution sections. "W!SH" is NOT matched — no `atc model` record uses that
 * spelling, so no punctuation stripping is done here.
 */

/** The product name as it is compared: trimmed and lowercased. "" when there is no product. */
export function productKey(product: any): string {
  return (product ?? "").toString().trim().toLowerCase()
}

export function isEISolutionProduct(product: any): boolean {
  return productKey(product).includes("ei solution")
}

export function isWiSHProduct(product: any): boolean {
  return productKey(product).includes("wish")
}
