import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateHealthstoryComponent } from './update-healthstory.component';

describe('UpdateHealthstoryComponent', () => {
  let component: UpdateHealthstoryComponent;
  let fixture: ComponentFixture<UpdateHealthstoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateHealthstoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateHealthstoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
