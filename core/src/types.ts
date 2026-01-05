export type Platform = 'android' | 'ios';

export interface DeviceInfo {
  id: string;
  name?: string;
  platform: Platform;
}

export interface CaptureResult {
  screenshotPath: string;
  xmlPath?: string;
  xmlPathCompressed?: string;
  xmlPathUncompressed?: string;
  xmlVariant?: 'compressed' | 'uncompressed';
  xmlStats?: {
    compressedBytes?: number;
    uncompressedBytes?: number;
  };
  error?: string;
}

export interface HealthStatus {
  ok: boolean;
  details?: string;
}
