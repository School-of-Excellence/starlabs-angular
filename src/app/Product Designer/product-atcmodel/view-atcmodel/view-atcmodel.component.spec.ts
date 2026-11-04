import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

import { ViewAtcmodelComponent } from './view-atcmodel.component';

// Same isolated DEMO emulator project as the create-atcmodel spec (firestore on 127.0.0.1:8189).
// The table rows are set directly, so these specs don't need the emulator to be running.
const PROJECT = 'demo-atcmodel-unit';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' }, 'atcmodel-view-unit');
const firestore = getFirestore(app);
connectFirestoreEmulator(firestore, '127.0.0.1', 8189);

describe('ViewAtcmodelComponent', () => {
  let component: ViewAtcmodelComponent;
  let fixture: ComponentFixture<ViewAtcmodelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewAtcmodelComponent],
      providers: [
        provideNoopAnimations(),
        { provide: Firestore, useValue: firestore },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewAtcmodelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('forms column lists the configured form names, or None', () => {
    component.atcmodelSubscription?.unsubscribe();
    component.atcmodelData = [
      { id: 'a', atcmodel: 'A', forms: [{ formid: 'f1', filledby: 'participant' }, { formid: 'f2', filledby: 'specialist' }] },
      { id: 'b', atcmodel: 'B', forms: [{ formid: 'f1', filledby: 'participant' }] },
      { id: 'c', atcmodel: 'C' },
    ];
    component.mapFormName = { f1: 'Life Report', f2: 'Clarity Call' };
    component.ngAfterViewInit();
    fixture.detectChanges();
    const cells = Array.from(fixture.nativeElement.querySelectorAll('td.mat-column-forms')).map((td: any) =>
      Array.from(td.querySelectorAll('[data-testid="va-form-name"], [data-testid="va-forms-none"]')).map((e: any) => e.textContent.trim()));
    expect(cells).toEqual([['Life Report', 'Clarity Call'], ['Life Report'], ['None']]);
  });
});
