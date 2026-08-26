import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaigndashboardComponent } from './campaigndashboard.component';

describe('CampaigndashboardComponent', () => {
  let component: CampaigndashboardComponent;
  let fixture: ComponentFixture<CampaigndashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaigndashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CampaigndashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
