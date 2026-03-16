import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SalesDashboardCloneComponent } from './sales-dashboard-clone.component';

describe('SalesDashboardCloneComponent', () => {
  let component: SalesDashboardCloneComponent;
  let fixture: ComponentFixture<SalesDashboardCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesDashboardCloneComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(SalesDashboardCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
