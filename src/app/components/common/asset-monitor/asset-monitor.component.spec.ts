import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssetMonitorComponent } from './asset-monitor.component';

describe('AssetMonitorComponent', () => {
  let component: AssetMonitorComponent;
  let fixture: ComponentFixture<AssetMonitorComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssetMonitorComponent]
    });
    fixture = TestBed.createComponent(AssetMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
