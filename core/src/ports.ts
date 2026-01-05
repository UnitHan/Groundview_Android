import { CaptureResult, DeviceInfo, HealthStatus, Platform } from './types';

export interface DeviceService {
  platform: Platform;
  listDevices(): Promise<DeviceInfo[]>;
  capture(deviceId: string): Promise<CaptureResult>;
  health(): Promise<HealthStatus>;
}

export interface LocatorService {
  platform: Platform;
  // Placeholder for future locator generation input/output
}
