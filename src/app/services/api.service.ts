// src/app/services/api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(private http: HttpClient) { }

  getAssetReadings(assetName: string) {
    return this.http.get(`${environment.BASE_URL}asset/${assetName}/reading/latest`);
  }

  getAssetSummary(assetName: string) {
    return this.http.get(`${environment.BASE_URL}asset/${assetName}/summary`);
  }
}