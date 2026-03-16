import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigLevelComponent } from './big-level.component';

describe('BigLevelComponent', () => {
  let component: BigLevelComponent;
  let fixture: ComponentFixture<BigLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
