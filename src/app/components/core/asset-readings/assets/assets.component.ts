import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { orderBy } from 'lodash';
import { interval, Subject } from 'rxjs';
import { takeWhile, takeUntil } from 'rxjs/operators';
import { DialogService } from '../../../common/confirmation-dialog/dialog.service';

import { AlertService, AssetsService, SharedService, PingService, GenerateCsvService, ProgressBarService, RolesService } from '../../../../services';
import { DocService } from '../../../../services/doc.service';
import { MAX_INT_SIZE, POLLING_INTERVAL } from '../../../../utils';
import { ReadingsGraphComponent } from '../readings-graph/readings-graph.component';
import { DeveloperFeaturesService } from '../../../../services/developer-features.service';

@Component({
  selector: 'app-assets',
  templateUrl: './assets.component.html',
  styleUrls: ['./assets.component.css']
})
export class AssetsComponent implements OnInit, OnDestroy {
  MAX_RANGE = MAX_INT_SIZE / 2;
  assets = [];
  public refreshInterval = POLLING_INTERVAL;
  public showSpinner = false;
  public isAlive: boolean;
  assetReadings = [];
  selectedAssetName = '';

  @ViewChild(ReadingsGraphComponent, { static: true }) readingsGraphComponent: ReadingsGraphComponent;

  destroy$: Subject<boolean> = new Subject<boolean>();

  constructor(private assetService: AssetsService,
    private alertService: AlertService,
    private dialogService: DialogService,
    private generateCsvService: GenerateCsvService,
    private docService: DocService,
    public developerFeaturesService: DeveloperFeaturesService,
    private ngProgress: ProgressBarService,
    private ping: PingService,
    private sharedService: SharedService,
    public rolesService: RolesService) {
    this.isAlive = true;
    this.ping.pingIntervalChanged
      .pipe(takeUntil(this.destroy$))
      .subscribe((timeInterval: number) => {
        if (timeInterval === -1) {
          this.isAlive = false;
        }
        this.refreshInterval = timeInterval;
      });
  }

  ngOnInit() {
    this.showLoadingSpinner();
    this.getAsset();
    interval(this.refreshInterval)
      .pipe(takeWhile(() => this.isAlive), takeUntil(this.destroy$)) // only fires when component is alive
      .subscribe(() => {
        this.getAsset();
      });
  }

  public getAsset(showProgressBar = true): void {
    /** request started */
    if (!this.isAlive && showProgressBar) {
      this.ngProgress.start();
    }
    this.assetService.getAsset()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (data: any[]) => {
          /** request completed */
          this.ngProgress.done();
          this.assets = data;
          this.assets = orderBy(this.assets, ['assetCode'], ['asc']);
          this.sharedService.assets.next(this.assets);
          this.hideLoadingSpinner();
        },
        error => {
          /** request completed but error */
          this.ngProgress.done();
          this.hideLoadingSpinner();
          if (error.status === 0) {
            console.log('service down ', error);
          } else {
            this.alertService.error(error.statusText);
          }
        });
  }

 getAssetReadings(assetCode: string, recordCount: number, startDate?: Date, endDate?: Date) {
  this.assetReadings = [];
  const fileName = assetCode + '-readings';
  
  if (recordCount === 0) {
    this.alertService.error('No reading to export.', true);
    return;
  }

  this.alertService.activityMessage('Exporting readings to ' + fileName, true);
  
  let limit = recordCount;
  let offset = 0;
  let isLastRequest = false;

  if (recordCount > this.MAX_RANGE) {
    let chunkCount;
    let lastChunkLimit;
    limit = this.MAX_RANGE;
    chunkCount = Math.ceil(recordCount / this.MAX_RANGE);
    lastChunkLimit = (recordCount % this.MAX_RANGE);
    
    if (lastChunkLimit === 0) {
      lastChunkLimit = this.MAX_RANGE;
    }
    
    for (let j = 0; j < chunkCount; j++) {
      if (j !== 0) {
        offset = (this.MAX_RANGE * j);
      }
      if (j === (chunkCount - 1)) {
        limit = lastChunkLimit;
        isLastRequest = true;
      }
      this.exportReadings(assetCode, limit, offset, isLastRequest, fileName, startDate, endDate);
    }
  } else {
    this.exportReadings(assetCode, limit, offset, true, fileName, startDate, endDate);
  }
}

