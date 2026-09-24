import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewusersprofileComponent } from './newusersprofile.component';

describe('NewusersprofileComponent', () => {
  let component: NewusersprofileComponent;
  let fixture: ComponentFixture<NewusersprofileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewusersprofileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewusersprofileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
