import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigActivityLogComponent } from './big-activity-log.component';

describe('BigActivityLogComponent', () => {
  let component: BigActivityLogComponent;
  let fixture: ComponentFixture<BigActivityLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigActivityLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigActivityLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
