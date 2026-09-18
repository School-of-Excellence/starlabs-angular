import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Firestore, doc, docData, setDoc, Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';


export interface MasterNodeStatus {
  state: 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';
  status: string;
  instanceId: string;
  instanceType?: string;
  publicIp?: string;
  privateIp?: string;
  launchTime?: string;
  changedExternally?: boolean;
  lastExternalChange?: Timestamp;
}

export interface MediaNodesStatus {
  asgName: string;
  desiredCapacity: number;
  minSize: number;
  maxSize: number;
  instanceStates: {
    healthy: number;
    unhealthy: number;
    pending: number;
    terminating: number;
    total: number;
  };
  instances: Array<{
    instanceId: string;
    healthStatus: string;
    lifecycleState: string;
    availabilityZone: string;
    isHealthy: boolean;
  }>;
  scalingStatus: 'stable' | 'scaling-up' | 'scaling-down';
  changedExternally?: boolean;
  lastExternalChange?: Timestamp;
}

export interface InfrastructureStatus {
  master: MasterNodeStatus;
  media: MediaNodesStatus;
  lastUpdated: Timestamp;
}

@Injectable({
  providedIn: 'root'
})
export class InstanceStatusService {
  
  private readonly baseUrl = environment.firebase.projectId === "fir-sample-aae4a" ? 'https://us-central1-fir-sample-aae4a.cloudfunctions.net' : 'https://us-central1-starlabs-test.cloudfunctions.net';

  constructor(
    private http: HttpClient,
    private firestore: Firestore
  ) {}


  // Real-time status from Firestore (updated by webhooks)
  getStatus(): Observable<InfrastructureStatus | undefined> {
    const statusDoc = doc(this.firestore, 'AWS_System/instance_status');
    return docData(statusDoc) as Observable<InfrastructureStatus | undefined>;
  }

  // OCI twin — same document shape (asgName carries the instance-pool name), separate
  // collection and functions so the AWS and OCI paths never conflict. Written by the
  // CheckOciNodeStatus poller every 5 min.
  getOciStatus(): Observable<InfrastructureStatus | undefined> {
    const statusDoc = doc(this.firestore, 'OCI_System/instance_status');
    return docData(statusDoc) as Observable<InfrastructureStatus | undefined>;
  }
  

  //  Start master node
  startMaster(): Observable<any> {
    return this.http.post(`${this.baseUrl}/startMasterNodeHTTP`, {});
  }

  
  //  Stop master node
   
  stopMaster(): Observable<any> {
    return this.http.post(`${this.baseUrl}/stopMasterNodeHTTP`, {});
  }

  //  Scale media nodes up by 1
  scaleUp(): Observable<any> {
    return this.http.post(`${this.baseUrl}/scaleMediaNodes`, { 
      action: 'scale-up' 
    });
  }

  // Scale media nodes down by 1
  scaleDown(): Observable<any> {
    return this.http.post(`${this.baseUrl}/scaleMediaNodes`, {
      action: 'scale-down'
    });
  }

  // ---- Active media provider (openvidu server/mediaprovider.activeprovider) ----
  // Single source of truth for which cloud acts: both CF controllers gate on it, the
  // monitor selector writes it, and instant meetings stamp new rooms from it.

  getActiveProvider(): Observable<{ activeprovider?: 'aws' | 'oci' } | undefined> {
    const providerDoc = doc(this.firestore, 'openvidu server/mediaprovider');
    return docData(providerDoc) as Observable<{ activeprovider?: 'aws' | 'oci' } | undefined>;
  }

  setActiveProvider(provider: 'aws' | 'oci'): Promise<void> {
    const providerDoc = doc(this.firestore, 'openvidu server/mediaprovider');
    return setDoc(providerDoc, { activeprovider: provider }, { merge: true });
  }

  // ---- OCI twins (separate functions — same contracts as the AWS ones) ----

  startOciMaster(): Observable<any> {
    return this.http.post(`${this.baseUrl}/startOciMasterHTTP`, {});
  }

  stopOciMaster(): Observable<any> {
    return this.http.post(`${this.baseUrl}/stopOciMasterHTTP`, {});
  }

  scaleOciUp(): Observable<any> {
    return this.http.post(`${this.baseUrl}/scaleOciMediaNodes`, {
      action: 'scale-up'
    });
  }

  scaleOciDown(): Observable<any> {
    return this.http.post(`${this.baseUrl}/scaleOciMediaNodes`, {
      action: 'scale-down'
    });
  }

}
