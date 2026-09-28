import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SasPeriodBarComponent } from './sas-period-bar.component';
import { Period, periodOf } from '../sas-logic';

describe('SasPeriodBarComponent', () => {
  let fixture: ComponentFixture<SasPeriodBarComponent>;
  let component: SasPeriodBarComponent;
  let emitted: Period[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SasPeriodBarComponent] }).compileComponents();
    fixture = TestBed.createComponent(SasPeriodBarComponent);
    component = fixture.componentInstance;
    component.period = periodOf('week', new Date(2026, 8, 30));
    emitted = [];
    component.periodChange.subscribe(p => emitted.push(p));
    fixture.detectChanges();
  });

  const click = (id: string) => (fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();

  it('moves a week forward', () => {
    click('sap-next');
    expect(emitted[0].from.getDate()).toBe(5);
    expect(emitted[0].from.getMonth()).toBe(9);
  });

  it('switches to the month holding the current period', () => {
    click('sap-month');
    expect(emitted[0].mode).toBe('month');
    expect(emitted[0].from.getMonth()).toBe(8);
  });

  it('jumps to today', () => {
    click('sap-today');
    expect(emitted[0].from.getTime()).toBe(periodOf('week', new Date()).from.getTime());
  });
});
