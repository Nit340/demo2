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
private fetchInterval: any;

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
  selectedDate: string = new Date().toISOString().split('T')[0]; // Default to today

// Add this method to handle date changes
onDateChange(): void {
  this.getMeasurementTypes().forEach(type => {
    this.createChartForMeasurement(`chart-${type}`, type);
  });
}


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
     const storedTime = localStorage.getItem('STATS_HISTORY_TIME_FILTER');
  this.optedTime = storedTime ? parseInt(storedTime, 10) : 60;
    
    this.getStatistics();
    interval(this.refreshInterval)
      .pipe(takeWhile(() => this.isAlive), takeUntil(this.destroy$))
      .subscribe(() => this.refreshGraph());
  }

  // Dropdown methods
  toggleDropDown(dropdownId: string): void {
    this.dropdownOpen[dropdownId] = !this.dropdownOpen[dropdownId];
  }

 // Add this method to your component
convertMinutesToDisplay(minutes: number | string): string {
  // Ensure minutes is a number
  const mins = typeof minutes === 'string' ? parseInt(minutes, 10) : minutes;

  switch (mins) {
    case 10: return '10 minutes';
    case 30: return '30 minutes';
    case 60: return '1 hour';
    case 120: return '2 hours';
    case 360: return '6 hours';
    case 720: return '12 hours';
    case 1440: return '24 hours';
    default: return mins + ' minutes';
  }
}

