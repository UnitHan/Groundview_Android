const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('groundview', {
  adb: {
    listDevices: () => ipcRenderer.invoke('adb:listDevices'),
    capture: (id) => ipcRenderer.invoke('adb:capture', id),
    health: () => ipcRenderer.invoke('adb:health'),
    setPath: (bin) => ipcRenderer.invoke('adb:setPath', bin)
    ,scan: () => ipcRenderer.invoke('adb:scan')
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
    gemini: (payload) => ipcRenderer.invoke('locator:gemini', payload)
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
