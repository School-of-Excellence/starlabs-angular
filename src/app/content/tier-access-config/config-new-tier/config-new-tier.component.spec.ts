import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigNewTierComponent } from './config-new-tier.component';

describe('ConfigNewTierComponent', () => {
  let component: ConfigNewTierComponent;
  let fixture: ComponentFixture<ConfigNewTierComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfigNewTierComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfigNewTierComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
