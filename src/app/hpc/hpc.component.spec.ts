import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HPCComponent } from './hpc.component';

describe('HPCComponent', () => {
  let component: HPCComponent;
  let fixture: ComponentFixture<HPCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HPCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HPCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
