import { Component, OnDestroy, OnInit } from '@angular/core';
import { map } from 'lodash';
import { interval, Subject } from 'rxjs';
import { takeWhile, takeUntil } from 'rxjs/operators';

import { DateFormatterPipe } from '../../../pipes';
import { AlertService, PingService, StatisticsService } from '../../../services';
import { DocService } from '../../../services/doc.service';
import Utils, { CHART_COLORS, GRAPH_REFRESH_INTERVAL, STATS_HISTORY_TIME_FILTER } from '../../../utils';

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
  destroy$: Subject<boolean> = new Subject<boolean>();
  assetSearchTerm: string = '';
  selectedAsset: string = '';
  
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

  // Asset search methods
  searchAsset(): void {
    if (this.assetSearchTerm.trim()) {
      this.selectedAsset = this.assetSearchTerm.trim();
    }
  }
  
  clearAsset(): void {
    this.selectedAsset = '';
    this.assetSearchTerm = '';
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
  }
}