// src/app/services/asset-data-stream.service.ts
import { Injectable } from '@angular/core';
import { Observable, Subject, interval } from 'rxjs';
import { switchMap, takeUntil, tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AssetDataStreamService {
  private pollingInterval = 5000; // Default 5 seconds
  private stopPolling$ = new Subject<void>();
  private assetReadingsStream$ = new Subject<any>();
  private assetSummaryStream$ = new Subject<any>();
  private currentAsset: string | null = null;

  constructor(private apiService: ApiService) {}

  /**
   * Start streaming data for a specific asset
   */
  startStreaming(assetName: string, intervalMs?: number): void {
    this.stopPolling(); // Stop any existing streams
    this.currentAsset = assetName;
    
    if (intervalMs) {
      this.pollingInterval = intervalMs;
    }

    // Start the polling interval
    interval(this.pollingInterval)
      .pipe(
        takeUntil(this.stopPolling$),
        switchMap(() => this.fetchAllAssetData(assetName))
      )
      .subscribe({
        error: (err) => console.error('Streaming error:', err)
      });
  }

  /**
   * Stop all current streaming
   */
  stopPolling(): void {
    this.stopPolling$.next();
    this.currentAsset = null;
  }

  /**
   * Get observable for asset readings stream
   */
  getReadingsStream(): Observable<any> {
    return this.assetReadingsStream$.asObservable();
  }

  /**
   * Get observable for asset summary stream
   */
  getSummaryStream(): Observable<any> {
    return this.assetSummaryStream$.asObservable();
  }

  private fetchAllAssetData(assetName: string): Observable<any> {
    return this.apiService.getAssetReadings(assetName)
      .pipe(
        tap(readings => {
          this.assetReadingsStream$.next(readings);
          this.fetchAssetSummary(assetName).subscribe();
        }),
        catchError(err => {
          console.error('Error fetching readings:', err);
          this.assetReadingsStream$.error(err);
          throw err;
        })
      );
  }

  private fetchAssetSummary(assetName: string): Observable<any> {
    return this.apiService.getAssetSummary(assetName)
      .pipe(
        tap(summary => this.assetSummaryStream$.next(summary)),
        catchError(err => {
          console.error('Error fetching summary:', err);
          this.assetSummaryStream$.error(err);
          throw err;
        })
      );
  }
}