import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AelEditDialogComponent } from './ael-edit-dialog.component';

describe('AelEditDialogComponent', () => {
  let component: AelEditDialogComponent;
  let fixture: ComponentFixture<AelEditDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AelEditDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AelEditDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
