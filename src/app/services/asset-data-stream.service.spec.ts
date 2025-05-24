import { TestBed } from '@angular/core/testing';

import { AssetDataStreamService } from './asset-data-stream.service';

describe('AssetDataStreamService', () => {
  let service: AssetDataStreamService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AssetDataStreamService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
