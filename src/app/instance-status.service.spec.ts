import { TestBed } from '@angular/core/testing';

import { InstanceStatusService } from './instance-status.service';

describe('InstanceStatusService', () => {
  let service: InstanceStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InstanceStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
