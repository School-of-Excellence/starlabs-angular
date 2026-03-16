import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignProcedureStudioComponent } from './assign-procedure-studio.component';

describe('AssignProcedureStudioComponent', () => {
  let component: AssignProcedureStudioComponent;
  let fixture: ComponentFixture<AssignProcedureStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignProcedureStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignProcedureStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
