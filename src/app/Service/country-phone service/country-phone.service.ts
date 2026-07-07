import { Injectable } from '@angular/core';

export interface CountryPhone {
  name: string;
  code: string;
  iso: string;
  digits: number;
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountryPhoneService {

  readonly countries: CountryPhone[] = [
    { name: 'Afghanistan',            code: '+93',   iso: 'AF', digits: 9,  flag: '🇦🇫' },
    { name: 'Albania',                code: '+355',  iso: 'AL', digits: 9,  flag: '🇦🇱' },
    { name: 'Algeria',                code: '+213',  iso: 'DZ', digits: 9,  flag: '🇩🇿' },
    { name: 'Argentina',              code: '+54',   iso: 'AR', digits: 10, flag: '🇦🇷' },
    { name: 'Australia',              code: '+61',   iso: 'AU', digits: 9,  flag: '🇦🇺' },
    { name: 'Austria',                code: '+43',   iso: 'AT', digits: 10, flag: '🇦🇹' },
    { name: 'Bahrain',                code: '+973',  iso: 'BH', digits: 8,  flag: '🇧🇭' },
    { name: 'Bangladesh',             code: '+880',  iso: 'BD', digits: 10, flag: '🇧🇩' },
    { name: 'Belgium',                code: '+32',   iso: 'BE', digits: 9,  flag: '🇧🇪' },
    { name: 'Brazil',                 code: '+55',   iso: 'BR', digits: 11, flag: '🇧🇷' },
    { name: 'Canada',                 code: '+1',    iso: 'CA', digits: 10, flag: '🇨🇦' },
    { name: 'Chile',                  code: '+56',   iso: 'CL', digits: 9,  flag: '🇨🇱' },
    { name: 'China',                  code: '+86',   iso: 'CN', digits: 11, flag: '🇨🇳' },
    { name: 'Colombia',               code: '+57',   iso: 'CO', digits: 10, flag: '🇨🇴' },
    { name: 'Croatia',                code: '+385',  iso: 'HR', digits: 9,  flag: '🇭🇷' },
    { name: 'Cyprus',                 code: '+357',  iso: 'CY', digits: 8,  flag: '🇨🇾' },
    { name: 'Czech Republic',         code: '+420',  iso: 'CZ', digits: 9,  flag: '🇨🇿' },
    { name: 'Denmark',                code: '+45',   iso: 'DK', digits: 8,  flag: '🇩🇰' },
    { name: 'Egypt',                  code: '+20',   iso: 'EG', digits: 10, flag: '🇪🇬' },
    { name: 'Finland',                code: '+358',  iso: 'FI', digits: 10, flag: '🇫🇮' },
    { name: 'France',                 code: '+33',   iso: 'FR', digits: 9,  flag: '🇫🇷' },
    { name: 'Germany',                code: '+49',   iso: 'DE', digits: 10, flag: '🇩🇪' },
    { name: 'Ghana',                  code: '+233',  iso: 'GH', digits: 9,  flag: '🇬🇭' },
    { name: 'Greece',                 code: '+30',   iso: 'GR', digits: 10, flag: '🇬🇷' },
    { name: 'Hong Kong',              code: '+852',  iso: 'HK', digits: 8,  flag: '🇭🇰' },
    { name: 'Hungary',                code: '+36',   iso: 'HU', digits: 9,  flag: '🇭🇺' },
    { name: 'India',                  code: '+91',   iso: 'IN', digits: 10, flag: '🇮🇳' },
    { name: 'Indonesia',              code: '+62',   iso: 'ID', digits: 11, flag: '🇮🇩' },
    { name: 'Iran',                   code: '+98',   iso: 'IR', digits: 10, flag: '🇮🇷' },
    { name: 'Iraq',                   code: '+964',  iso: 'IQ', digits: 10, flag: '🇮🇶' },
    { name: 'Ireland',                code: '+353',  iso: 'IE', digits: 9,  flag: '🇮🇪' },
    { name: 'Israel',                 code: '+972',  iso: 'IL', digits: 9,  flag: '🇮🇱' },
    { name: 'Italy',                  code: '+39',   iso: 'IT', digits: 10, flag: '🇮🇹' },
    { name: 'Japan',                  code: '+81',   iso: 'JP', digits: 10, flag: '🇯🇵' },
    { name: 'Jordan',                 code: '+962',  iso: 'JO', digits: 9,  flag: '🇯🇴' },
    { name: 'Kenya',                  code: '+254',  iso: 'KE', digits: 9,  flag: '🇰🇪' },
    { name: 'Kuwait',                 code: '+965',  iso: 'KW', digits: 8,  flag: '🇰🇼' },
    { name: 'Lebanon',                code: '+961',  iso: 'LB', digits: 8,  flag: '🇱🇧' },
    { name: 'Malaysia',               code: '+60',   iso: 'MY', digits: 10, flag: '🇲🇾' },
    { name: 'Mexico',                 code: '+52',   iso: 'MX', digits: 10, flag: '🇲🇽' },
    { name: 'Morocco',                code: '+212',  iso: 'MA', digits: 9,  flag: '🇲🇦' },
    { name: 'Myanmar',                code: '+95',   iso: 'MM', digits: 9,  flag: '🇲🇲' },
    { name: 'Nepal',                  code: '+977',  iso: 'NP', digits: 10, flag: '🇳🇵' },
    { name: 'Netherlands',            code: '+31',   iso: 'NL', digits: 9,  flag: '🇳🇱' },
    { name: 'New Zealand',            code: '+64',   iso: 'NZ', digits: 9,  flag: '🇳🇿' },
    { name: 'Nigeria',                code: '+234',  iso: 'NG', digits: 10, flag: '🇳🇬' },
    { name: 'Norway',                 code: '+47',   iso: 'NO', digits: 8,  flag: '🇳🇴' },
    { name: 'Oman',                   code: '+968',  iso: 'OM', digits: 8,  flag: '🇴🇲' },
    { name: 'Pakistan',               code: '+92',   iso: 'PK', digits: 10, flag: '🇵🇰' },
    { name: 'Philippines',            code: '+63',   iso: 'PH', digits: 10, flag: '🇵🇭' },
    { name: 'Poland',                 code: '+48',   iso: 'PL', digits: 9,  flag: '🇵🇱' },
    { name: 'Portugal',               code: '+351',  iso: 'PT', digits: 9,  flag: '🇵🇹' },
    { name: 'Qatar',                  code: '+974',  iso: 'QA', digits: 8,  flag: '🇶🇦' },
    { name: 'Romania',                code: '+40',   iso: 'RO', digits: 9,  flag: '🇷🇴' },
    { name: 'Russia',                 code: '+7',    iso: 'RU', digits: 10, flag: '🇷🇺' },
    { name: 'Saudi Arabia',           code: '+966',  iso: 'SA', digits: 9,  flag: '🇸🇦' },
    { name: 'Singapore',              code: '+65',   iso: 'SG', digits: 8,  flag: '🇸🇬' },
    { name: 'South Africa',           code: '+27',   iso: 'ZA', digits: 9,  flag: '🇿🇦' },
    { name: 'South Korea',            code: '+82',   iso: 'KR', digits: 10, flag: '🇰🇷' },
    { name: 'Spain',                  code: '+34',   iso: 'ES', digits: 9,  flag: '🇪🇸' },
    { name: 'Sri Lanka',              code: '+94',   iso: 'LK', digits: 9,  flag: '🇱🇰' },
    { name: 'Sweden',                 code: '+46',   iso: 'SE', digits: 9,  flag: '🇸🇪' },
    { name: 'Switzerland',            code: '+41',   iso: 'CH', digits: 9,  flag: '🇨🇭' },
    { name: 'Taiwan',                 code: '+886',  iso: 'TW', digits: 9,  flag: '🇹🇼' },
    { name: 'Thailand',               code: '+66',   iso: 'TH', digits: 9,  flag: '🇹🇭' },
    { name: 'Tunisia',                code: '+216',  iso: 'TN', digits: 8,  flag: '🇹🇳' },
    { name: 'Turkey',                 code: '+90',   iso: 'TR', digits: 10, flag: '🇹🇷' },
    { name: 'Ukraine',                code: '+380',  iso: 'UA', digits: 9,  flag: '🇺🇦' },
    { name: 'United Arab Emirates',   code: '+971',  iso: 'AE', digits: 9,  flag: '🇦🇪' },
    { name: 'United Kingdom',         code: '+44',   iso: 'GB', digits: 10, flag: '🇬🇧' },
    { name: 'United States',          code: '+1',    iso: 'US', digits: 10, flag: '🇺🇸' },
    { name: 'Vietnam',                code: '+84',   iso: 'VN', digits: 9,  flag: '🇻🇳' },
  ];

  getByCode(code: string): CountryPhone | undefined {
    return this.countries.find(c => c.code === code);
  }

  getDigitsForCode(code: string): number {
    return this.getByCode(code)?.digits ?? 10;
  }

  getPatternForCode(code: string): RegExp {
    const digits = this.getDigitsForCode(code);
    return new RegExp(`^[0-9]{${digits}}$`);
  }
}
