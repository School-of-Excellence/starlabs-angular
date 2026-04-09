import { TestBed } from '@angular/core/testing';

import { DeepAudioFilterService } from './deep-audio-filter.service';

describe('DeepAudioFilterService', () => {
  let service: DeepAudioFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeepAudioFilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
