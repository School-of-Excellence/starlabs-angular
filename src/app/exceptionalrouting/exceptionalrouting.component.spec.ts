import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExceptionalroutingComponent } from './exceptionalrouting.component';

describe('ExceptionalroutingComponent', () => {
  let component: ExceptionalroutingComponent;
  let fixture: ComponentFixture<ExceptionalroutingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExceptionalroutingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExceptionalroutingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