// Modify your setTimeInterval method to ensure optedTime is a number
setTimeInterval(minutes: number): void {
  this.optedTime = minutes; // Store as number
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

 public getStatisticsHistory(time: string | number = null): void {
  // 1. Handle time parameter and localStorage
  if (time == null) {
    // If no time provided, use default from constants or localStorage
    const storedTime = localStorage.getItem('STATS_HISTORY_TIME_FILTER');
    time = storedTime || STATS_HISTORY_TIME_FILTER;
  }

  // Convert to string for storage and number for component
  const timeString = time.toString();
  const timeNumber = parseInt(timeString, 10);

  // Store in localStorage and component
  localStorage.setItem('STATS_HISTORY_TIME_FILTER', timeString);
  this.optedTime = timeNumber;

  // 2. Make the API call
  this.statisticsService.getStatisticsHistory(timeString, null, null)
    .pipe(takeUntil(this.destroy$))
    .subscribe(
      (data: any) => {
        if (!data || !data.statistics) {
          this.handleError({ statusText: 'Invalid statistics data received' });
          return;
        }

        // 3. Process the data for each graph
        this.graphsToShow.forEach(graph => {
          try {
            // Extract and reverse the data
            const record = map(data.statistics, graph.key).reverse();
            let history_ts = map(data.statistics, 'history_ts').reverse();

            // Prepare labels with formatted timestamps
            const labels = history_ts.map(ts => 
              this.dateFormatter.transform(ts, 'HH:mm:ss')
            );

            // Update the graph data
            graph.chartValue = this.getChartValues(
              labels,
              record,
              graph.color
            );
            graph.chartType = 'line';
            graph.limit = this.DEFAULT_LIMIT;
          } catch (error) {
            console.error(`Error processing graph ${graph.key}:`, error);
          }
        });
      },
      (error) => {
        this.handleError(error);
      }
    );
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
   if (this.fetchInterval) {
    clearInterval(this.fetchInterval);
  }
  this.destroy$.next();
  this.destroy$.complete();
  }
   // Updated Asset Search Methods
  searchAsset(): void {
    if (this.assetSearchTerm.trim()) {
      this.selectedAsset = this.assetSearchTerm.trim();
      this.fetchAssetReadings();
    }
  }
fetchAssetReadings(): void {
  if (this.fetchInterval) {
    clearInterval(this.fetchInterval);
  }

  this.assetLoading = true;
  this.assetError = '';
  
  // Initial fetch
  this.fetchReadings();
  
  // Set up interval for periodic fetching (every minute)
  this.fetchInterval = setInterval(() => {
    this.fetchReadings();
  }, 60000); // 60,000 ms = 1 minute
}

private fetchReadings(): void {
  // Start with a reasonable initial limit
  let limit = 1000;
  
  const fetchWithLimit = (currentLimit: number) => {
    this.assetdataService.getAssetReadings(this.selectedAsset, currentLimit)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (data: any) => {
          const readings = Array.isArray(data) ? data : [data];
          if (readings.length === currentLimit) {
            // If we got exactly the limit, there might be more data
            fetchWithLimit(currentLimit * 2);
          } else {
            this.assetReadings = readings;
            this.createMeasurementCharts();
            this.assetLoading = false;
          }
        },
        (error) => {
          this.assetError = error.message || 'Failed to fetch all readings';
          this.assetLoading = false;
        }
      );
  };
  
  fetchWithLimit(limit);
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

    // Set canvas dimensions
    canvas.width = 1200;
    canvas.height = 700;

    // Color generation functions
    const getColor = (index: number, total: number, alpha = 1) => {
        const hue = (index * 360 / total) % 360;
        return `hsla(${hue}, 70%, 50%, ${alpha})`;
    };

    // Measurement-specific colors (temperature=red, humidity=blue, etc.)
    const getMeasurementColor = (type: string, alpha = 1): string => {
        const colorMap: {[key: string]: string} = {
            'temperature': 'hsla(0, 70%, 50%, ALPHA)',
            'humidity': 'hsla(240, 70%, 50%, ALPHA)',
            'pressure': 'hsla(120, 70%, 50%, ALPHA)',
            'co2': 'hsla(180, 70%, 50%, ALPHA)',
            'voltage': 'hsla(300, 70%, 50%, ALPHA)',
            'current': 'hsla(60, 70%, 50%, ALPHA)'
        };
        
        const baseColor = colorMap[type.toLowerCase()] || `hsla(${Math.floor(Math.random() * 360)}, 70%, 50%, ALPHA)`;
        return baseColor.replace('ALPHA', alpha.toString());
    };

    // Timezone helpers
    const isIST = (timestamp: string) => timestamp.includes('+05:30') || timestamp.endsWith('IST');
    const utcToIST = (date: Date) => new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    const formatISTTime = (date: Date) => {
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    // Filter readings for selected date in IST
    const selectedDateIST = new Date(this.selectedDate);
    selectedDateIST.setHours(0, 0, 0, 0);

    const filteredReadings = this.assetReadings.filter(r => {
        let readingDate = new Date(r.timestamp);
        if (!isIST(r.timestamp)) {
            readingDate = utcToIST(readingDate);
        }
        return readingDate.toDateString() === selectedDateIST.toDateString();
    });

    if (filteredReadings.length === 0) {
        this.showNoDataMessage(canvas, measurementType, this.selectedDate);
        return;
    }

    // Check if readings are text-based or numerical
    const firstReading = filteredReadings[0]?.reading[measurementType];
    const isTextData = typeof firstReading === 'string' && isNaN(Number(firstReading));

    // Group readings by time in IST
    const timeMap = new Map<string, {times: Date[], values: any[]}>();
   
    filteredReadings.forEach(r => {
        let date = new Date(r.timestamp);
        if (!isIST(r.timestamp)) {
            date = utcToIST(date);
        }
        const timeKey = formatISTTime(date);
       
        if (!timeMap.has(timeKey)) {
            timeMap.set(timeKey, {times: [], values: []});
        }
        timeMap.get(timeKey)!.times.push(date);
        timeMap.get(timeKey)!.values.push(r.reading[measurementType]);
    });

    // For text data (statuses)
    if (isTextData) {
        const statusCountMap = new Map<string, number[]>();
        const allStatuses = [...new Set(filteredReadings.map(r => r.reading[measurementType]))];

        allStatuses.forEach(status => {
            statusCountMap.set(status, Array(timeMap.size).fill(0));
        });

        let timeIndex = 0;
        timeMap.forEach((data, timeKey) => {
            data.values.forEach(value => {
                const currentCount = statusCountMap.get(value) || [];
                currentCount[timeIndex] = (currentCount[timeIndex] || 0) + 1;
                statusCountMap.set(value, currentCount);
            });
            timeIndex++;
        });

        const datasets = Array.from(statusCountMap.entries()).map(([status, counts], i) => {
            const color = getColor(i, statusCountMap.size);
            return {
                label: status,
                data: counts,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1
            };
        });

        const config: ChartConfiguration<'bar'> = {
            type: 'bar',
            data: {
                labels: Array.from(timeMap.keys()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: `Time (IST - ${this.selectedDate})`
                        }
                    },
                    y: {
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
                        text: `${measurementType} Status`,
                        font: { size: 16 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            },
                            title: (items) => {
                                if (items.length === 0) return '';
                                const timeLabel = items[0].label;
                                return `Time (IST): ${timeLabel}`;
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

    // Numerical data - line chart with measurement-specific color
    const dataset = {
        label: this.selectedDate,
        data: filteredReadings.map(r => r.reading[measurementType]),
        borderColor: getMeasurementColor(measurementType, 1),  // Solid color
        backgroundColor: getMeasurementColor(measurementType, 0.2),  // Transparent version
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 0,
        fill: true
    };

    const labels = filteredReadings.map(r => {
        let date = new Date(r.timestamp);
        if (!isIST(r.timestamp)) {
            date = utcToIST(date);
        }
        return formatISTTime(date);
    });

    const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [dataset]
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
                        text: `Time (IST - ${this.selectedDate})`
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
                    text: `${measurementType} Pattern`,
                    padding: { bottom: 20 },
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y}`,
                        title: (items) => {
                            if (items.length === 0) return '';
                            const rawTimestamp = filteredReadings[items[0].dataIndex].timestamp;
                            let date = new Date(rawTimestamp);
                            if (!isIST(rawTimestamp)) {
                                date = utcToIST(date);
                            }
                            return `Time (IST): ${formatISTTime(date)}`;
                        }
                    },
                    displayColors: true,
                    padding: 10,
                    bodyFont: { size: 12 }
                }
            },
            elements: {
                line: {
                    tension: 0.1
                },
                point: {
                    radius: 0
                }
            }
        }
    };

    if (this.measurementCharts[measurementType]) {
        this.measurementCharts[measurementType].destroy();
    }
    this.measurementCharts[measurementType] = new Chart(canvas, config);
}

private showNoDataMessage(canvas: HTMLCanvasElement, measurementType: string, date: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`No ${measurementType} data available for ${date}`, canvas.width / 2, canvas.height / 2);
    
    if (this.measurementCharts[measurementType]) {
        this.measurementCharts[measurementType].destroy();
        delete this.measurementCharts[measurementType];
    }
}

  clearCharts(): void {
  // Clear the fetch interval
  if (this.fetchInterval) {
    clearInterval(this.fetchInterval);
    this.fetchInterval = null;
  }

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
  // Clear the fetch interval
  if (this.fetchInterval) {
    clearInterval(this.fetchInterval);
    this.fetchInterval = null;
  }

  this.selectedAsset = '';
  this.assetSearchTerm = '';
  this.assetReadings = [];
  this.assetError = '';
  
  // Clean up charts
  Object.values(this.readingCharts).forEach(chart => chart.destroy());
  this.readingCharts = {};
}

    
}