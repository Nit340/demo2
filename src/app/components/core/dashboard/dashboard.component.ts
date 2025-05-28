import { Component, OnDestroy, OnInit } from '@angular/core';
import { map } from 'lodash';
import { interval, Subject } from 'rxjs';
import { takeWhile, takeUntil } from 'rxjs/operators';
import { AssetDataService } from '../../../services/asset-data.Service';
import { DateFormatterPipe } from '../../../pipes';
import { AlertService, PingService, StatisticsService,AssetsService} from '../../../services';
import { DocService } from '../../../services/doc.service';
import Utils, { CHART_COLORS, GRAPH_REFRESH_INTERVAL, STATS_HISTORY_TIME_FILTER } from '../../../utils';
import enIN from 'date-fns/locale/en-IN';

import 'chartjs-adapter-date-fns'; // Must be imported AFTER Chart.js
import { Chart, ChartTypeRegistry, ChartConfiguration, registerables } from 'chart.js';
Chart.register(...registerables);

interface Reading {
  timestamp: string;
  reading: {
    [key: string]: number; // Measurement types (e.g., temperature) and their values
  };
}

// Define default graphs with unique colors
const DEFAULT_GRAPHS = [
  { key: 'READINGS', color: CHART_COLORS.orange },  // Now first
  { key: 'BUFFERED', color: CHART_COLORS.red },
  { key: 'DISCARDED', color: CHART_COLORS.blue },
  { key: 'PURGED', color: CHART_COLORS.green },
  { key: 'UNSENT', color: CHART_COLORS.purple },
  { key: 'UNSNPURGED', color: CHART_COLORS.cyan }
];

