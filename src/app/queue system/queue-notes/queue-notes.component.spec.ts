import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueNotesComponent } from './queue-notes.component';

describe('QueueNotesComponent', () => {
  let component: QueueNotesComponent;
  let fixture: ComponentFixture<QueueNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueNotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
