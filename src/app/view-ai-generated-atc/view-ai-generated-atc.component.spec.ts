import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewAiGeneratedAtcComponent } from './view-ai-generated-atc.component';

describe('ViewAiGeneratedAtcComponent', () => {
  let component: ViewAiGeneratedAtcComponent;
  let fixture: ComponentFixture<ViewAiGeneratedAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewAiGeneratedAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewAiGeneratedAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
