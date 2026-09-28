import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecialistAppointmentStudioComponent, NAV } from './specialist-appointment-studio.component';
import { SpecialistAppointmentService } from './specialist-appointment.service';
import { availableViews, resolveViewRole } from './sas-logic';

describe('SpecialistAppointmentStudioComponent', () => {
  let fixture: ComponentFixture<SpecialistAppointmentStudioComponent>;
  let component: SpecialistAppointmentStudioComponent;

  /* template '' skips rendering the tabs (they need Firestore); leave it undefined to render the shell. */
  async function make(roles: Record<string, any>, template?: string) {
    const fake = { roles, views: availableViews(roles), viewRole: resolveViewRole(roles), init: () => Promise.resolve() };
    await TestBed.configureTestingModule({ imports: [SpecialistAppointmentStudioComponent] })
      .overrideComponent(SpecialistAppointmentStudioComponent, {
        set: { providers: [{ provide: SpecialistAppointmentService, useValue: fake }], ...(template != null ? { template } : {}) },
      })
      .compileComponents();
    fixture = TestBed.createComponent(SpecialistAppointmentStudioComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();
  }

  it('gives each role its own nav', () => {
    expect(NAV.cw.map(n => n.tab)).toEqual(['home']);
    expect(NAV.mentor.map(n => n.tab)).toEqual(['home', 'team']);
    expect(NAV.ah.map(n => n.tab)).toEqual(['overview', 'mentors', 'util', 'book', 'settings']);
  });

  it('opens A&H on Overview', async () => {
    await make({ scheduler: true }, '');
    expect(component.tab).toBe('overview');
    expect(component.nav.length).toBe(5);
  });

  it('opens a mentor with a product on Home', async () => {
    await make({ mentor: true, productowner: ['EIS'] }, '');
    expect(component.viewRole).toBe('mentor');
    expect(component.tab).toBe('home');
  });

  it('View as lists every view the user holds a role for, and switches', async () => {
    await make({ mentor: true, productowner: ['EIS'], admin: true, eis: true }, '');
    expect(component.views).toEqual(['mentor', 'ah', 'cw']);
    component.setView('ah');
    expect(component.tab).toBe('overview');
    component.setView('cw');
    expect(component.nav.map(n => n.tab)).toEqual(['home']);
  });

  it('opens a mentor with no product on their other view', async () => {
    await make({ mentor: true, eis: true }, '');
    expect(component.viewRole).toBe('cw');
    component.setView('mentor');
    expect(component.noProduct).toBeTrue();
    expect(component.nav.length).toBe(0);
  });

  it('Mentor view without a product says no product owner is assigned', async () => {
    await make({ mentor: true });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="sas-no-product"]')?.textContent).toContain('No product owner is assigned to you');
  });

  it('shows the no-role message without a scheduling role', async () => {
    await make({ participant: true });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="sas-no-role"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="sas-nav"]')).toBeNull();
  });
});
