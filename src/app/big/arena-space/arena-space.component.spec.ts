import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenaSpaceComponent } from './arena-space.component';

describe('ArenaSpaceComponent', () => {
  let component: ArenaSpaceComponent;
  let fixture: ComponentFixture<ArenaSpaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaSpaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenaSpaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
