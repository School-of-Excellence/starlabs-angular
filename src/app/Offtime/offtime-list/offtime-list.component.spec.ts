import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OfftimeListComponent } from './offtime-list.component';

describe('OfftimeListComponent', () => {
  let component: OfftimeListComponent;
  let fixture: ComponentFixture<OfftimeListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfftimeListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OfftimeListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
