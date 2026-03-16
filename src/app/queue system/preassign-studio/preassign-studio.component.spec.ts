import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreassignStudioComponent } from './preassign-studio.component';

describe('PreassignStudioComponent', () => {
  let component: PreassignStudioComponent;
  let fixture: ComponentFixture<PreassignStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreassignStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PreassignStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
