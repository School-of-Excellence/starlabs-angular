import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditrecommendedplaylistComponent } from './editrecommendedplaylist.component';

describe('EditrecommendedplaylistComponent', () => {
  let component: EditrecommendedplaylistComponent;
  let fixture: ComponentFixture<EditrecommendedplaylistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditrecommendedplaylistComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditrecommendedplaylistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
