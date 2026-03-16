import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigProfileComponent } from './big-profile.component';

describe('BigProfileComponent', () => {
  let component: BigProfileComponent;
  let fixture: ComponentFixture<BigProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigProfileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
