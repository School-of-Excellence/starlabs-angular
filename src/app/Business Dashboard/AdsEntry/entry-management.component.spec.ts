import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntryManagementComponent } from './entry-management.component';

describe('EntryManagementComponent', () => {
  let component: EntryManagementComponent;
  let fixture: ComponentFixture<EntryManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntryManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EntryManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
