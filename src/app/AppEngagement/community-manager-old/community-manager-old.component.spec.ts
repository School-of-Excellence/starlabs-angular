import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommunityManagerOldComponent } from './community-manager-old.component';

describe('CommunityManagerOldComponent', () => {
  let component: CommunityManagerOldComponent;
  let fixture: ComponentFixture<CommunityManagerOldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunityManagerOldComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CommunityManagerOldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
