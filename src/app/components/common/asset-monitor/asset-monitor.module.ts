// src/app/components/common/asset-monitor/asset-monitor.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AssetMonitorComponent } from './asset-monitor.component';

@NgModule({
  declarations: [AssetMonitorComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  exports: [AssetMonitorComponent]
})
export class AssetMonitorModule { }