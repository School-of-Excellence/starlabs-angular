import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EISZoomAccountComponent } from './eis-zoom-account.component';

describe('EISZoomAccountComponent', () => {
  let component: EISZoomAccountComponent;
  let fixture: ComponentFixture<EISZoomAccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EISZoomAccountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EISZoomAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
