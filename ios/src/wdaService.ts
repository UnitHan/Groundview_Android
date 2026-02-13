import { DeviceService } from '../../core/src/ports';
import { CaptureResult, DeviceInfo, HealthStatus } from '../../core/src/types';

// Stub class kept for type/interface reference on the TS side.
export class WdaService implements DeviceService {
  platform: 'ios' = 'ios';

  async listDevices(): Promise<DeviceInfo[]> {
    return [];
  }

  async capture(_deviceId: string): Promise<CaptureResult> {
    return { screenshotPath: '', xmlPath: '' };
  }

  async health(): Promise<HealthStatus> {
    return { ok: false, details: 'Implemented in Electron main via IPC' };
  }
}
