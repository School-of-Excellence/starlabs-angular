import { WorkshopDashboardComponent } from './workshop-dashboard.component';

/**
 * Side-panel export (operator 2026-10-20): Total Enrolled threw "Cannot read properties of undefined
 * (reading 'email')" for a new user whose row carried no `metadata`. The export now falls back to
 * participant metadata, then new_user_data, and never throws.
 */
describe('WorkshopDashboard — side panel export', () => {
  function make(rows: any[]): { c: any; csv: () => any[] } {
    const c: any = Object.create(WorkshopDashboardComponent.prototype);
    c.mapProfile = { e1: { name: 'Exist One', email: 'e1@x.com', phonenumber: '111', activejourney: 'jA' } };
    c.mapProfileNew = { n1: { name: 'New One', email: 'n1@x.com', phonenumber: '222' } };
    c.JourneyMap = { jA: 'Journey A' };
    c.workshopData = { detailpage: { title: 'WS' } };
    c.selectedStatusInfo = { status: 'totalEnrolled' };
    c.filteredParticipants = rows;
    c.can = () => true;
    let captured: any[] = [];
    c.createCSVContent = (data: any[]) => { captured = data; return ''; };
    c.downloadCSV = () => {};
    spyOn(window, 'confirm').and.returnValue(true);
    return { c, csv: () => captured };
  }

  it('exports rows with no metadata from either directory instead of throwing', () => {
    const { c, csv } = make([
      { profileid: 'e1', name: 'Exist One' },                       // metadata missing, in participant metadata
      { profileid: 'n1', name: 'New One', metadata: undefined },    // new user only
      { profileid: 'ghost', name: 'Ghost' },                        // in neither
    ]);
    expect(() => c.exportParticipants()).not.toThrow();
    const rows = csv();
    expect(rows.length).toBe(3);
    expect(rows[0]['Email']).toBe('e1@x.com');
    expect(rows[0]['Active Journey']).toBe('Journey A');
    expect(rows[1]['Email']).toBe('n1@x.com');
    expect(rows[1]['Phone']).toBe('222');
    expect(rows[2]['Email']).toBe('');
  });
});
