import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectCommunitypostComponent } from './select-communitypost.component';

describe('SelectCommunitypostComponent', () => {
  let component: SelectCommunitypostComponent;
  let fixture: ComponentFixture<SelectCommunitypostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectCommunitypostComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectCommunitypostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
