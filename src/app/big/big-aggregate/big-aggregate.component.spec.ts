import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigAggregateComponent } from './big-aggregate.component';

describe('BigAggregateComponent', () => {
  let component: BigAggregateComponent;
  let fixture: ComponentFixture<BigAggregateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigAggregateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigAggregateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
