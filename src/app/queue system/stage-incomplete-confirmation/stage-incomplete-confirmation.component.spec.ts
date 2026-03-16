import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StageIncompleteConfirmationComponent } from './stage-incomplete-confirmation.component';

describe('StageIncompleteConfirmationComponent', () => {
  let component: StageIncompleteConfirmationComponent;
  let fixture: ComponentFixture<StageIncompleteConfirmationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StageIncompleteConfirmationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StageIncompleteConfirmationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
