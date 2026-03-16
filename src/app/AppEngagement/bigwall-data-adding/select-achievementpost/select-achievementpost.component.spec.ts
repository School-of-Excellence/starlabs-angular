import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectAchievementpostComponent } from './select-achievementpost.component';

describe('SelectAchievementpostComponent', () => {
  let component: SelectAchievementpostComponent;
  let fixture: ComponentFixture<SelectAchievementpostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectAchievementpostComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectAchievementpostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