const DEFAULT_GRAPH_KEYS = DEFAULT_GRAPHS.map(g => g.key);

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  statistics = [];
  statisticsKeys = [];
  graphsToShow = [];
  public chartOptions: object;
  public refreshInterval = GRAPH_REFRESH_INTERVAL;
  public optedTime;
  DEFAULT_LIMIT = 20;
  private isAlive: boolean;
  destroy$: Subject<boolean> = new Subject<boolean>(); // One chart per measurement type
 private readingCharts: { [key: string]: Chart } = {};
  private measurementCharts: { [key: string]: Chart } = {};

  // Asset Search Properties
  assetSearchTerm: string = '';
  selectedAsset: string = '';
  assetReadings: any[] = [];
  assetLoading = false;
  assetError = '';

  // Dropdown management
  dropdownOpen: { [key: string]: boolean } = {
    'time-dropdown': false,
    'graph-key-dropdown': false
  };

  constructor(
    private statisticsService: StatisticsService,
    private alertService: AlertService,
    private dateFormatter: DateFormatterPipe,
    private docService: DocService,
     private assetdataService: AssetDataService ,
    private ping: PingService
  ) {
    this.isAlive = true;
    this.ping.refreshIntervalChanged
      .pipe(takeUntil(this.destroy$))
      .subscribe((timeInterval: number) => {
        if (timeInterval === -1) {
          this.isAlive = false;
        }
        this.refreshInterval = timeInterval;
      });
  }

  ngOnInit() {
    // Clear invalid storage format
    const optedGraphStorage = JSON.parse(localStorage.getItem('OPTED_GRAPHS'));
    if (optedGraphStorage != null && typeof (optedGraphStorage[0]) !== 'object') {
      localStorage.removeItem('OPTED_GRAPHS');
    }
    
    this.getStatistics();
    interval(this.refreshInterval)
      .pipe(takeWhile(() => this.isAlive), takeUntil(this.destroy$))
      .subscribe(() => this.refreshGraph());
  }

  // Dropdown methods
  toggleDropDown(dropdownId: string): void {
    this.dropdownOpen[dropdownId] = !this.dropdownOpen[dropdownId];
  }

  // Set time interval
  setTimeInterval(minutes: number): void {
    this.optedTime = minutes;
    this.dropdownOpen['time-dropdown'] = false;
    localStorage.setItem('STATS_HISTORY_TIME_FILTER', minutes.toString());
    this.getStatisticsHistory(minutes.toString());
  }
  

  // Graph selection methods
  isGraphSelected(key: string): boolean {
    return this.graphsToShow.some(g => g.key === key);
  }

  toggleGraphSelection(key: string): void {
    if (this.isGraphSelected(key)) {
      this.graphsToShow = this.graphsToShow.filter(g => g.key !== key);
    } else {
      const stats = this.statistics.find(s => s.key === key);
      if (stats) {
        this.graphsToShow.unshift({
          ...stats,
          color: Utils.getRandomColor(),
          chartType: 'line',
          chartValue: this.getSampleData()
        });
      }
    }
    
    // Save user selections to localStorage (excluding default graphs)
    const userGraphs = this.graphsToShow
      .filter(g => !DEFAULT_GRAPH_KEYS.includes(g.key))
      .map(g => ({ key: g.key, color: g.color }));
    localStorage.setItem('OPTED_GRAPHS', JSON.stringify(userGraphs));
  }

  // Sample data generator
  private getSampleData() {
    return {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Sample Data',
        data: [65, 59, 80, 81, 56, 55],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    };
  }

  public getStatistics(): void {
    this.statisticsService.getStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        // Filter out FOGBENCH data
        this.statistics = data.filter(v => !v.key.toLowerCase().includes('fogbench'));
  
        // Clear existing graphs
        this.graphsToShow = [];
  
        // Load user-selected graphs from localStorage first
        const userSelectedGraphs = JSON.parse(localStorage.getItem('OPTED_GRAPHS')) || [];
        userSelectedGraphs.forEach(selectedGraph => {
          const stats = this.statistics.find(s => s.key === selectedGraph.key);
          if (stats && !DEFAULT_GRAPH_KEYS.includes(selectedGraph.key)) {
            this.graphsToShow.push({
              ...stats,
              color: selectedGraph.color || Utils.getRandomColor()
            });
          }
        });
  
        // Add default graphs after selected graphs
        DEFAULT_GRAPHS.forEach(defaultGraph => {
          const stats = this.statistics.find(s => s.key === defaultGraph.key);
          if (stats) {
            this.graphsToShow.push({
              ...stats,
              color: defaultGraph.color
            });
          }
        });
  
        // Set selectable graphs (for dropdown - exclude defaults)
        this.statisticsKeys = this.statistics
          .filter(s => !DEFAULT_GRAPH_KEYS.includes(s.key))
          .map(s => ({ key: s.key, description: s.key }));
  
        this.getStatisticsHistory(localStorage.getItem('STATS_HISTORY_TIME_FILTER'));
      }, error => this.handleError(error));
  }

  protected getChartOptions() {
    this.chartOptions = {
      animation: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    };
  }

  protected getChartValues(labels: string[], data: number[], color: string) {
    this.getChartOptions();
    return {
      labels,
      datasets: [{
        label: '',
        data,
        backgroundColor: color,
        borderColor: color,
        fill: false,
        lineTension: 0
      }]
    };
  }

  public refreshGraph() {
    this.statisticsService.getStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        this.statistics = data.filter(value => !value.key.toLowerCase().includes('fogbench'));
        this.graphsToShow = this.graphsToShow.map(graph => {
          const updatedStats = this.statistics.find(s => s.key === graph.key);
          return updatedStats ? { ...graph, value: updatedStats.value } : graph;
        });
        this.refreshStatisticsHistory();
      }, error => this.handleError(error));
  }

  public getStatisticsHistory(time = null): void {
    if (time == null) {
      localStorage.setItem('STATS_HISTORY_TIME_FILTER', STATS_HISTORY_TIME_FILTER);
    } else {
      localStorage.setItem('STATS_HISTORY_TIME_FILTER', time);
    }
    this.optedTime = localStorage.getItem('STATS_HISTORY_TIME_FILTER');
    this.statisticsService.getStatisticsHistory(this.optedTime, null, null)
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        this.graphsToShow.forEach(graph => {
          const labels = [];
          const record = map(data['statistics'], graph.key).reverse();
          let history_ts = map(data['statistics'], 'history_ts');
          history_ts = history_ts.reverse();
          history_ts.forEach(ts => {
            ts = this.dateFormatter.transform(ts, 'HH:mm:ss');
            labels.push(ts);
          });
          graph.chartValue = this.getChartValues(labels, record, graph.color);
          graph.chartType = 'line';
          graph.limit = this.DEFAULT_LIMIT;
        });
      }, error => this.handleError(error));
  }

  public refreshStatisticsHistory(): void {
    this.statisticsService.getStatisticsHistory(this.optedTime)
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        this.graphsToShow.forEach(graph => {
          const labels = [];
          const record = map(data['statistics'], graph.key).reverse();
          let history_ts = map(data['statistics'], 'history_ts');
          history_ts = history_ts.reverse();
          history_ts.forEach(ts => {
            ts = this.dateFormatter.transform(ts, 'HH:mm:ss');
            labels.push(ts);
          });
          graph.chartValue = this.getChartValues(labels, record, graph.color);
        });
      }, error => this.handleError(error));
  }

  private handleError(error: any) {
    if (error.status === 0) {
      console.log('Service down', error);
    } else {
      this.alertService.error(error.statusText);
    }
  }

  goToLink() {
    const urlSlug = 'gui.html#fledge-dashboard';
    this.docService.goToViewQuickStartLink(urlSlug);
  }

  public ngOnDestroy(): void {
    this.isAlive = false;
    this.destroy$.next(true);
    this.destroy$.unsubscribe();
   this.clearCharts();
  }
   // Updated Asset Search Methods
  searchAsset(): void {
    if (this.assetSearchTerm.trim()) {
      this.selectedAsset = this.assetSearchTerm.trim();
      this.fetchAssetReadings();
    }
  }
 fetchAssetReadings(): void {
    this.assetLoading = true;
    this.assetError = '';
    const MAX_LIMIT = 100000;
    
    this.assetdataService.getAssetReadings(this.selectedAsset, MAX_LIMIT)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (data: any) => {
          this.assetReadings = Array.isArray(data) ? data : [data];
          this.createMeasurementCharts();
          this.assetLoading = false;
        },
        (error) => {
          this.assetError = error.message || 'Failed to fetch all readings';
          this.assetLoading = false;
        }
      );
  }

  createMeasurementCharts(): void {
    // Destroy existing charts first
    Object.values(this.measurementCharts).forEach(chart => chart.destroy());
    this.measurementCharts = {};

    // Get all measurement types (e.g., temperature, humidity)
    const measurementTypes = this.getMeasurementTypes();
    
    // Create one chart per measurement type
    measurementTypes.forEach(type => {
      const canvasId = `chart-${type}`;
      setTimeout(() => {
        this.createChartForMeasurement(canvasId, type);
      }, 0);
    });
  }

  getMeasurementTypes(): string[] {
    const types = new Set<string>();
    this.assetReadings.forEach(reading => {
      Object.keys(reading.reading).forEach(key => types.add(key));
    });
    return Array.from(types);
  }
