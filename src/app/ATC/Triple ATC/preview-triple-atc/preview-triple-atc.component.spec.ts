import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreviewTripleAtcComponent } from './preview-triple-atc.component';

describe('PreviewTripleAtcComponent', () => {
  let component: PreviewTripleAtcComponent;
  let fixture: ComponentFixture<PreviewTripleAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreviewTripleAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PreviewTripleAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