exportReadings(
  assetCode: any,
  limit: number,
  offset: number,
  lastRequest: boolean,
  fileName: string,
  startDate?: Date,
  endDate?: Date
) {
  this.assetService.getAssetReadings(encodeURIComponent(assetCode), limit, offset)
    .pipe(takeUntil(this.destroy$))
    .subscribe(
      (data: any[]) => {
        // Keep the original structure {reading: {...}, timestamp}
        this.assetReadings = this.assetReadings.concat(data);

        if (lastRequest === true) {
          let filteredReadings = this.assetReadings;

          // Apply date filtering if dates are provided
          if (startDate || endDate) {
            filteredReadings = this.assetReadings.filter(item => {
              if (!item.timestamp) return false;
              
              const timestampStr = item.timestamp.split(' ')[0];
              const readingDate = new Date(timestampStr);
              const filterStart = startDate ? new Date(startDate.toISOString().split('T')[0]) : null;
              const filterEnd = endDate ? new Date(endDate.toISOString().split('T')[0]) : null;

              return (
                (!filterStart || readingDate >= filterStart) &&
                (!filterEnd || readingDate <= filterEnd)
              );
            });
          }

          console.log('Final data to export:', filteredReadings);
          
          if (filteredReadings.length === 0) {
            this.alertService.warning('No data matches the selected date range');
            return;
          }

          this.generateCsvService.download(filteredReadings, fileName, 'asset');
          this.assetReadings = [];
        }
      },
      error => {
        console.error('Error fetching asset readings:', error);
        this.alertService.error('Failed to export readings');
      }
    );
}
  // Add these variables
showDateFilter: string | null = null; // Tracks which asset's filter is open
startDate?: Date;
endDate?: Date;

// Toggle date filter menu
toggleDateFilter(assetCode: string) {
  this.showDateFilter = this.showDateFilter === assetCode ? null : assetCode;
}

// Add these temporary variables
tempStartDate: string;
tempEndDate: string;

exportWithDateFilter(assetCode: string, count: number) {
  // Validate dates
  if (!this.tempStartDate || !this.tempEndDate) {
    this.alertService.error('Please select both start and end dates');
    return;
  }

  // Convert to Date objects
  const startDate = new Date(this.tempStartDate);
  const endDate = new Date(this.tempEndDate);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    this.alertService.error('Invalid date format');
    return;
  }

  if (startDate > endDate) {
    this.alertService.error('Start date cannot be after end date');
    return;
  }

  // Reset and export
  this.assetReadings = []; // Clear previous data
  this.getAssetReadings(assetCode, count, startDate, endDate);
}
  purgeAssetData(assetCode) {
    /** request started */
    this.ngProgress.start();
    this.assetService.purgeAssetData(assetCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        () => {
          /** request completed */
          this.ngProgress.done();
          this.alertService.success(`${assetCode}'s  data purged successfully.`);
          this.closeModal('purge-asset-dialog');
          this.getAsset();
        }, error => {
          /** request completed but error */
          this.ngProgress.done();
          if (error.status === 0) {
            console.log('service down ', error);
          } else {
            this.alertService.error(error.statusText);
          }
        });
  }

  /**
  * Open asset chart modal dialog
  */
  public showAssetChart(assetCode) {
    this.readingsGraphComponent.getAssetCode(assetCode);
    this.readingsGraphComponent.toggleModal(true);
  }

  public showLatestReading(assetCode) {
    this.readingsGraphComponent.getAssetLatestReadings(assetCode);
    this.readingsGraphComponent.toggleModal(true);
  }

  public showLoadingSpinner() {
    this.showSpinner = true;
  }

  public hideLoadingSpinner() {
    this.showSpinner = false;
  }

  purgeAllAssetsData() {
    /** request started */
    this.ngProgress.start();
    this.assetService.purgeAllAssetsData()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        () => {
          /** request completed */
          this.ngProgress.done();
          this.alertService.success(`All buffered assets removed successfully.`);
          this.closeModal('purge-all-assets-dialog');
          this.getAsset();
        }, error => {
          /** request completed but error */
          this.ngProgress.done();
          if (error.status === 0) {
            console.log('service down ', error);
          } else {
            this.alertService.error(error.statusText);
          }
        });
  }

  onNotify(event) {
    this.isAlive = event;
    interval(this.refreshInterval)
      .pipe(takeWhile(() => this.isAlive), takeUntil(this.destroy$)) // only fires when component is alive
      .subscribe(() => {
        this.getAsset();
      });
  }

  goToLink() {
    const urlSlug = 'viewing.html';
    this.docService.goToViewQuickStartLink(urlSlug);
  }

  openModal(id: string) {
    this.dialogService.open(id);
  }

  closeModal(id: string) {
    this.dialogService.close(id);
  }

  setAsset(asset: any) {
    this.selectedAssetName = asset.assetCode;
  }

  public ngOnDestroy(): void {
    this.isAlive = false;
    this.destroy$.next(true);
    this.destroy$.unsubscribe();
  }

}