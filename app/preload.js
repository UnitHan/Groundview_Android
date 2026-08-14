const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('groundview', {
  platform: process.platform,
  adb: {
    listDevices: () => ipcRenderer.invoke('adb:listDevices'),
    capture: (id) => ipcRenderer.invoke('adb:capture', id),
    health: () => ipcRenderer.invoke('adb:health'),
    setPath: (bin) => ipcRenderer.invoke('adb:setPath', bin),
    getPath: () => ipcRenderer.invoke('adb:getPath'),
    scan: () => ipcRenderer.invoke('adb:scan'),
    autoDetect: () => ipcRenderer.invoke('adb:autoDetect'),
    deviceInfo: (id) => ipcRenderer.invoke('adb:deviceInfo', id)
  },
  ios: {
    listDevices: () => ipcRenderer.invoke('ios:listDevices'),
    capture: (id) => ipcRenderer.invoke('ios:capture', id),
    health: () => ipcRenderer.invoke('ios:health')
  },
  fs: {
    readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath)
  },
  log: {
    write: (message) => ipcRenderer.invoke('log:write', message)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (obj) => ipcRenderer.invoke('settings:save', obj)
  },
  dialog: {
    openAdb: () => ipcRenderer.invoke('dialog:openADB')
  },
  dump: {
    pick: () => ipcRenderer.invoke('dump:pick'),
    export: (payload) => ipcRenderer.invoke('dump:export', payload)
  },
  webview: {
    ocr: (imagePath, opts) => ipcRenderer.invoke('webview:ocr', imagePath, opts)
  },
  locator: {
    gemini: async (payload) => {
      try {
        const resp = await fetch('http://localhost:5005/api/locator/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const text = await resp.text();
          return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
        }
        return await resp.json();
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
  },
  env: {
    diagnose: () => ipcRenderer.invoke('env:diagnose'),
    downloadAdb: () => ipcRenderer.invoke('env:downloadAdb')
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  },
  ui: {
    onInfo: (cb) => {
      if (!cb) return () => {};
      ipcRenderer.on('ui:openInfo', cb);
      return () => ipcRenderer.removeListener('ui:openInfo', cb);
    }
  }
});
