import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicStudioComponent } from './dynamic-studio.component';

describe('DynamicStudioComponent', () => {
  let component: DynamicStudioComponent;
  let fixture: ComponentFixture<DynamicStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DynamicStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
