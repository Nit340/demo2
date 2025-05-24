// src/app/components/common/asset-monitor/asset-monitor.component.ts
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AssetDataStreamService } from '../../../services/asset-data-stream.service';

@Component({
  selector: 'app-asset-monitor',
  templateUrl: './asset-monitor.component.html',
  styleUrls: ['./asset-monitor.component.css']
})
export class AssetMonitorComponent implements OnInit, OnDestroy {
  @Input() assetName: string; // Receive asset name from parent
  currentReadings: any;
  currentSummary: any;
  private destroy$ = new Subject<void>();

  constructor(private assetStream: AssetDataStreamService) {}

  ngOnInit() {
    if (this.assetName) {
      this.startMonitoring(this.assetName);
    }
  }

  startMonitoring(assetName: string) {
    this.assetStream.startStreaming(assetName);
    
    this.assetStream.getReadingsStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(readings => {
        this.currentReadings = readings;
      });
    
    this.assetStream.getSummaryStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(summary => {
        this.currentSummary = summary;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.assetStream.stopPolling();
  }
}