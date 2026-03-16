import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigActivityComponent } from './big-activity.component';

describe('BigActivityComponent', () => {
  let component: BigActivityComponent;
  let fixture: ComponentFixture<BigActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigActivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
