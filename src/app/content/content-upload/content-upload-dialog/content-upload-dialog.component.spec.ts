import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentUploadDialogComponent } from './content-upload-dialog.component';

describe('ContentUploadDialogComponent', () => {
  let component: ContentUploadDialogComponent;
  let fixture: ComponentFixture<ContentUploadDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentUploadDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContentUploadDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
