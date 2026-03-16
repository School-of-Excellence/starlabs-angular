import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddOfftimeComponent } from './add-offtime.component';

describe('AddOfftimeComponent', () => {
  let component: AddOfftimeComponent;
  let fixture: ComponentFixture<AddOfftimeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddOfftimeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddOfftimeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
