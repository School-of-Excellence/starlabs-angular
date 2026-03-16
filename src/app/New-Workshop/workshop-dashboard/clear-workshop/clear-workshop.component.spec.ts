import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClearWorkshopComponent } from './clear-workshop.component';

describe('ClearWorkshopComponent', () => {
  let component: ClearWorkshopComponent;
  let fixture: ComponentFixture<ClearWorkshopComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClearWorkshopComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClearWorkshopComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
