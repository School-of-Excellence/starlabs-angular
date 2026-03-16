import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutiomMappingAddComponent } from './evolutiom-mapping-add.component';

describe('EvolutiomMappingAddComponent', () => {
  let component: EvolutiomMappingAddComponent;
  let fixture: ComponentFixture<EvolutiomMappingAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutiomMappingAddComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutiomMappingAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
