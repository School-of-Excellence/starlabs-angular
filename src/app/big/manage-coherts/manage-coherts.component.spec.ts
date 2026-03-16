import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageCohertsComponent } from './manage-coherts.component';

describe('ManageCohertsComponent', () => {
  let component: ManageCohertsComponent;
  let fixture: ComponentFixture<ManageCohertsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageCohertsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageCohertsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
