import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';


export interface NodeStatus {
  name: string;
  newState: boolean;
  type?: string;
  oldState?: boolean;
  category?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FlowEditorService {

  public showItemsInQuickview: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public showLogsInQuickview: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public filterInfo: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public pipelineInfo: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public connectionInfo: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public serviceInfo: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public removeFilter: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public exportReading: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public nodeClick: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public nodeDropdownClick: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public checkHistory: BehaviorSubject<any> = new BehaviorSubject<any>(false);
  public updateNodeStatusSubject: BehaviorSubject<NodeStatus> = new BehaviorSubject<NodeStatus>({ name: '', newState: false, type: '' });

  private pipelineSubject = new BehaviorSubject<(string | string[])[]>([]);
  updatedFilterPipelineData$: Observable<(string | string[])[]> = this.pipelineSubject.asObservable();

  constructor() { }

  emitPipelineUpdate(result: (string | string[])[]): void {
    result = result?.filter(f => f != 'Filter');
    this.pipelineSubject.next(result);
  }

  clearEmittedPipelineChanges(): void {
    this.pipelineSubject.next(null);
  }

  public flowEditorControl(visible: boolean) {
    localStorage.setItem('FLOW_EDITOR', JSON.stringify(visible));
  }

  public getFlowEditorStatus(): boolean {
    const controlStatus: boolean = JSON.parse(localStorage.getItem('FLOW_EDITOR'));
    return controlStatus ?? true;
  }
}
