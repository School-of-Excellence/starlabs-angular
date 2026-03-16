import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateZoneDetailComponent } from './update-zone-detail.component';

describe('UpdateZoneDetailComponent', () => {
  let component: UpdateZoneDetailComponent;
  let fixture: ComponentFixture<UpdateZoneDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateZoneDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateZoneDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
