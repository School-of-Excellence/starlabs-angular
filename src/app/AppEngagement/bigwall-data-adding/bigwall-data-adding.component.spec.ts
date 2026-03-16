import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BigwallDataAddingComponent } from './bigwall-data-adding.component';

describe('BigwallDataAddingComponent', () => {
  let component: BigwallDataAddingComponent;
  let fixture: ComponentFixture<BigwallDataAddingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigwallDataAddingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigwallDataAddingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
