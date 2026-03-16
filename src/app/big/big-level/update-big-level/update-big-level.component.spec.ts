import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateBigLevelComponent } from './update-big-level.component';

describe('UpdateBigLevelComponent', () => {
  let component: UpdateBigLevelComponent;
  let fixture: ComponentFixture<UpdateBigLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateBigLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateBigLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
