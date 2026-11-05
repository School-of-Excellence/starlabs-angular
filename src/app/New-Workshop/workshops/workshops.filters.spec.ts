import { filterWorkshops, isActiveWorkshop, isLiveAnywhere, workshopTypeLabel } from './workshops.component';

describe('workshops list filters', () => {
  const w = (title: string, extra: any) => ({ title, workshopcompleted: false, ...extra });
  const list = [
    w('app', { active: true, workshoptype: 'liveworkshop' }),
    w('web', { webactive: true, workshoptype: 'cpworkshop' }),
    w('mobile', { eiflixmobileactive: true, workshoptype: 'evergreenworkshop' }),
    w('off', { active: false, webactive: false, eiflixmobileactive: false }),
    w('done', { active: true, workshopcompleted: true, workshoptype: 'cpworkshop' }),
    w('doneOff', { workshopcompleted: true, evergreenWorkshop: true }),
  ];
  const titles = (r: any[]) => r.map(x => x.title);

  it('counts any of the three switches as live', () => {
    expect(isLiveAnywhere({ active: true })).toBeTrue();
    expect(isLiveAnywhere({ webactive: true })).toBeTrue();
    expect(isLiveAnywhere({ eiflixmobileactive: true })).toBeTrue();
    expect(isLiveAnywhere({ active: false, webactive: false, eiflixmobileactive: false })).toBeFalse();
    expect(isLiveAnywhere({})).toBeFalse();
  });

  it('Active keeps live, not completed workshops', () => {
    expect(titles(filterWorkshops(list, 'active', 'all'))).toEqual(['app', 'web', 'mobile']);
  });

  it('Inactive keeps all-switches-off, not completed workshops', () => {
    expect(titles(filterWorkshops(list, 'inactive', 'all'))).toEqual(['off']);
  });

  it('Completed and All are unchanged', () => {
    expect(titles(filterWorkshops(list, 'completed', 'all'))).toEqual(['done', 'doneOff']);
    expect(filterWorkshops(list, 'all', 'all').length).toBe(6);
  });

  it('Type filters by the shown type, legacy flags included', () => {
    expect(titles(filterWorkshops(list, 'all', 'CP Workshop'))).toEqual(['web', 'done']);
    expect(titles(filterWorkshops(list, 'all', 'Workshop'))).toEqual(['app', 'off']);
    expect(titles(filterWorkshops(list, 'all', 'Evergreen Workshop'))).toEqual(['mobile', 'doneOff']);
    expect(workshopTypeLabel({ categorybased: true })).toBe('CP Workshop');
  });

  it('Status and type combine', () => {
    expect(titles(filterWorkshops(list, 'active', 'CP Workshop'))).toEqual(['web']);
    expect(titles(filterWorkshops(list, 'inactive', 'CP Workshop'))).toEqual([]);
  });
});

describe('workshops list Active chip', () => {
  it('shows exactly when the Active filter would keep the workshop', () => {
    expect(isActiveWorkshop({ active: true })).toBeTrue();
    expect(isActiveWorkshop({ webactive: true, workshopcompleted: false })).toBeTrue();
    expect(isActiveWorkshop({ eiflixmobileactive: true })).toBeTrue();
    expect(isActiveWorkshop({ active: true, workshopcompleted: true })).withContext('completed is not active').toBeFalse();
    expect(isActiveWorkshop({ active: false, webactive: false, eiflixmobileactive: false })).toBeFalse();
  });
});
