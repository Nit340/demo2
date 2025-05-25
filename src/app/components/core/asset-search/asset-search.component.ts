import { Component, OnInit } from '@angular/core';
import { AssetsService } from '../../../services'; // Adjust path as needed
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-asset-search',
  templateUrl: './asset-search.component.html',
  styleUrls: ['./asset-search.component.css']
})
export class AssetSearchComponent implements OnInit {
  searchControl = new FormControl();
  assetData: any;
  isLoading = false;
  errorMessage = '';

  constructor(private assetsService: AssetsService) {}

  ngOnInit() {
    this.setupSearch();
  }

  private setupSearch() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(500), // Wait 500ms after keystroke
        distinctUntilChanged(), // Only if value changed
        switchMap(assetName => {
          this.isLoading = true;
          this.errorMessage = '';
          return this.assetsService.getAssetReadings(assetName)
            .pipe(
              catchError(error => {
                this.errorMessage = error.message || 'Error fetching asset data';
                this.isLoading = false;
                return throwError(error);
              })
            );
        })
      )
      .subscribe(data => {
        this.assetData = data;
        this.isLoading = false;
      });
  }

  // Optional: For more detailed search with parameters
  searchAsset(assetName: string, limit: number = 10) {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.assetsService.getAssetReadings(assetName, limit)
      .subscribe(
        data => {
          this.assetData = data;
          this.isLoading = false;
        },
        error => {
          this.errorMessage = error.message || 'Error fetching asset data';
          this.isLoading = false;
        }
      );
  }
}