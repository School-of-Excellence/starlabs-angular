import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudioPreassignDialogComponent } from './studio-preassign-dialog.component';

describe('StudioPreassignDialogComponent', () => {
  let component: StudioPreassignDialogComponent;
  let fixture: ComponentFixture<StudioPreassignDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudioPreassignDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudioPreassignDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
