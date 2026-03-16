import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewTemplateDialogComponent } from './view-template-dialog.component';

describe('ViewTemplateDialogComponent', () => {
  let component: ViewTemplateDialogComponent;
  let fixture: ComponentFixture<ViewTemplateDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewTemplateDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ViewTemplateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
