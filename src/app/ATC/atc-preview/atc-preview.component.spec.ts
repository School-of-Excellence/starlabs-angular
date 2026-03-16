import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtcPreviewComponent } from './atc-preview.component';

describe('AtcPreviewComponent', () => {
  let component: AtcPreviewComponent;
  let fixture: ComponentFixture<AtcPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtcPreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AtcPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
