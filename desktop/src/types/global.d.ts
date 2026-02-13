export {};

declare global {
  interface Window {
    groundview?: {
      adb: {
        listDevices: () => Promise<any>;
        capture: (id: string) => Promise<any>;
        health: () => Promise<any>;
        setPath: (bin: string) => Promise<any>;
        scan: () => Promise<string[]>;
      };
      ios: {
        listDevices: () => Promise<any>;
        capture: (id: string) => Promise<any>;
        health: () => Promise<any>;
      };
      fs: {
        readText: (filePath: string) => Promise<{ ok: boolean; data?: string; error?: string }>;
      };
      log: {
        write: (message: string) => Promise<{ ok: boolean; error?: string }>;
      };
      settings: {
        load: () => Promise<{ ok: boolean; data?: any; error?: string }>;
        save: (obj: any) => Promise<{ ok: boolean; error?: string }>;
      };
      dialog?: {
        openAdb: () => Promise<{ ok: boolean; path?: string }>;
        openDump: () => Promise<{ ok: boolean; dump?: { metadata?: any; xml?: string; screenshotPath?: string; xmlPath?: string }; error?: string }>;
      };
      dump?: {
        pick: () => Promise<{ ok: boolean; data?: { metadata?: any; xml?: string; screenshotPath?: string; xmlPath?: string }; error?: string }>;
        export: (payload: {
          xmlPath: string;
          screenshotPath: string;
          metadata?: any;
          deviceId?: string;
        }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      };
      locator?: {
        gemini: (payload: { node: any; screenshot?: string; bounds?: string }) => Promise<{ ok: boolean; suggestion?: any; error?: string }>;
      };
      external?: {
        open: (url: string) => Promise<{ ok: boolean; error?: string }>;
      };
      ui?: {
        onInfo?: (callback: () => void) => (() => void) | undefined;
      };
    };
  }
}
