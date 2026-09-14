import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommunicationGridPlannerComponent } from './communication-grid-planner.component';

describe('CommunicationGridPlannerComponent', () => {
  let component: CommunicationGridPlannerComponent;
  let fixture: ComponentFixture<CommunicationGridPlannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunicationGridPlannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CommunicationGridPlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
