import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicStudioV2Component } from './dynamic-studio-v2.component';

describe('DynamicStudioV2Component', () => {
  let component: DynamicStudioV2Component;
  let fixture: ComponentFixture<DynamicStudioV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicStudioV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DynamicStudioV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