createChartForMeasurement(canvasId: string, measurementType: string): void {
    const ctx = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!ctx) return;

    // 1. Prepare data (original timestamps)
    const timestamps = this.assetReadings.map(r => new Date(r.timestamp));
    const data = this.assetReadings.map(r => r.reading[measurementType] || null);

    // 2. Pre-format X-axis labels in IST (same as tooltip)
    const xAxisLabels = timestamps.map(date => 
        date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
    );

    const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
            labels: xAxisLabels, // Use pre-formatted IST labels
            datasets: [{
                label: measurementType,
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'category', // Switch to category axis (uses pre-formatted labels)
                    title: {
                        display: true,
                        text: 'Time (IST)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: measurementType
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${measurementType} over Time (IST)`
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${measurementType}: ${context.parsed.y}`,
                        title: (items) => {
                            if (!items.length) return '';
                            return new Date(timestamps[items[0].dataIndex]).toLocaleString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                dateStyle: 'full',
                                timeStyle: 'short'
                            });
                        }
                    }
                }
            }
        }
    };

    // Destroy old chart if it exists
    if (this.measurementCharts[measurementType]) {
        this.measurementCharts[measurementType].destroy();
    }

    // Create new chart
    this.measurementCharts[measurementType] = new Chart(ctx, config);
}
  clearCharts(): void {
    // Destroy reading charts
    Object.values(this.readingCharts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.readingCharts = {};

    // Destroy measurement charts
    Object.values(this.measurementCharts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.measurementCharts = {};
  }



  clearAssetSearch(): void {
    this.selectedAsset = '';
    this.assetSearchTerm = '';
    this.assetReadings = [];
    this.assetError = '';
     // Clean up charts
    Object.values(this.readingCharts).forEach(chart => chart.destroy());
    this.readingCharts = {};
  }
    
}