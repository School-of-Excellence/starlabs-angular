import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddTagsComponent } from './addtags.component';
describe('AddtagsComponent', () => {
  let component: AddTagsComponent;
  let fixture: ComponentFixture<AddTagsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddTagsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddTagsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
