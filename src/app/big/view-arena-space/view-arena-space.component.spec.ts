import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewArenaSpaceComponent } from './view-arena-space.component';

describe('ViewArenaSpaceComponent', () => {
  let component: ViewArenaSpaceComponent;
  let fixture: ComponentFixture<ViewArenaSpaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewArenaSpaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewArenaSpaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
