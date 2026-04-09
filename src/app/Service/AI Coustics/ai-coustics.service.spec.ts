import { TestBed } from '@angular/core/testing';

import { AiCousticsService } from './ai-coustics.service';

describe('AiCousticsService', () => {
  let service: AiCousticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiCousticsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
