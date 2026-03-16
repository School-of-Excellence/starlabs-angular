import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModeDashboardNewComponent } from './mode-dashboard-new.component';

describe('ModeDashboardNewComponent', () => {
  let component: ModeDashboardNewComponent;
  let fixture: ComponentFixture<ModeDashboardNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModeDashboardNewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModeDashboardNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
