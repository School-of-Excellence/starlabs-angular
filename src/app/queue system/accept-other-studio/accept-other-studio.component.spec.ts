import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcceptOtherStudioComponent } from './accept-other-studio.component';

describe('AcceptOtherStudioComponent', () => {
  let component: AcceptOtherStudioComponent;
  let fixture: ComponentFixture<AcceptOtherStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcceptOtherStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcceptOtherStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
