import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentUploadVersion2Component } from './content-upload-version2.component';

describe('ContentUploadVersion2Component', () => {
  let component: ContentUploadVersion2Component;
  let fixture: ComponentFixture<ContentUploadVersion2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentUploadVersion2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContentUploadVersion2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
