import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsertMessageDialogComponent } from './insert-message-dialog.component';

describe('InsertMessageDialogComponent', () => {
  let component: InsertMessageDialogComponent;
  let fixture: ComponentFixture<InsertMessageDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsertMessageDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsertMessageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
