import { peopleSendCsv, peopleSendFileName, peopleSendMatches, peopleSendPhone, toPeopleSendRow } from './people-send-dialog.model';

describe('People Send dialog rows', () => {
  it('fills every field from whatever the caller passes', () => {
    expect(toPeopleSendRow({ name: ' Asha ', email: 'a@x.com', phonenumber: 98765, journey: undefined }))
      .toEqual({ name: 'Asha', email: 'a@x.com', countrycode: '', phonenumber: '98765', usertype: '', journey: '' });
    expect(toPeopleSendRow(null))
      .toEqual({ name: '', email: '', countrycode: '', phonenumber: '', usertype: '', journey: '' });
  });

  it('country code: either spelling, "+" added when missing, shown before the number', () => {
    expect(toPeopleSendRow({ countryCode: '91', phonenumber: '98765' }).countrycode).toBe('+91');
    expect(toPeopleSendRow({ countrycode: '+1', phonenumber: '555' }).countrycode).toBe('+1');
    expect(peopleSendPhone(toPeopleSendRow({ countrycode: '+91', phonenumber: '98765' }))).toBe('+91 98765');
    expect(peopleSendPhone(toPeopleSendRow({ phonenumber: '98765' }))).withContext('no code').toBe('98765');
    expect(peopleSendPhone(toPeopleSendRow({ countrycode: '+91' }))).withContext('no number').toBe('');
  });

  it('search matches name, email, phone or journey, ignoring case', () => {
    const r = toPeopleSendRow({ name: 'Asha Rao', email: 'asha@x.com', phonenumber: '98765', journey: 'B!G Journey' });
    expect(peopleSendMatches(r, '')).toBeTrue();
    expect(peopleSendMatches(r, 'RAO')).toBeTrue();
    expect(peopleSendMatches(r, 'x.com')).toBeTrue();
    expect(peopleSendMatches(r, '876')).toBeTrue();
    expect(peopleSendMatches(r, 'b!g')).toBeTrue();
    expect(peopleSendMatches(toPeopleSendRow({ usertype: 'New user' }), 'new')).withContext('user type').toBeTrue();
    expect(peopleSendMatches(toPeopleSendRow({ countrycode: '+91', phonenumber: '1' }), '+91')).withContext('code').toBeTrue();
    expect(peopleSendMatches(r, 'nobody')).toBeFalse();
  });

  it('CSV has a header and one line per person, quoting commas and quotes', () => {
    const csv = peopleSendCsv([
      toPeopleSendRow({ name: 'Rao, Asha', email: 'a@x.com', countrycode: '91', phonenumber: '1', usertype: 'Existing', journey: 'The "Big" one' }),
      toPeopleSendRow({ name: 'Ben', email: 'b@x.com', usertype: 'New user' }),
    ]);
    expect(csv).toBe('Name,Email,Phone,User Type,Journey\r\n"Rao, Asha",a@x.com,+91 1,Existing,"The ""Big"" one"\r\nBen,b@x.com,,New user,\r\n');
  });

  it('file name comes from the title and the date', () => {
    expect(peopleSendFileName('Send to Slack', new Date(2026, 9, 22))).toBe('send-to-slack-2026-10-22.csv');
    expect(peopleSendFileName('', new Date(2026, 0, 5))).toBe('people-2026-01-05.csv');
  });
});
