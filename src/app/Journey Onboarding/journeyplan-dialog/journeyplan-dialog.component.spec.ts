import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyplanDialogComponent } from './journeyplan-dialog.component';

describe('JourneyplanDialogComponent', () => {
  let component: JourneyplanDialogComponent;
  let fixture: ComponentFixture<JourneyplanDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyplanDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyplanDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
