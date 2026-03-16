import { TestBed } from '@angular/core/testing';

import { WatiService } from './wati.service';

describe('WatiService', () => {
  let service: WatiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WatiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
