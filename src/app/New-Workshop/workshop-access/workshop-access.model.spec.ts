import { WorkshopAccess, readAdminLists, EMPTY_ADMIN_LISTS } from './workshop-access.model';

/**
 * Clear (operator 2026-11-12): only the shared clear list or the workshop's own Clear tick gives it.
 * Full dashboard access does not — and the clear list does not open a dashboard on its own.
 */
describe('WorkshopAccess — Clear', () => {
  const admins = ['admin', 'adminClear'];
  const clearList = ['adminClear', 'listOnly', 'grantedOther'];
  const grants: any = { ticked: ['qanda', 'clear'], grantedOther: ['export'], plain: ['qanda'] };
  const access = (id: string) => new WorkshopAccess(id, grants, admins, clearList);

  it('full dashboard access alone does not give Clear, but still gives everything else', () => {
    const a = access('admin');
    expect(a.can('clear')).toBe(false);
    expect(a.can('enroll')).toBe(true);
    expect(a.can('diagnose')).toBe(true);
    expect(a.keys).not.toContain('clear');
    expect(a.isLockedOut).toBe(false);
  });

  it('the clear list gives Clear to a full-access person', () => {
    expect(access('adminClear').can('clear')).toBe(true);
    expect(access('adminClear').keys).toContain('clear');
  });

  it("this workshop's own Clear tick gives Clear", () => {
    const a = access('ticked');
    expect(a.can('clear')).toBe(true);
    expect(a.can('diagnose')).toBe(false);
    expect(a.keys).toEqual(['qanda', 'clear']);
  });

  it('the clear list adds Clear where the person can already get in', () => {
    const a = access('grantedOther');
    expect(a.can('clear')).toBe(true);
    expect(a.can('export')).toBe(true);
    expect(a.isLockedOut).toBe(false);
  });

  it('the clear list does not open a dashboard on its own', () => {
    expect(access('listOnly').isLockedOut).toBe(true);
  });

  it('nobody else gets Clear', () => {
    expect(access('plain').can('clear')).toBe(false);
    expect(access('stranger').can('clear')).toBe(false);
    expect(new WorkshopAccess(null, grants, admins, clearList).can('clear')).toBe(false);
    expect(new WorkshopAccess('adminClear', grants, admins).can('clear')).toBe(false);   // no list passed
  });

  it('reads the clear list from the shared document, defensively', () => {
    expect(readAdminLists({ clearworkshop: ['a', ' a ', '', 'b'] }).clearWorkshop).toEqual(['a', 'b']);
    expect(readAdminLists({ clearworkshop: 'a' }).clearWorkshop).toEqual([]);
    expect(readAdminLists(null).clearWorkshop).toEqual([]);
    expect(EMPTY_ADMIN_LISTS.clearWorkshop).toEqual([]);
  });
});
