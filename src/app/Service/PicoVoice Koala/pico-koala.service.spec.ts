import { TestBed } from '@angular/core/testing';

import { PicoKoalaService } from './pico-koala.service';

describe('PicoKoalaService', () => {
  let service: PicoKoalaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PicoKoalaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
