import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionWishlistLogComponent } from './evolution-wishlist-log.component';

describe('EvolutionWishlistLogComponent', () => {
  let component: EvolutionWishlistLogComponent;
  let fixture: ComponentFixture<EvolutionWishlistLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionWishlistLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionWishlistLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
