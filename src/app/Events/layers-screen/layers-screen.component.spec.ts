import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayersScreenComponent } from './layers-screen.component';

describe('LayersScreenComponent', () => {
  let component: LayersScreenComponent;
  let fixture: ComponentFixture<LayersScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayersScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayersScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
