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
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;

    // Set canvas dimensions with increased height
    canvas.width = 1200;
    canvas.height = 700;  // Increased from 500 to 700

    // Color generation function
    const getColor = (index: number, total: number, alpha = 1) => {
        const hue = (index * 360 / total) % 360;
        return `hsla(${hue}, 70%, 50%, ${alpha})`;
    };

    // Check if readings are text-based or numerical
    const firstReading = this.assetReadings[0]?.reading[measurementType];
    const isTextData = typeof firstReading === 'string' && isNaN(Number(firstReading));

    // Convert to IST and group by date
    const dateMap = new Map<string, {dates: Date[], values: any[]}>();
   
    this.assetReadings.forEach(r => {
        const date = new Date(r.timestamp);
        // IST conversion (UTC+5:30)
        date.setHours(date.getHours() + 5);
        date.setMinutes(date.getMinutes() + 30);
       
        const dateKey = date.toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
       
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, {dates: [], values: []});
        }
        dateMap.get(dateKey)!.dates.push(date);
        dateMap.get(dateKey)!.values.push(r.reading[measurementType]);
    });

    // For text data (statuses) - use stacked bar chart
    if (isTextData) {
        const statusCountMap = new Map<string, number[]>();
        const allStatuses = [...new Set(this.assetReadings.map(r => r.reading[measurementType]))];

        allStatuses.forEach(status => {
            statusCountMap.set(status, Array(dateMap.size).fill(0));
        });

        let dateIndex = 0;
        dateMap.forEach((data, dateKey) => {
            data.values.forEach(value => {
                const currentCount = statusCountMap.get(value) || [];
                currentCount[dateIndex] = (currentCount[dateIndex] || 0) + 1;
                statusCountMap.set(value, currentCount);
            });
            dateIndex++;
        });

        const datasets = Array.from(statusCountMap.entries()).map(([status, counts], i) => {
            const color = getColor(i, statusCountMap.size);
            return {
                label: status,
                data: counts,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                stack: 'stack1'
            };
        });

        const config: ChartConfiguration<'bar'> = {
            type: 'bar',
            data: {
                labels: Array.from(dateMap.keys()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Date (IST)'
                        }
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Count'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `${measurementType} Status Distribution (IST)`,
                        font: { size: 16 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    },
                    legend: {
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'rect',
                            padding: 20,
                            font: { size: 12 }
                        }
                    }
                }
            }
        };

        if (this.measurementCharts[measurementType]) {
            this.measurementCharts[measurementType].destroy();
        }
        this.measurementCharts[measurementType] = new Chart(canvas, config);
        return;
    }

    // Numerical data - line chart with points removed
    const datasets = Array.from(dateMap.entries()).map(([dateKey, data], i) => {
        const color = getColor(i, dateMap.size);
        return {
            label: dateKey,
            data: data.values,
            borderColor: color,
            backgroundColor: getColor(i, dateMap.size, 0.2),
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 0,  // Removed points by setting radius to 0
            pointHoverRadius: 0,  // Also remove hover points
            fill: true
        };
    });

    const allDates = Array.from(dateMap.values())[0]?.dates || [];
    const labels = allDates.map(d => 
        d.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).replace(' ', '')
    );

    const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 20,
                    right: 20,
                    top: 20,
                    bottom: 30
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time of Day (IST)',
                        padding: {top: 10}
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 5,
                        callback: function(value: number, index: number) {
                            const step = Math.max(1, Math.floor(labels.length / 10));
                            return index % step === 0 ? labels[index] : '';
                        },
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: measurementType,
                        padding: {bottom: 10}
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Daily ${measurementType} Patterns (IST)`,
                    padding: { bottom: 20 },
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y}`,
                        title: (items) => items.length ? `Time: ${items[0].label}` : ''
                    },
                    displayColors: true,
                    padding: 10,
                    bodyFont: { size: 12 }
                },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 12 }
                    }
                }
            },
            elements: {
                line: {
                    tension: 0.1  // Smooth lines
                },
                point: {
                    radius: 0  // Ensure no points are shown
                }
            }
        }
    };

    if (this.measurementCharts[measurementType]) {
        this.measurementCharts[measurementType].destroy();
    }
    this.measurementCharts[measurementType] = new Chart(canvas, config);
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