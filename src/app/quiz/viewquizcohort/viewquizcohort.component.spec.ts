import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewquizcohortComponent } from './viewquizcohort.component';

describe('ViewquizcohortComponent', () => {
  let component: ViewquizcohortComponent;
  let fixture: ComponentFixture<ViewquizcohortComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewquizcohortComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewquizcohortComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
