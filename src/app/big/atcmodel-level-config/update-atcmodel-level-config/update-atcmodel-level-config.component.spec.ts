import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateAtcmodelLevelConfigComponent } from './update-atcmodel-level-config.component';

describe('UpdateAtcmodelLevelConfigComponent', () => {
  let component: UpdateAtcmodelLevelConfigComponent;
  let fixture: ComponentFixture<UpdateAtcmodelLevelConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateAtcmodelLevelConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateAtcmodelLevelConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
