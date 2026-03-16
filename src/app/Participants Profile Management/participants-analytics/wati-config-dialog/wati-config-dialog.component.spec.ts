import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatiConfigDialogComponent } from './wati-config-dialog.component';

describe('WatiConfigDialogComponent', () => {
  let component: WatiConfigDialogComponent;
  let fixture: ComponentFixture<WatiConfigDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatiConfigDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WatiConfigDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
