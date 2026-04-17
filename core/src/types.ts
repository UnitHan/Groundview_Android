export type Platform = 'android' | 'ios';

export interface DeviceInfo {
  id: string;
  name?: string;
  platform: Platform;
  wireless?: boolean;
}

export interface CaptureResult {
  screenshotPath: string;
  xmlPath?: string;
  xmlPathCompressed?: string;
  xmlPathUncompressed?: string;
  xmlVariant?: 'compressed' | 'uncompressed' | 'uiautomator2' | 'groundview-service';
  xmlStats?: {
    compressedBytes?: number;
    uncompressedBytes?: number;
  };
  captureMethod?: 'uiautomator-dump' | 'uiautomator2-server' | 'accessibility-service' | 'wda';
  error?: string;
}

export interface HealthStatus {
  ok: boolean;
  details?: string;
}
