import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommunityManagerComponent } from './community-manager.component';

describe('CommunityManagerComponent', () => {
  let component: CommunityManagerComponent;
  let fixture: ComponentFixture<CommunityManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunityManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CommunityManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
