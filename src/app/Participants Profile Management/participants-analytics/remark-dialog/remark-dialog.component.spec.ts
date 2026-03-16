import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RemarkDialogComponent } from './remark-dialog.component';

describe('RemarkDialogComponent', () => {
  let component: RemarkDialogComponent;
  let fixture: ComponentFixture<RemarkDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RemarkDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RemarkDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
