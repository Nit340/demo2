import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AssetMonitorComponent } from '../../common/asset-monitor/asset-monitor.component';
import { DashboardComponent } from '.';
import { DateFormatterPipe } from '../../../pipes';
import { StatisticsService } from '../../../services';
import { ChartModule } from '../../common/chart';
import { NumberInputDebounceModule } from '../../common/number-input-debounce/number-input-debounce.module';
import { AssetsComponent } from '../asset-readings/assets';
import { AssetMonitorModule } from '../../common/asset-monitor/asset-monitor.module';

@NgModule({
  declarations: [
    DashboardComponent,
   
  ],
  imports: [
    FormsModule,
    CommonModule,
    NumberInputDebounceModule,
    ChartModule,
    AssetMonitorModule,
  ],
  providers: [StatisticsService, DateFormatterPipe],
  exports: []
})
export class DashboardModule { }
