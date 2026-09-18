/**
 * Multi-company GST configuration — Starlabs' copy.
 *
 * Watson bills under more than one legal entity. Its `accountsconfig/config`
 * doc carries a `companies[]` array; each company owns a complete GST setup —
 * its state registrations (`gstdetails`), its non-GST distribution ratio
 * (`nongstratio`) and its IGST fallback state.
 *
 * Starlabs writes Watson payments when a journey is onboarded, so it has to
 * resolve the same company the Watson payment screens would. This file is a
 * deliberate mirror of `Watson-Angular/src/app/Service/company-config.ts` —
 * the two repos deploy separately, so the logic is duplicated rather than
 * shared. Keep them in step: a divergence here produces payments Watson's
 * invoice pipeline will number under the wrong entity.
 *
 * `companies[0]` is the default. It keeps the original unprefixed invoice
 * series, and is mirrored back to the legacy top-level `gstdetails` /
 * `nongstratio` / `igststate` keys for readers still on the old shape.
 *
 * A payment records its issuing entity via `companykey`. **A payment with no
 * `companykey` belongs to the default company** — that is what lets every
 * pre-existing payment keep working unchanged.
 */

export interface CompanyConfig {
  key: string;
  title: string;
  /** 'none' → YYMM001 (the original series). 'statecode' → TNYYMM001. */
  seriesPrefix: 'none' | 'statecode' | string;
  gstdetails: any[];
  nongstratio: any[];
  igststate: string;
}

/** The default company's key, used whenever a payment carries none. */
export const DEFAULT_COMPANY_KEY = 'A';

/**
 * GST state code -> 2-letter abbreviation used as the invoice-number prefix.
 * Mirrors STATE_ABBR in the watson-cloud-functions repo; the client stamps
 * `companyprefix` onto the payment so the two never have to agree by accident.
 */
export const STATE_ABBR: { [code: string]: string } = {
  '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UK', '06': 'HR', '07': 'DL',
  '08': 'RJ', '09': 'UP', '10': 'BR', '11': 'SK', '12': 'AR', '13': 'NL', '14': 'MN',
  '15': 'MZ', '16': 'TR', '17': 'ML', '18': 'AS', '19': 'WB', '20': 'JH', '21': 'OD',
  '22': 'CG', '23': 'MP', '24': 'GJ', '25': 'DD', '26': 'DN', '27': 'MH', '29': 'KA',
  '30': 'GA', '31': 'LD', '32': 'KL', '33': 'TN', '34': 'PY', '35': 'AN', '36': 'TS',
  '37': 'AP', '38': 'LA', '96': 'FC', '97': 'OT'
};

/**
 * Reads the company list out of a config doc, promoting a legacy
 * single-company document to one default company so callers never have to
 * branch on shape.
 */
export function resolveCompanies(configData: any): CompanyConfig[] {
  const stored = configData?.['companies'];

  if (Array.isArray(stored) && stored.length) {
    return stored.map((c: any, i: number) => ({
      key: c?.['key'] || String.fromCharCode(65 + i),
      title: c?.['title'] || `Company ${c?.['key'] || String.fromCharCode(65 + i)}`,
      seriesPrefix: c?.['seriesPrefix'] || (i === 0 ? 'none' : 'statecode'),
      gstdetails: Array.isArray(c?.['gstdetails']) ? c['gstdetails'] : [],
      nongstratio: Array.isArray(c?.['nongstratio']) ? c['nongstratio'] : [],
      igststate: c?.['igststate'] || '',
    }));
  }

  // Legacy doc: the top-level fields are the one and only company.
  return [{
    key: DEFAULT_COMPANY_KEY,
    title: configData?.['gstdetails']?.[0]?.['companyname'] || 'Company A',
    seriesPrefix: 'none',
    gstdetails: Array.isArray(configData?.['gstdetails']) ? configData['gstdetails'] : [],
    nongstratio: Array.isArray(configData?.['nongstratio']) ? configData['nongstratio'] : [],
    igststate: configData?.['igststate'] || '',
  }];
}

/**
 * Finds a company by key, falling back to the default (first) company.
 * An unknown or absent key therefore resolves to the default rather than
 * throwing — the same rule Watson's cloud function applies.
 */
export function findCompany(companies: CompanyConfig[], key: string): CompanyConfig | null {
  if (!companies || !companies.length) return null;
  if ([null, undefined, ''].includes(key)) return companies[0];
  return companies.find((c) => c.key === key) || companies[0];
}

/** True when this company keeps the original unprefixed invoice series. */
export function isDefaultCompany(company: CompanyConfig | null): boolean {
  if (!company) return true;
  return company.seriesPrefix !== 'statecode';
}

/**
 * The letter prefix stamped onto a payment for a state-prefixed series
 * ('TN'), or '' for the default company. Falls back the same way Watson's
 * cloud function does: the gstdetails statecode, then the seller GSTIN,
 * then 'IN'.
 */
export function companyPrefixFor(company: CompanyConfig | null, gstdetails: any): string {
  if (isDefaultCompany(company)) return '';

  const sellerCode = gstdetails?.['statecode']
    || (gstdetails?.['gstno'] ? gstdetails['gstno'].toString().substring(0, 2) : '');

  return STATE_ABBR[(sellerCode || '').toString()] || 'IN';
}

/**
 * Doc id for Watson's non-GST distribution counters.
 *
 * The default company keeps the original `MM-YY` id so its running counts
 * carry over untouched; other companies are namespaced by key, because the
 * counter keys are bare state names and two companies registered in the same
 * state would otherwise share a tally.
 */
export function ratioCounterDocId(company: CompanyConfig | null, month: string, year: string): string {
  const base = `${month}-${year}`;
  return isDefaultCompany(company) ? base : `${company.key}-${base}`;
}
