import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtcmodelLevelConfigComponent } from './atcmodel-level-config.component';

describe('AtcmodelLevelConfigComponent', () => {
  let component: AtcmodelLevelConfigComponent;
  let fixture: ComponentFixture<AtcmodelLevelConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtcmodelLevelConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AtcmodelLevelConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
