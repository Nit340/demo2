import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { throwError, forkJoin, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AssetDataService {
  private readonly DEFAULT_LIMIT = 100; // Default number of readings to fetch
  private readonly GET_ASSET = environment.BASE_URL + 'asset';
  private readonly TRACK_SERVICE_URL = environment.BASE_URL + 'track';

  constructor(private http: HttpClient) { }

  /**
   * Get summary count of all asset readings
   * @returns Observable with asset summary
   */
  public getAsset(): Observable<any> {
    return this.http.get(this.GET_ASSET).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Get readings for a specific asset
   * @param assetCode Asset identifier
   * @param limit Maximum number of readings to return (default: 100)
   * @param offset Pagination offset (default: 0)
   * @param time Time window in seconds (default: 0 = no time filter)
   * @returns Observable with asset readings
   */
  public getAssetReadings(
    assetCode: string,
    limit: number = this.DEFAULT_LIMIT,
    offset: number = 0,
    time: number = 0
  ): Observable<any> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (time > 0) {
      params = params.append('seconds', time.toString());
    }

    return this.http.get(`${this.GET_ASSET}/${encodeURIComponent(assetCode)}`, { params }).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Get readings for multiple assets with advanced filtering
   * @param assetCode Primary asset code
   * @param limit Maximum number of readings (default: 100)
   * @param offset Pagination offset (default: 0)
   * @param time Time window in seconds (default: 0)
   * @param additionalAssets Array of additional asset codes
   * @param previous Number of previous readings to include
   * @param mostrecent Whether to get only most recent reading
   * @param previous_ts Previous timestamp for filtering
   * @returns Observable with asset readings
   */
  public getMultipleAssetReadings(
    assetCode: string,
    limit: number = this.DEFAULT_LIMIT,
    offset: number = 0,
    time: number = 0,
    additionalAssets: string[] = [],
    previous: number = 0,
    mostrecent: boolean = false,
    previous_ts: string = ''
  ): Observable<any> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (time > 0) params = params.append('seconds', time.toString());
    if (additionalAssets.length > 0) params = params.set('additional', additionalAssets.join(','));
    if (mostrecent) params = params.append('mostrecent', 'true');
    if (previous > 0) params = params.append('previous', previous.toString());
    if (previous_ts) params = params.append('previous_ts', previous_ts);

    return this.http.get(`${this.GET_ASSET}/${encodeURIComponent(assetCode)}`, { params }).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Get the latest reading for an asset
   * @param assetCode Asset identifier
   * @returns Observable with latest reading
   */
  public getLatestReadings(assetCode: string): Observable<any> {
    return this.http.get(`${this.GET_ASSET}/${encodeURIComponent(assetCode)}/latest`).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Get readings for multiple assets with individual limits
   * @param assets Array of asset configurations
   * @returns Observable array with all assets' readings
   */
  public getMultiAssetsReadings(assets: Array<{asset: string, limit?: number, offset?: number}>): Observable<any[]> {
    const requests = assets.map(assetConfig => {
      const params = new HttpParams()
        .set('limit', (assetConfig.limit || this.DEFAULT_LIMIT).toString())
        .set('offset', (assetConfig.offset || 0).toString());

      return this.http.get(`${this.GET_ASSET}/${encodeURIComponent(assetConfig.asset)}`, { params }).pipe(
        map((response: any) => {
          return Array.isArray(response) 
            ? response.map(r => ({ ...r, assetName: assetConfig.asset }))
            : [];
        })
      );
    });

    return forkJoin(requests);
  }

  /**
   * Get summary data for an asset
   * @param assetCode Asset identifier
   * @param limit Maximum number of summaries (default: 100)
   * @param time Time window in seconds (default: 0)
   * @param previous Number of previous summaries to include
   * @returns Observable with asset summary
   */
  public getAllAssetSummary(
    assetCode: string,
    limit: number = this.DEFAULT_LIMIT,
    time: number = 0,
    previous: number = 0
  ): Observable<any> {
    let params = new HttpParams()
      .set('limit', limit.toString());

    if (time > 0) params = params.append('seconds', time.toString());
    if (previous > 0) params = params.append('previous', previous.toString());

    return this.http.get(`${this.GET_ASSET}/${encodeURIComponent(assetCode)}/summary`, { params }).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Get time-series average for an asset reading
   * @param assetObject Object containing assetCode and reading name
   * @returns Observable with average data
   */
  public getAssetAverage(assetObject: {assetCode: string, reading: string}): Observable<any> {
    return this.http.get(
      `${this.GET_ASSET}/${encodeURIComponent(assetObject.assetCode)}/${assetObject.reading}/series`
    ).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Purge data for a specific asset
   * @param assetCode Asset identifier
   * @returns Observable with purge result
   */
  public purgeAssetData(assetCode: string): Observable<any> {
    return this.http.delete(`${this.GET_ASSET}/${encodeURIComponent(assetCode)}`).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Purge data for all assets
   * @returns Observable with purge result
   */
  public purgeAllAssetsData(): Observable<any> {
    return this.http.delete(`${this.GET_ASSET}`).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }

  /**
   * Deprecate a tracking entry
   * @param serviceName Service name
   * @param assetName Asset name
   * @param event Event type
   * @returns Observable with operation result
   */
  public deprecateAssetTrackEntry(serviceName: string, assetName: string, event: string): Observable<any> {
    return this.http.put(
      `${this.TRACK_SERVICE_URL}/service/${encodeURIComponent(serviceName)}/asset/${encodeURIComponent(assetName)}/event/${encodeURIComponent(event)}`,
      null
    ).pipe(
      map(response => response),
      catchError(error => throwError(error))
    );
  }
  
}