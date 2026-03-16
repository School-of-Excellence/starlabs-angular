import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApproveOfftimeComponent } from './approve-offtime.component';

describe('ApproveOfftimeComponent', () => {
  let component: ApproveOfftimeComponent;
  let fixture: ComponentFixture<ApproveOfftimeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApproveOfftimeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ApproveOfftimeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
