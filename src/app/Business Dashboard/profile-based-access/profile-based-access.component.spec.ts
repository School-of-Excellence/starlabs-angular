import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfileBasedAccessComponent } from './profile-based-access.component';

describe('ProfileBasedAccessComponent', () => {
  let component: ProfileBasedAccessComponent;
  let fixture: ComponentFixture<ProfileBasedAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileBasedAccessComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProfileBasedAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
