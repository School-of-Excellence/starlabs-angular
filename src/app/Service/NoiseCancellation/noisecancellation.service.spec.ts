import { TestBed } from '@angular/core/testing';

import { NoiseCancellationService } from '../NoiseCancellation/noisecancellation.service';

describe('NoisecancellationService', () => {
  let service: NoiseCancellationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NoiseCancellationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
