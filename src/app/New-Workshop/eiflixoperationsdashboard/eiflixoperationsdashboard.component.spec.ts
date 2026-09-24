import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EiflixoperationsdashboardComponent } from './eiflixoperationsdashboard.component';

describe('EiflixoperationsdashboardComponent', () => {
  let component: EiflixoperationsdashboardComponent;
  let fixture: ComponentFixture<EiflixoperationsdashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EiflixoperationsdashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EiflixoperationsdashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
