import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigLadderComponent } from './big-ladder.component';

describe('BigLadderComponent', () => {
  let component: BigLadderComponent;
  let fixture: ComponentFixture<BigLadderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigLadderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigLadderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
