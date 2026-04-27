// Minimal Electron entrypoint; loads renderer dev server or packaged file.
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}
const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const adb = require('./services/adbService');
const wda = require('./services/wdaService');
const fsSync = require('fs');
const os = require('os');
const { exec, execSync, spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
let lastZipDir = '';

// groundview-file:// — restricted protocol for serving screenshot and temp files.
// Must be registered synchronously before app becomes ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'groundview-file', privileges: { secure: true, supportFetchAPI: true, corsEnabled: false } }
]);
let backendProcess = null;

// Use per-user data in production; keep local data in dev/portable mode.
const isDev = process.env.NODE_ENV === 'development';
const defaultUserDataPath = app.getPath('userData');
const portableUserDataPath = path.join(process.cwd(), 'user-data');
const userDataOverride = process.env.GROUNDVIEW_USER_DATA || process.env.GROUNDVIEW_SETTINGS_DIR;
const userDataPath =
  userDataOverride ||
  ((isDev || process.env.GROUNDVIEW_PORTABLE === '1') ? portableUserDataPath : defaultUserDataPath);
try {
  fsSync.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
} catch {
  /* ignore */
}
const effectiveUserDataPath = app.getPath('userData');
process.env.GROUNDVIEW_SETTINGS_DIR = effectiveUserDataPath;
const cacheDir = path.join(effectiveUserDataPath, 'Cache');
try {
  fsSync.mkdirSync(cacheDir, { recursive: true });
} catch {
  /* ignore */
}
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
app.commandLine.appendSwitch('media-cache-dir', cacheDir);
app.commandLine.appendSwitch('disable-http-cache', '1');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// MSIX/AppX 패키지로 실행될 때 GPU 샌드박스가 컨테이너와 충돌하여
// ERROR_PARTIAL_COPY (ReadProcessMemory/WriteProcessMemory) 오류가 발생한다.
// WindowsApps 경로에서 실행 중이면 MSIX 환경으로 판단하고 샌드박스를 비활성화한다.
const isMsix = (process.execPath || '').toLowerCase().includes('windowsapps');
if (isMsix) {
  // Stabilize Chromium child-process startup under MSIX on hardened Windows images.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity,CalculateNativeWinOcclusion');
}

// Detect bundled Python EARLY — must run before startPythonServer().
// createWindow() runs AFTER startPythonServer(), so detection here is critical.
// extraResources "resources/**/*" → {resourcesPath}/resources/python-bundle/
if (!process.env.PYTHON_BIN) {
  const embedPyWin  = path.join(process.resourcesPath || '', 'resources', 'python-bundle', 'python.exe');
  const bundledPyWin = path.join(process.resourcesPath || '', 'venv', 'Scripts', 'python.exe');
  const bundledPyNix = path.join(process.resourcesPath || '', 'venv', 'bin', 'python3');
  if (fsSync.existsSync(embedPyWin)) {
    process.env.PYTHON_BIN = embedPyWin;
  } else if (fsSync.existsSync(bundledPyWin)) {
    process.env.PYTHON_BIN = bundledPyWin;
  } else if (fsSync.existsSync(bundledPyNix)) {
    process.env.PYTHON_BIN = bundledPyNix;
  }
}

const migrateLegacyGeminiSettings = () => {
  const legacyFile = path.join(portableUserDataPath, 'settings.json');
  const currentFile = path.join(effectiveUserDataPath, 'settings.json');
  if (legacyFile === currentFile) return;
  if (!fsSync.existsSync(legacyFile)) return;

  let legacyData;
  try {
    legacyData = JSON.parse(fsSync.readFileSync(legacyFile, 'utf8'));
  } catch {
    return;
  }
  const hasLegacyGemini =
    legacyData.geminiApiKeyEncrypted || legacyData.geminiApiKey || legacyData.geminiModel;
  if (!hasLegacyGemini) return;

  let currentData = {};
  try {
    if (fsSync.existsSync(currentFile)) {
      currentData = JSON.parse(fsSync.readFileSync(currentFile, 'utf8'));
    }
  } catch {
    currentData = {};
  }

  const needsKey = !currentData.geminiApiKeyEncrypted && !currentData.geminiApiKey;
  const needsModel = !currentData.geminiModel;
  if (!needsKey && !needsModel) return;

  const merged = { ...currentData };
  let updated = false;
  if (needsKey && legacyData.geminiApiKeyEncrypted) {
    merged.geminiApiKeyEncrypted = legacyData.geminiApiKeyEncrypted;
    updated = true;
  } else if (needsKey && legacyData.geminiApiKey) {
    merged.geminiApiKey = legacyData.geminiApiKey;
    updated = true;
  }
  if (needsModel && legacyData.geminiModel) {
    merged.geminiModel = legacyData.geminiModel;
    updated = true;
  }
  if (!updated) return;

  try {
    fsSync.mkdirSync(path.dirname(currentFile), { recursive: true });
    fsSync.writeFileSync(currentFile, JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
};
migrateLegacyGeminiSettings();

// Default PaddleOCR cache path (if not set by user)
// MSIX: process.cwd() is read-only (WindowsApps), so use writable userData path instead.
if (!process.env.PADDLEOCR_HOME) {
  const defaultOcrHome = path.join(effectiveUserDataPath, 'models', 'paddleocr');
  try {
    fsSync.mkdirSync(defaultOcrHome, { recursive: true });
    process.env.PADDLEOCR_HOME = defaultOcrHome;
  } catch {
    /* ignore */
  }
}

const base64UrlToBuffer = (input) => {
  if (!input || typeof input !== 'string') return null;
  let value = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = value.length % 4;
  if (pad) value += '='.repeat(4 - pad);
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
};

const parseSettingsJsonSync = (raw) => {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: true, data: {}, repaired: false };
    }
    return { ok: true, data, repaired: false };
  } catch (err) {
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace !== -1) {
      const sliced = raw.slice(0, lastBrace + 1);
      try {
        const data = JSON.parse(sliced);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { ok: true, data: {}, repaired: true };
        }
        return { ok: true, data, repaired: true };
      } catch {
        // fall through
      }
    }
    return { ok: false, error: err };
  }
};

// Mirrors backend/settings_manager.py encryption (PBKDF2 -> SHA256 -> Fernet).
const decryptGeminiKey = (encrypted) => {
  try {
    if (!encrypted || typeof encrypted !== 'object') return null;
    const saltHex = encrypted.salt;
    const tokenStr = encrypted.encrypted;
    if (!saltHex || !tokenStr) return null;
    const salt = Buffer.from(saltHex, 'hex');
    
    // Use machine ID based key (same as Python backend)
    // Match Python's platform.machine() and platform.system() exactly
    let machine = os.arch(); // 'x64', 'arm64', etc.
    if (machine === 'x64') machine = 'AMD64'; // Match Python's platform.machine() on Windows
    
    let system = os.platform(); // 'win32', 'darwin', 'linux'
    if (system === 'win32') system = 'Windows';
    else if (system === 'darwin') system = 'Darwin';
    else if (system === 'linux') system = 'Linux';
    
    const machineId = `${os.hostname()}-${machine}-${system}`;
    const secret = Buffer.from(machineId, 'utf8');
    
    const derived = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
    const keyHash = crypto.createHash('sha256').update(derived).digest();
    const signingKey = keyHash.slice(0, 16);
    const encKey = keyHash.slice(16, 32);

    const token = base64UrlToBuffer(tokenStr);
    if (!token || token.length < 1 + 8 + 16 + 32) return null;
    if (token[0] !== 0x80) return null;
    const hmacStart = token.length - 32;
    const data = token.slice(0, hmacStart);
    const hmac = token.slice(hmacStart);
    const calc = crypto.createHmac('sha256', signingKey).update(data).digest();
    if (hmac.length !== calc.length || !crypto.timingSafeEqual(hmac, calc)) return null;

    const iv = token.slice(9, 25);
    const ciphertext = token.slice(25, hmacStart);
    const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
};

const geminiSettingsPaths = () => {
  const paths = [path.join(app.getPath('userData'), 'settings.json')];
  const backendPath = path.join(process.cwd(), 'backend', 'user-data', 'settings.json');
  if (!paths.includes(backendPath)) paths.push(backendPath);
  if (process.resourcesPath) {
    const packedPath = path.join(process.resourcesPath, 'backend', 'user-data', 'settings.json');
    if (!paths.includes(packedPath)) paths.push(packedPath);
  }
  return paths;
};

const readGeminiSettings = () => {
  for (const settingsPath of geminiSettingsPaths()) {
    try {
      if (!fsSync.existsSync(settingsPath)) continue;
      const raw = fsSync.readFileSync(settingsPath, 'utf8');
      const parsed = parseSettingsJsonSync(raw);
      if (!parsed.ok || !parsed.data) continue;
      const data = parsed.data;
      const key = data.geminiApiKey || decryptGeminiKey(data.geminiApiKeyEncrypted);
      const model = data.geminiModel;
      if (parsed.repaired) {
        try {
          const lockPath = path.join(path.dirname(settingsPath), 'settings.lock');
          if (!fsSync.existsSync(lockPath)) {
            fsSync.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
          }
        } catch {
          /* ignore */
        }
      }
      if (key || model) return { key, model };
    } catch {
      /* ignore */
    }
  }
  return { key: undefined, model: undefined };
};

// Load stored Gemini model preference at startup.
// NOTE: API key is intentionally NOT written to process.env here to avoid
// leaking it into unrelated child processes (adb, powershell, etc.).
// The key is read directly from settings at the point of use via loadGeminiEnv().
const preloadGeminiFromSettings = () => {
  try {
    const { model } = readGeminiSettings();
    if (model) process.env.GEMINI_MODEL = model;
  } catch {
    /* ignore */
  }
};
preloadGeminiFromSettings();

const writeDiagnosticLog = (message) => {
  try {
    fsSync.appendFileSync(
      path.join(effectiveUserDataPath, 'groundview.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8'
    );
  } catch {
    /* ignore */
  }
};

const compactLogText = (value, max = 1200) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const compactJson = (value, max = 1200) => {
  try {
    return compactLogText(JSON.stringify(value), max);
  } catch {
    return compactLogText(value, max);
  }
};

const writeAdbLog = (message) => writeDiagnosticLog(`[adb] ${message}`);

// Restore saved ADB path and auto-detect if not saved
const preloadAdbFromSettings = () => {
  try {
    // MSIX: 번들 adb를 최우선으로 확인.
    // user AppData 경로의 DLL 로딩 실패(0xC0000135)를 우회한다.
    if (isMsix && process.resourcesPath) {
      const bundledAdb = path.join(process.resourcesPath, 'resources', 'adb', 'adb.exe');
      if (fsSync.existsSync(bundledAdb)) {
        adb.setAdbPath(bundledAdb);
        writeAdbLog(`preload using bundled adb (MSIX) path=${bundledAdb}`);
        return;
      }
      writeAdbLog(`preload bundled adb not found path=${bundledAdb}, falling through to saved/scan`);
    }

    const settingsPath = path.join(effectiveUserDataPath, 'settings.json');
    writeAdbLog(`preload settings=${settingsPath} exists=${fsSync.existsSync(settingsPath)}`);
    if (fsSync.existsSync(settingsPath)) {
      const raw = fsSync.readFileSync(settingsPath, 'utf8');
      const parsed = parseSettingsJsonSync(raw);
      if (parsed.ok && parsed.data?.adbPath) {
        try {
          // F_OK only: X_OK is unreliable for external executables under MSIX.
          fsSync.accessSync(parsed.data.adbPath, fsSync.constants.F_OK);
          adb.setAdbPath(parsed.data.adbPath);
          writeAdbLog(`preload using saved adbPath=${parsed.data.adbPath}`);
          return; // saved path still valid
        } catch (e) {
          writeAdbLog(`preload saved adbPath invalid path=${parsed.data.adbPath} error=${e.message || e}`);
        }
      }
    }
  } catch (e) {
    writeAdbLog(`preload settings read failed error=${e.message || e}`);
  }
  // Auto-detect on startup (async, best-effort)
  scanAdbPaths().then(found => {
    writeAdbLog(`preload auto-scan found=${compactJson(found)}`);
    if (found.length > 0) {
      adb.setAdbPath(found[0]);
      writeAdbLog(`preload using auto-detected adbPath=${found[0]}`);
    }
  }).catch((e) => {
    writeAdbLog(`preload auto-scan failed error=${e.message || e}`);
  });
};
preloadAdbFromSettings();

const loadGeminiEnv = () => {
  let key = process.env.GEMINI_API_KEY;
  let model = process.env.GEMINI_MODEL;
  try {
    const stored = readGeminiSettings();
    if (stored.key) key = stored.key;
    if (stored.model) model = stored.model;
  } catch {
    /* ignore */
  }
  return { key, model };
};

const cleanChromiumData = async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'caches'] });
  } catch {
    /* ignore */
  }
  const userData = app.getPath('userData');
  const targets = [
    path.join(userData, 'Cache'),
    path.join(userData, 'GPUCache'),
    path.join(userData, 'Code Cache'),
    path.join(userData, 'Service Worker')
  ];
  for (const dir of targets) {
    try {
      if (fsSync.existsSync(dir)) {
        fsSync.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    backgroundColor: '#0b1221',
    icon: path.join(__dirname, '../icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const rendererFile = path.join(__dirname, '../dist/renderer/index.html');
  const fallbackUrl = `file://${rendererFile}`;
  // 개발 편의를 위해 NODE_ENV=development면 RENDERER_URL 미지정 시에도 3000 사용
  const startUrlEnv =
    process.env.RENDERER_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined);
  const startUrl = startUrlEnv || fallbackUrl;
  let attemptedFallback = false;
  const hasRendererFile = fsSync.existsSync(rendererFile);
  // PYTHON_BIN is detected at startup (top of file) before startPythonServer() is called.

  const writeLog = async (msg) => {
    try {
      await fs.appendFile(logFile(), `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  };

  // Application menu (File/Edit/View/Window/Help/Info)
  const menuTemplate = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help' },
    {
      label: 'Info',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ui:openInfo');
        }
      }
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  const loadRenderer = (url, label) => {
    writeLog(`[renderer-load] url=${url} from=${label || 'initial'}`);
    return win.loadURL(url);
  };

  const cleanServiceWorkerStorage = async () => {
    try {
      // Clear SW/caches via Electron API
      await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'caches'] });
    } catch {
      /* ignore */
    }
    try {
      // Remove on-disk SW cache to avoid "Failed to delete the database: Database IO error"
      const swDir = path.join(app.getPath('userData'), 'Service Worker');
      if (fsSync.existsSync(swDir)) {
        fsSync.rmSync(swDir, { recursive: true, force: true });
        await writeLog(`[sw-clean] removed ${swDir}`);
      }
    } catch (e) {
      await writeLog(`[sw-clean-error] ${e.message || e}`);
    }
  };

  const inlineErrorPage = (reason, detail) => {
    const msg = `
      <html>
        <body style="background:#0b1221;color:#e5e7eb;font-family:sans-serif;padding:24px;">
          <h2>Renderer load failed</h2>
          <p>reason: ${reason}</p>
          <p>detail: ${detail || ''}</p>
          <p>dev server URL: ${startUrlEnv || '(none)'}</p>
          <p>bundle file: ${hasRendererFile ? rendererFile : 'not found'}</p>
          <p>Actions: run <code>npm run dev</code> (ensure http://localhost:3000), or build renderer (<code>npm run build</code>).</p>
        </body>
      </html>`;
    return `data:text/html;base64,${Buffer.from(msg).toString('base64')}`;
  };

  const attemptLoad = async (label) => {
    // 1) 우선 지정된 URL(또는 기본 dev 3000) 시도
    if (startUrlEnv) {
      return loadRenderer(startUrlEnv, label || 'dev');
    }
    // 2) dev URL 없으면 번들 시도
    if (hasRendererFile) return loadRenderer(fallbackUrl, label || 'file');
    // 3) 모두 없으면 에러 안내
    return loadRenderer(inlineErrorPage('renderer bundle missing', rendererFile), 'inline-error');
  };

  // 1) 로드 실패나 렌더러 크래시 시 자동 복구 (가능하면 파일 번들로 폴백)
  const reloadOnError = async (reason, details) => {
    await writeLog(`[renderer-reload] reason=${reason} details=${details || ''}`);
    // 첫 시도는 dev URL, 실패 시 번들, 모두 안 되면 에러 안내
    if (!attemptedFallback && hasRendererFile) {
      attemptedFallback = true;
      attemptLoad('fallback-after-error').catch(() => {});
    } else {
      attemptLoad('retry-after-error').catch(() => {});
    }
  };

  win.webContents.on('render-process-gone', (_e, details) => {
    reloadOnError('render-process-gone', details?.reason);
  });
  win.webContents.on('did-fail-load', (_event, code, desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    reloadOnError('did-fail-load', `${code}:${desc}`);
  });
  win.webContents.on('unresponsive', () => reloadOnError('unresponsive', ''));

  // Security: prevent renderer from navigating to external URLs
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocal =
        parsed.protocol === 'file:' ||
        parsed.protocol === 'groundview-file:' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1';
      if (!isLocal) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  // Security: block renderer from opening new browser windows
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(`[renderer-console] level=${level} source=${sourceId}:${line} msg=${message}`);
  });
  win.webContents.on('did-finish-load', () => {
    writeLog('[renderer] did-finish-load');
  });

  attemptLoad('initial')
    .catch((e) => {
      writeLog(`[renderer-load-error] ${e.message || e}`);
    })
    .finally(() => {
      cleanServiceWorkerStorage().catch(() => {});
    });
};

const logFile = () => path.join(app.getPath('userData'), 'groundview.log');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settingsLockFile = () => path.join(app.getPath('userData'), 'settings.lock');

const parseSettingsJson = (raw) => {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: true, data: {}, repaired: false };
    }
    return { ok: true, data, repaired: false };
  } catch (err) {
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace !== -1) {
      const sliced = raw.slice(0, lastBrace + 1);
      try {
        const data = JSON.parse(sliced);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { ok: true, data: {}, repaired: true };
        }
        return { ok: true, data, repaired: true };
      } catch {
        // fall through
      }
    }
    return { ok: false, error: err };
  }
};

const acquireSettingsLock = async (timeoutMs = 2000, delayMs = 50) => {
  const start = Date.now();
  const lockPath = settingsLockFile();
  while (true) {
    try {
      const fh = await fs.open(lockPath, 'wx');
      await fh.writeFile(String(process.pid));
      return fh;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 10000) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {
        // ignore stat/unlink errors
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('settings lock timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

const releaseSettingsLock = async (fh) => {
  try {
    if (fh) await fh.close();
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(settingsLockFile());
  } catch {
    /* ignore */
  }
};

const withSettingsLock = async (fn) => {
  let lock = null;
  try {
    lock = await acquireSettingsLock();
    return await fn();
  } finally {
    await releaseSettingsLock(lock);
  }
};

const readSettingsWithRetry = async (attempts = 3, delayMs = 50) => {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const raw = await fs.readFile(settingsFile(), 'utf8');
      const parsed = parseSettingsJson(raw);
      if (parsed.ok) return parsed;
      lastErr = parsed.error;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return { ok: false, error: lastErr };
};

const writeSettingsAtomic = async (data) => {
  const target = settingsFile();
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.settings.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    await fs.rename(tmp, target);
  } catch (e) {
    try {
      await fs.copyFile(tmp, target);
    } finally {
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }
};

const resolvePythonBin = () => {
  // Fast-path: if PYTHON_BIN points to the bundled python-bundle, trust it
  // unconditionally — don't run spawnSync version check, which fails in APPX
  // sandbox because WindowsApps paths aren't executable via spawnSync at this
  // stage (the APPX identity restriction).  The bundled python.exe is always
  // 3.10, so the version check is redundant.
  const envBin = process.env.PYTHON_BIN;
  if (envBin && envBin.includes('python-bundle') && fsSync.existsSync(envBin)) {
    return { cmd: envBin, prefixArgs: [] };
  }

  const candidates = [];
  const seen = new Set();
  const add = (cmd, prefixArgs = []) => {
    if (!cmd) return;
    const key = `${cmd}|${prefixArgs.join(' ')}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ cmd, prefixArgs });
  };

  add(process.env.PYTHON_BIN);

  const roots = [process.cwd(), path.join(__dirname, '..')];
  if (process.resourcesPath) roots.push(process.resourcesPath);
  const venvDirs = ['.venv', 'venv'];
  const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const binNames = process.platform === 'win32' ? ['python.exe', 'python'] : ['python3', 'python'];
  const bundledPy = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
  const bundledCandidates = [
    // Primary: extraResources 'resources/**/*' maps to {resourcesPath}/resources/python-bundle/
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'python-bundle', bundledPy),
    process.resourcesPath && path.join(process.resourcesPath, 'third_party', 'python', bundledPy),
    process.resourcesPath && path.join(process.resourcesPath, 'python', bundledPy),
    path.join(__dirname, '..', 'third_party', 'python', bundledPy)
  ];
  bundledCandidates.forEach((c) => add(c));
  const probePythonUnder = (base) => {
    if (!base) return;
    try {
      const stat = fsSync.statSync(base);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }
    const subdirs = new Set([
      '',
      'python',
      'python-embed',
      'python_embed',
      'pythonportable',
      'python-portable',
      'python3',
      'Python',
      'Python311',
      'Python312',
      'Python313',
      'py',
      'py310',
      'py311',
      'py312',
      'py313'
    ]);
    try {
      fsSync
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /python/i.test(d.name))
        .forEach((d) => subdirs.add(d.name));
    } catch {
      /* ignore */
    }
    for (const sub of subdirs) {
      const dir = sub ? path.join(base, sub) : base;
      for (const bin of binNames) {
        add(path.join(dir, bin));
      }
    }
  };

  for (const root of roots) {
    for (const dir of venvDirs) {
      for (const bin of binNames) {
        add(path.join(root, dir, binDir, bin));
      }
    }
  }

  const execDir = process.execPath ? path.dirname(process.execPath) : null;
  probePythonUnder(process.resourcesPath && path.join(process.resourcesPath, 'third_party'));
  probePythonUnder(path.join(__dirname, '..', 'third_party'));
  probePythonUnder(path.join(process.cwd(), 'third_party'));
  probePythonUnder(execDir);
  probePythonUnder(execDir && path.join(execDir, 'resources'));
  if (process.platform === 'win32') {
    add(path.join('C:\\', 'GroundView', 'venv', 'Scripts', 'python.exe'));
    probePythonUnder(path.join('C:\\', 'GroundView', 'third_party'));
    probePythonUnder(path.join('C:\\', 'GroundView'));
    add('py', ['-3']);
    add('py');
  }

  add('python3');
  add('python');

  for (const candidate of candidates) {
    try {
      const res = spawnSync(candidate.cmd, [...candidate.prefixArgs, '--version'], {
        windowsHide: true,
        encoding: 'utf8'
      });
      if (res.error || res.status !== 0) continue;
      const versionText = `${res.stdout || ''}${res.stderr || ''}`;
      const match =
        versionText.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i) || versionText.match(/Python\s+(\d+)\.(\d+)/i);
      if (!match) continue;
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (Number.isNaN(major) || Number.isNaN(minor)) continue;
      if (major > 3 || (major === 3 && minor >= 10)) {
        return candidate;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
};

// Check and install Python dependencies
const ensurePythonDependencies = async (python, writeLog) => {
  await writeLog('Checking Python dependencies...');

  // If using the bundled python-bundle, all packages are pre-installed — skip pip entirely.
  // Runtime pip install is not permitted in Windows Store packages (Policy 10.8.7).
  // Check the ACTUAL python cmd being used (not just PYTHON_BIN env var), so a fallback
  // to system 'py -3' doesn't incorrectly skip the dependency check.
  const isBundledPython =
    python.cmd && python.cmd.includes('python-bundle');
  if (isBundledPython) {
    await writeLog('Using bundled Python — skipping dependency check');
    return { ok: true };
  }

  // Find requirements.txt
  const packedReqs = path.join(process.resourcesPath || '', 'requirements.txt');
  const devReqs = path.join(__dirname, '../requirements.txt');
  const isDev = process.env.NODE_ENV === 'development';
  const reqsPath = isDev && fsSync.existsSync(devReqs)
    ? devReqs
    : fsSync.existsSync(packedReqs)
    ? packedReqs
    : null;

  if (!reqsPath) {
    await writeLog('WARNING: requirements.txt not found, skipping dependency check');
    return { ok: true };
  }

  // Check if critical packages are installed
  const criticalPackages = ['fastapi', 'uvicorn', 'cryptography'];
  const missingPackages = [];

  for (const pkg of criticalPackages) {
    try {
      const checkCmd = [...(python.prefixArgs || []), '-c', `import ${pkg}`];
      const result = spawnSync(python.cmd, checkCmd, {
        windowsHide: true,
        encoding: 'utf8'
      });
      if (result.status !== 0) {
        missingPackages.push(pkg);
      }
    } catch {
      missingPackages.push(pkg);
    }
  }

  if (missingPackages.length === 0) {
    await writeLog('All required Python packages are installed');
    return { ok: true };
  }

  await writeLog(`Missing packages: ${missingPackages.join(', ')}`);
  await writeLog('Installing required Python packages...');

  // Try to install missing packages
  try {
    const installCmd = [
      ...(python.prefixArgs || []),
      '-m',
      'pip',
      'install',
      '-r',
      reqsPath,
      '--quiet',
      '--no-warn-script-location'
    ];

    const installResult = spawnSync(python.cmd, installCmd, {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 120000 // 2 minutes timeout
    });

    if (installResult.status === 0) {
      await writeLog('Python packages installed successfully');
      return { ok: true };
    } else {
      const errMsg = `${installResult.stdout || ''}\n${installResult.stderr || ''}`.trim();
      await writeLog(`Package installation failed: ${errMsg}`);
      return {
        ok: false,
        error: `필요한 Python 패키지를 설치할 수 없습니다.\n\n수동으로 설치하세요:\n${python.cmd} -m pip install -r requirements.txt\n\n에러: ${errMsg.slice(0, 300)}`
      };
    }
  } catch (err) {
    await writeLog(`Exception during package installation: ${err.message}`);
    return {
      ok: false,
      error: `Python 패키지 설치 중 오류가 발생했습니다.\n\n수동으로 설치하세요:\n${python.cmd} -m pip install -r requirements.txt`
    };
  }
};

// Start Python backend server
const startPythonServer = async () => {
  const logPath = logFile();
  const writeServerLog = async (msg) => {
    try {
      await fs.appendFile(logPath, `[server] ${msg}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  };

  // Find Python binary
  const python = resolvePythonBin();
  if (!python) {
    await writeServerLog('ERROR: Python 3.10+ not found');
    return { ok: false, error: 'Python 3.10+ 실행 파일을 찾지 못했습니다.\n\nPython 3.10 이상을 설치해주세요: https://www.python.org/downloads/' };
  }

  await writeServerLog(`Found Python: ${python.cmd} ${python.prefixArgs?.join(' ') || ''}`);

  // Check and install dependencies
  const depsResult = await ensurePythonDependencies(python, writeServerLog);
  if (!depsResult.ok) {
    return depsResult;
  }

  // Find server.py script
  const packedScript = path.join(process.resourcesPath || '', 'backend', 'server.py');
  const devScript = path.join(__dirname, '../backend/server.py');
  const isDev = process.env.NODE_ENV === 'development';
  const scriptPath = isDev && fsSync.existsSync(devScript)
    ? devScript
    : fsSync.existsSync(packedScript)
    ? packedScript
    : devScript;

  if (!fsSync.existsSync(scriptPath)) {
    await writeServerLog(`ERROR: server.py not found at ${scriptPath}`);
    return { ok: false, error: `server.py를 찾을 수 없습니다: ${scriptPath}` };
  }

  const port = process.env.MODEL_PORT || '5005';
  const { key: geminiKey, model: geminiModel } = loadGeminiEnv();

  // Build PYTHONPATH: include backend dir (for settings_manager/webview_ocr) and
  // bundled site-packages as explicit fallback in case .pth file isn't processed
  // correctly in the MSIX sandbox environment.
  const pythonPathParts = [path.dirname(scriptPath)];
  if (python.cmd && python.cmd.includes('python-bundle')) {
    const bundleDir = path.dirname(python.cmd);
    pythonPathParts.push(
      path.join(bundleDir, 'Lib', 'site-packages'),
      path.join(bundleDir, 'Lib'),
      bundleDir
    );
  }
  const pythonPath = pythonPathParts.join(path.delimiter);

  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONNOUSERSITE: '1',  // Don't load user site-packages (prevents host env pollution)
    MODEL_PORT: port,
    GROUNDVIEW_SETTINGS_DIR: effectiveUserDataPath,
    GEMINI_API_KEY: geminiKey || process.env.GEMINI_API_KEY,
    GEMINI_MODEL: geminiModel || process.env.GEMINI_MODEL,
    PYTHONPATH: pythonPath
  };

  const args = [...(python.prefixArgs || []), scriptPath];

  await writeServerLog(`Starting server: ${python.cmd} ${args.join(' ')}`);
  await writeServerLog(`Port: ${port}, Script: ${scriptPath}`);

  return new Promise((resolve) => {
    try {
      // MSIX: process.cwd() points to the read-only WindowsApps install folder.
      // Use the script directory (resources/backend/) as cwd so Python relative imports work,
      // and ensure writes go through GROUNDVIEW_SETTINGS_DIR (userData) instead.
      backendProcess = spawn(python.cmd, args, {
        windowsHide: true,
        env,
        cwd: path.dirname(scriptPath)
      });

      let serverExitCode = null;
      backendProcess.stdout.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) writeServerLog(`STDOUT: ${msg}`);
      });

      backendProcess.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) writeServerLog(`STDERR: ${msg}`);
      });

      backendProcess.on('error', (err) => {
        writeServerLog(`ERROR: ${err.message}`);
        serverExitCode = -1;
      });

      backendProcess.on('close', (code) => {
        writeServerLog(`Process exited with code ${code}`);
        serverExitCode = code ?? -1;
        backendProcess = null;
      });

      // Wait for server to be ready (check if port is listening)
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = 1000;
      let resolved = false;

      const checkServer = () => {
        if (resolved) return;

        // Fail fast if the process already exited
        if (serverExitCode !== null) {
          resolved = true;
          writeServerLog(`Server process exited (code ${serverExitCode}) before becoming ready`);
          resolve({ ok: false, error: `Python 프로세스가 시작 직후 종료되었습니다 (code ${serverExitCode}).\n\n로그 파일을 확인하세요: ${logPath}` });
          return;
        }

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: parseInt(port, 10),
            path: '/healthz',
            method: 'GET',
            timeout: 1000
          },
          (res) => {
            if (resolved) return;
            if (res.statusCode === 200 || res.statusCode === 404) {
              resolved = true;
              writeServerLog('Server is ready!');
              resolve({ ok: true });
            } else {
              retryCheck();
            }
          }
        );

        req.on('error', () => {
          if (!resolved) retryCheck();
        });

        req.end();
      };

      const retryCheck = () => {
        if (resolved) return;
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkServer, checkInterval);
        } else {
          resolved = true;
          writeServerLog(`ERROR: Server not ready after ${maxAttempts}s`);
          resolve({ ok: false, error: `백엔드 서버가 ${maxAttempts}초 내에 응답하지 않습니다.\n로그: ${logPath}` });
        }
      };

      // Start checking after a short delay
      setTimeout(checkServer, 1000);
    } catch (err) {
      writeServerLog(`ERROR: Failed to spawn server: ${err.message}`);
      resolve({ ok: false, error: err.message });
    }
  });
};

async function scanAdbPaths() {
  const candidates = [];
  const addCandidate = (rawPath) => {
    if (!rawPath) return;
    const trimmed = String(rawPath).trim();
    if (!trimmed) return;
    const unquoted =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ? trimmed.slice(1, -1)
        : trimmed;
    if (!unquoted) return;
    candidates.push(path.normalize(unquoted));
  };
  const dedupeKey = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const isWindowsAppsAlias = (p) =>
    process.platform === 'win32' &&
    p.toLowerCase().includes('\\appdata\\local\\microsoft\\windowsapps\\');
  const exists = (p) => {
    try {
      // F_OK only: X_OK is not reliable on Windows package-identity contexts.
      fsSync.accessSync(p, fsSync.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  };
  const adbSpawnSyncOptions = (bin) => {
    const adbDir = path.dirname(bin);
    return {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000,
      cwd: adbDir,
      env: {
        ...process.env,
        PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}`
      }
    };
  };
  const isValidAdbBinary = (bin) => {
    try {
      const res = spawnSync(bin, ['version'], adbSpawnSyncOptions(bin));
      if (res.error || res.status !== 0) {
        writeAdbLog(
          `verify failed path=${bin} status=${res.status} error=${res.error?.message || ''} output=${compactLogText(`${res.stdout || ''}${res.stderr || ''}`)}`
        );
        return false;
      }
      const text = `${res.stdout || ''}${res.stderr || ''}`;
      const ok = /Android Debug Bridge/i.test(text);
      if (!ok) writeAdbLog(`verify rejected path=${bin} output=${compactLogText(text)}`);
      return ok;
    } catch (e) {
      writeAdbLog(`verify exception path=${bin} error=${e.message || e}`);
      return false;
    }
  };

  // 0) MSIX 번들 adb (최우선)
  // MSIX(Desktop AppX Container) 컨텍스트에서 user AppData 경로의 DLL을
  // 로드할 수 없는 문제(0xC0000135)를 우회하기 위해 패키지 내부에 번들된
  // adb를 최우선으로 사용한다.
  // scripts/bundle-adb.js 로 복사되고, extraResources로 패키지에 포함된다.
  if (isMsix && process.resourcesPath) {
    addCandidate(path.join(process.resourcesPath, 'resources', 'adb', 'adb.exe'));
  }

  // 1) where / which (PATH fallback)
  if (process.platform === 'win32') {
    // In MSIX, where.exe can return alias paths that are not real adb binaries.
    if (!isMsix) {
      try {
        const out = execSync('where adb', { encoding: 'utf8', windowsHide: true, timeout: 3000 });
        out.split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && l.toLowerCase().endsWith('.exe'))
          .forEach(addCandidate);
      } catch {
        /* not in PATH */
      }
    }
  } else {
    try {
      const out = execSync('which adb', { encoding: 'utf8', timeout: 3000 });
      out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach(addCandidate);
    } catch {
      /* not in PATH */
    }
  }

  // 2) Android Studio / SDK Manager known install paths
  if (process.platform === 'win32') {
    const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
    for (const root of sdkRoots) {
      addCandidate(path.join(root, 'platform-tools', 'adb.exe'));
    }

    const home = os.homedir();
    const bases = [
      process.env.LOCALAPPDATA,
      process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local'),
      process.env.APPDATA && path.join(process.env.APPDATA, '..', 'Local'),
      home && path.join(home, 'AppData', 'Local'),
      process.env.USERNAME && `C:\\Users\\${process.env.USERNAME}`,
      'C:\\Users\\Default'
    ].filter(Boolean);
    for (const base of bases) {
      addCandidate(path.join(base, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
      addCandidate(path.join(base, 'Android', 'sdk', 'platform-tools', 'adb.exe'));
    }

    addCandidate(path.join(process.resourcesPath || '', 'resources', 'platform-tools', 'adb.exe'));
    addCandidate(path.join(home || os.homedir(), 'platform-tools', 'adb.exe'));
    addCandidate('C:\\platform-tools\\adb.exe');
    addCandidate('C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe');
    addCandidate('C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe');
    addCandidate(path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Android Studio', 'bin', 'adb.exe'));
    addCandidate(path.join(process.env.USERPROFILE || '', 'scoop', 'apps', 'adb', 'current', 'adb.exe'));
    addCandidate('C:\\ProgramData\\chocolatey\\bin\\adb.exe');
    addCandidate(path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'adb.exe'));
  }

  // 3) macOS / Linux
  if (process.platform === 'darwin') {
    addCandidate(path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'));
    addCandidate('/usr/local/bin/adb');
    addCandidate('/opt/homebrew/bin/adb');
  } else if (process.platform === 'linux') {
    addCandidate(path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'));
    addCandidate('/usr/bin/adb');
    addCandidate('/usr/local/bin/adb');
  }

  const seen = new Set();
  const existing = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = dedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isWindowsAppsAlias(candidate)) continue;
    if (exists(candidate)) existing.push(candidate);
  }

  // Prefer real adb binaries (reject stale shims/aliases when possible).
  const verified = existing.filter((bin) => isValidAdbBinary(bin));
  const result = verified.length > 0 ? verified : existing;
  writeAdbLog(
    `scan isMsix=${isMsix} candidates=${candidates.length} existing=${existing.length} verified=${verified.length} result=${compactJson(result)}`
  );
  return result;
}

ipcMain.handle('adb:listDevices', async () => {
  const currentAdb = adb.getAdbPath();
  writeAdbLog(`listDevices start adbPath=${currentAdb}`);
  try {
    const devices = await adb.listDevices();
    writeAdbLog(`listDevices ok count=${devices.length} devices=${compactJson(devices)}`);
    return devices;
  } catch (e) {
    writeAdbLog(`listDevices error adbPath=${currentAdb} code=${e.code || ''} message=${e.message || e}`);
    // ADB binary not found (not yet detected or not installed)
    // silently return empty list — polling will retry; no error spam
    if (e.code === 'ENOENT' || (e.message && e.message.includes('ENOENT'))) {
      // Trigger async re-scan to find ADB path for next poll cycle
      scanAdbPaths().then(found => {
        if (found.length > 0) {
          adb.setAdbPath(found[0]);
          writeAdbLog(`listDevices auto-detected after ENOENT adbPath=${found[0]}`);
        }
      }).catch((scanErr) => {
        writeAdbLog(`listDevices auto-scan after ENOENT failed error=${scanErr.message || scanErr}`);
      });
      return [];
    }
    throw e;
  }
});
ipcMain.handle('adb:capture', async (_e, id) => {
  writeAdbLog(`capture start deviceId=${id} adbPath=${adb.getAdbPath()}`);
  try {
    const result = await adb.capture(id);
    writeAdbLog(
      `capture result deviceId=${id} screenshot=${result?.screenshotPath || ''} xml=${result?.xmlPath || result?.xmlPathUncompressed || result?.xmlPathCompressed || ''} method=${result?.captureMethod || ''} error=${result?.error || ''}`
    );
    return result;
  } catch (e) {
    writeAdbLog(`capture error deviceId=${id} message=${e.message || e}`);
    throw e;
  }
});
ipcMain.handle('adb:health', async () => {
  writeAdbLog(`health start adbPath=${adb.getAdbPath()}`);
  const result = await adb.health();
  writeAdbLog(`health result=${compactJson(result)}`);
  return result;
});
ipcMain.handle('adb:setPath', async (_e, bin) => {
  writeAdbLog(`setPath requested path=${bin}`);
  adb.setAdbPath(bin);
  // Persist to settings
  try {
    await withSettingsLock(async () => {
      const parsed = await readSettingsWithRetry();
      const current = parsed.ok && parsed.data ? parsed.data : {};
      await writeSettingsAtomic({ ...current, adbPath: bin });
    });
    writeAdbLog(`setPath persisted path=${bin}`);
  } catch (e) {
    writeAdbLog(`setPath persist failed path=${bin} error=${e.message || e}`);
  }
  return { ok: true, details: `ADB path set to: ${adb.getAdbPath()}` };
});
ipcMain.handle('adb:autoDetect', async () => {
  writeAdbLog('autoDetect start');
  const found = await scanAdbPaths();
  writeAdbLog(`autoDetect found=${compactJson(found)}`);
  if (found.length > 0) {
    adb.setAdbPath(found[0]);
    try {
      await withSettingsLock(async () => {
        const parsed = await readSettingsWithRetry();
        const current = parsed.ok && parsed.data ? parsed.data : {};
        await writeSettingsAtomic({ ...current, adbPath: found[0] });
      });
      writeAdbLog(`autoDetect persisted path=${found[0]}`);
    } catch (e) {
      writeAdbLog(`autoDetect persist failed path=${found[0]} error=${e.message || e}`);
    }
    return { ok: true, path: found[0], all: found };
  }
  return { ok: false, all: [] };
});
ipcMain.handle('adb:getPath', () => adb.getAdbPath());
ipcMain.handle('adb:scan', async () => {
  writeAdbLog('scan ipc start');
  const found = await scanAdbPaths();
  writeAdbLog(`scan ipc result=${compactJson(found)}`);
  return found;
});
ipcMain.handle('ios:listDevices', async () => wda.listDevices());
ipcMain.handle('ios:capture', async (_e, id) => wda.capture(id));
ipcMain.handle('ios:health', async () => wda.health());
ipcMain.handle('fs:readText', async (_e, filePath) => {
  try {
    const resolved = path.resolve(filePath);
    const tmpDir = path.resolve(os.tmpdir());
    const userDir = path.resolve(app.getPath('userData'));
    // Security: only allow reads from temp and userData directories
    const isAllowed =
      resolved.startsWith(tmpDir + path.sep) ||
      resolved.startsWith(userDir + path.sep);
    if (!isAllowed) {
      return { ok: false, error: 'Access denied: path outside allowed directories' };
    }
    const data = await fs.readFile(resolved, 'utf8');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('log:write', async (_e, message) => {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(logFile(), line, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('settings:load', async () => {
  try {
    const readRes = await readSettingsWithRetry();
    if (readRes.ok) {
      if (readRes.repaired) {
        try {
          await writeSettingsAtomic(readRes.data);
        } catch {
          /* ignore */
        }
      }
      return { ok: true, data: readRes.data };
    }
    return { ok: true, data: {} };
  } catch {
    return { ok: true, data: {} };
  }
});

ipcMain.handle('settings:save', async (_e, obj) => {
  try {
    return await withSettingsLock(async () => {
      const target = settingsFile();
      const exists = fsSync.existsSync(target);
      const readRes = await readSettingsWithRetry();
      if (!readRes.ok && exists) {
        try {
          await fs.appendFile(
            logFile(),
            `[settings] read failed, skip save to avoid losing gemini key: ${readRes.error?.message || readRes.error}\n`,
            'utf8'
          );
        } catch {
          /* ignore */
        }
        return { ok: false, error: 'settings read failed; retry' };
      }
      const existing = readRes.ok ? readRes.data : {};

      // Merge new settings with existing, preserving gemini keys
      const merged = {
        ...existing,
        ...obj
      };
      if (existing.geminiApiKeyEncrypted) {
        merged.geminiApiKeyEncrypted = existing.geminiApiKeyEncrypted;
      }
      if (existing.geminiApiKey && !merged.geminiApiKeyEncrypted) {
        merged.geminiApiKey = existing.geminiApiKey;
      }

      await writeSettingsAtomic(merged);
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dialog:openADB', async () => {
  const filters = [
    { name: 'ADB', extensions: process.platform === 'win32' ? ['exe'] : [''] }
  ];
  const scanned = await scanAdbPaths();
  const pickFile = scanned.find((p) => p && p.toLowerCase().endsWith('adb.exe'));
  const defaultPath =
    pickFile ||
    (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools')
      : undefined);
  const res = await dialog.showOpenDialog({
    title: 'Select ADB Executable',
    filters,
    defaultPath,
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  return { ok: true, path: res.filePaths[0] };
});

ipcMain.handle('dump:pick', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Select dump ZIP',
    filters: [{ name: 'ZIP Files', extensions: ['zip'] }],
    defaultPath: lastZipDir || app.getPath('downloads'),
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  const filePath = res.filePaths[0];
  lastZipDir = path.dirname(filePath);
  const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'groundview-import-'));
  try {
    // unzip to tmp
    const ps = [
      'Expand-Archive',
      '-Path',
      `"${filePath}"`,
      '-DestinationPath',
      `"${tmpDir}"`,
      '-Force'
    ].join(' ');
    await new Promise((resolve, reject) => {
      exec(`powershell -Command ${ps}`, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      });
    });
  } catch (e) {
    return { ok: false, error: `unzip failed: ${e.message}` };
  }
  const metadataPath = path.join(tmpDir, 'metadata.json');
  const xmlPath = path.join(tmpDir, 'ui_hierarchy.xml');
  let metadata = {};
  let xml = '';
  try {
    const metaRaw = await fs.readFile(metadataPath, 'utf8');
    metadata = JSON.parse(metaRaw);
  } catch (e) {
    return { ok: false, error: `metadata.json 읽기 실패: ${e.message}` };
  }
  try {
    xml = await fs.readFile(xmlPath, 'utf8');
  } catch (e) {
    return { ok: false, error: `ui_hierarchy.xml 읽기 실패: ${e.message}` };
  }
  let screenshotPath = path.join(tmpDir, 'screenshot.png');
  try {
    fsSync.accessSync(screenshotPath);
  } catch {
    const files = fsSync.readdirSync(tmpDir).filter((f) => f.toLowerCase().endsWith('.png'));
    if (files[0]) {
      screenshotPath = path.join(tmpDir, files[0]);
    } else {
      screenshotPath = '';
    }
  }
  return {
    ok: true,
    data: {
      metadata,
      xml,
      screenshotPath: screenshotPath || undefined,
      xmlPath
    }
  };
});

ipcMain.handle('external:open', async (_e, url) => {
  if (!url) return { ok: false, error: 'no url' };
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Only https:// and http:// URLs are allowed' };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dump:export', async (_e, payload) => {
  try {
    const { xmlPath, screenshotPath, metadata, deviceId } = payload || {};
    if (!xmlPath || !screenshotPath) {
      return { ok: false, error: 'xmlPath or screenshotPath missing' };
    }
    const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'groundview-export-'));
    const metaPath = path.join(tmpDir, 'metadata.json');
    fsSync.copyFileSync(xmlPath, path.join(tmpDir, 'ui_hierarchy.xml'));
    fsSync.copyFileSync(screenshotPath, path.join(tmpDir, 'screenshot.png'));
    fsSync.writeFileSync(metaPath, JSON.stringify(metadata || {}, null, 2), 'utf8');
    const ts = (metadata?.timestamp || new Date().toISOString()).replace(/[:]/g, '-');
    const fileName = `capture_${deviceId || 'device'}_${ts}.zip`;
    const dialogRes = await dialog.showSaveDialog({
      title: 'Save GroundView ZIP',
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
    });
    if (dialogRes.canceled || !dialogRes.filePath) {
      return { ok: false, error: 'save canceled' };
    }
    const zipPath = dialogRes.filePath;
    const ps = [
      'Compress-Archive',
      '-Path',
      `"${path.join(tmpDir, '*')}"`,
      '-DestinationPath',
      `"${zipPath}"`,
      '-Force'
    ].join(' ');
    await new Promise((resolve, reject) => {
      exec(
        `powershell -Command ${ps}`,
        { windowsHide: true },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(stdout);
        }
      );
    });
    return { ok: true, path: zipPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('webview:ocr', async (_e, imagePath, opts) => {
  try {
    if (!imagePath) return { ok: false, error: 'imagePath is required' };
    const packedScript = path.join(process.resourcesPath || '', 'backend', 'webview_ocr.py');
    const devScript = path.join(__dirname, '../backend/webview_ocr.py');
    const isDev = process.env.NODE_ENV === 'development';
    const scriptPath = isDev && fsSync.existsSync(devScript)
      ? devScript
      : fsSync.existsSync(packedScript)
      ? packedScript
      : devScript;
    if (!fsSync.existsSync(scriptPath)) {
      return { ok: false, error: `OCR script not found: ${scriptPath}` };
    }
    const python = resolvePythonBin();
    if (!python) {
      return {
        ok: false,
        error:
          'Python 3.10+ 실행 파일을 찾지 못했습니다. Python을 설치한 뒤 PATH에 추가하거나 PYTHON_BIN 환경변수로 python.exe 경로를 지정해 주세요.'
      };
    }
    const args = [
      ...(python.prefixArgs || []),
      scriptPath,
      '--image',
      imagePath,
      '--lang',
      (opts && opts.lang) || 'korean',
      '--ocr-version',
      (opts && opts.ocrVersion) || 'v4',
      '--scale',
      String((opts && opts.scale) || '1.0'),
      '--mode',
      (opts && opts.mode) || 'text'
    ];
    if (opts && opts.bounds) {
      args.push('--crop', opts.bounds);
    }
    if (opts && opts.mode === 'gemini') {
      args.push('--gemini-model', opts.geminiModel || 'gemini-1.5-flash-latest');
      if (opts.geminiPrompt) args.push('--gemini-prompt', opts.geminiPrompt);
    }
    const { key: geminiKey, model: geminiModel } = loadGeminiEnv();
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      GEMINI_API_KEY: geminiKey || process.env.GEMINI_API_KEY,
      GEMINI_MODEL: geminiModel || process.env.GEMINI_MODEL
    };

    const output = await new Promise((resolve, reject) => {
      const ps = spawn(python.cmd, args, {
        windowsHide: true,
        env
      });
      let stdout = '';
      let stderr = '';
      ps.stdout.on('data', (d) => (stdout += d.toString()));
      ps.stderr.on('data', (d) => (stderr += d.toString()));
      ps.on('error', reject);
      ps.on('close', (code) => {
        const out = (stdout || '').trim();
        const err = (stderr || '').trim();
        if (code === 0 && out) return resolve(out);
        if (code === 0 && err) return resolve(err);
        return reject(new Error(err || out || `python exited with code ${code}`));
      });
    });
    try {
      const parsed = JSON.parse(output);
      return parsed;
    } catch {
      return { ok: false, error: `Failed to parse OCR output: ${output.slice(0, 200)}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Gemini 기반 Appium 로케이터/코드 제안
// Gemini locator generation is now handled by backend API
// See: POST /api/locator/gemini in backend/server.py

// ─── 환경 진단 ─────────────────────────────────────────────────────────────
ipcMain.handle('env:diagnose', async () => {
  writeAdbLog(`diagnose start platform=${process.platform} isMsix=${isMsix} currentAdb=${adb.getAdbPath()}`);
  const result = {
    adbFound: false,
    adbPath: null,
    adbVersion: null,
    readyDevices: [],
    unauthorizedDevices: [],
    offlineDevices: [],
    androidStudioFound: false,
    platformToolsUrl: process.platform === 'darwin'
      ? 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip'
      : process.platform === 'linux'
      ? 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip'
      : 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  };

  // ADB 경로 검색
  const found = await scanAdbPaths();
  const currentAdb = adb.getAdbPath();
  // currentAdb가 실제 존재하면 우선 사용
  const effectiveAdb = (currentAdb && currentAdb !== 'adb' && found.includes(currentAdb))
    ? currentAdb
    : found[0] || null;
  writeAdbLog(`diagnose scan found=${compactJson(found)} current=${currentAdb} effective=${effectiveAdb || ''}`);

  if (effectiveAdb) {
    result.adbFound = true;
    result.adbPath = effectiveAdb;

    // ADB 버전 확인
    try {
      const ver = await new Promise((resolve, reject) => {
        const adbDir = path.dirname(effectiveAdb);
        const ps = spawn(effectiveAdb, ['version'], {
          windowsHide: true,
          cwd: adbDir,
          env: { ...process.env, PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}` }
        });
        let out = '';
        ps.stdout.on('data', d => { out += d.toString(); });
        ps.stderr.on('data', d => { out += d.toString(); });
        ps.on('error', reject);
        ps.on('close', () => resolve(out.trim()));
      });
      result.adbVersion = ver.split('\n')[0] || ver;
      writeAdbLog(`diagnose version=${compactLogText(result.adbVersion)}`);
    } catch (e) {
      writeAdbLog(`diagnose version failed path=${effectiveAdb} error=${e.message || e}`);
    }

    // adb devices 원본 출력 파싱 (unauthorized 포함)
    try {
      await new Promise((resolve) => {
        const adbDir = path.dirname(effectiveAdb);
        const ps = spawn(effectiveAdb, ['start-server'], {
          windowsHide: true,
          cwd: adbDir,
          env: { ...process.env, PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}` }
        });
        let out = '';
        ps.stdout.on('data', d => { out += d.toString(); });
        ps.stderr.on('data', d => { out += d.toString(); });
        ps.on('error', (e) => {
          writeAdbLog(`diagnose start-server error=${e.message || e}`);
          resolve();
        });
        ps.on('close', (code) => {
          writeAdbLog(`diagnose start-server close code=${code} output=${compactLogText(out)}`);
          resolve();
        });
        setTimeout(() => { try { ps.kill(); } catch {} resolve(); }, 6000);
      });
      const raw = await new Promise((resolve, reject) => {
        const adbDir = path.dirname(effectiveAdb);
        const ps = spawn(effectiveAdb, ['devices', '-l'], {
          windowsHide: true,
          cwd: adbDir,
          env: { ...process.env, PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}` }
        });
        let out = '';
        ps.stdout.on('data', d => { out += d.toString(); });
        ps.stderr.on('data', d => { out += d.toString(); });
        ps.on('error', reject);
        ps.on('close', () => resolve(out));
        setTimeout(() => { try { ps.kill(); } catch {} resolve(out); }, 8000);
      });
      const lines = raw.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('List of devices') && !l.startsWith('*'));
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;
        const id = parts[0];
        const status = parts[1];
        if (status === 'device') result.readyDevices.push(id);
        else if (status === 'unauthorized') result.unauthorizedDevices.push(id);
        else if (status === 'offline') result.offlineDevices.push(id);
      }
      writeAdbLog(
        `diagnose devices raw=${compactLogText(raw)} ready=${compactJson(result.readyDevices)} unauthorized=${compactJson(result.unauthorizedDevices)} offline=${compactJson(result.offlineDevices)}`
      );
    } catch (e) {
      writeAdbLog(`diagnose devices failed path=${effectiveAdb} error=${e.message || e}`);
    }
  } else {
    writeAdbLog('diagnose no effective adb path');
  }

  // Android Studio 설치 여부 확인
  const asCandidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Android', 'Android Studio'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Android', 'Android Studio'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio'),
        path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Android Studio'),
      ]
    : [
        '/Applications/Android Studio.app',
        path.join(os.homedir(), 'Applications', 'Android Studio.app'),
      ];
  result.androidStudioFound = asCandidates.some(p => {
    try { fsSync.accessSync(p); return true; } catch { return false; }
  });

  writeAdbLog(`diagnose result=${compactJson(result)}`);
  return result;
});

ipcMain.handle('env:downloadAdb', async () => {
  const zipUrl = process.platform === 'darwin'
    ? 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip'
    : process.platform === 'linux'
    ? 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip'
    : 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

  const destDir = path.join(os.homedir(), 'platform-tools');
  const zipPath = path.join(os.tmpdir(), 'platform-tools.zip');

  try {
    // 다운로드
    await new Promise((resolve, reject) => {
      const file = fsSync.createWriteStream(zipPath);
      const protocol = zipUrl.startsWith('https') ? https : http;
      const req = protocol.get(zipUrl, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          // 리다이렉트 처리
          const redir = res.headers.location;
          const rdProtocol = redir.startsWith('https') ? https : http;
          rdProtocol.get(redir, res2 => {
            res2.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      req.on('error', reject);
      req.setTimeout(120000, () => { req.destroy(new Error('Download timed out')); });
    });

    // 압축 해제 (Windows: PowerShell 사용)
    if (process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const ps = spawn('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -Path "${zipPath}" -DestinationPath "${path.join(os.homedir())}" -Force`
        ], { windowsHide: true });
        ps.on('error', reject);
        ps.on('close', code => code === 0 ? resolve() : reject(new Error(`unzip failed: ${code}`)));
        setTimeout(() => { try { ps.kill(); } catch {} reject(new Error('Unzip timed out')); }, 60000);
      });
    } else {
      await new Promise((resolve, reject) => {
        const ps = spawn('unzip', ['-o', zipPath, '-d', os.homedir()], { windowsHide: true });
        ps.on('error', reject);
        ps.on('close', code => code === 0 ? resolve() : reject(new Error(`unzip failed: ${code}`)));
        setTimeout(() => { try { ps.kill(); } catch {} reject(new Error('Unzip timed out')); }, 60000);
      });
    }

    // ADB 경로 설정
    const adbExe = process.platform === 'win32'
      ? path.join(destDir, 'adb.exe')
      : path.join(destDir, 'adb');

    if (fsSync.existsSync(adbExe)) {
      if (process.platform !== 'win32') {
        try { fsSync.chmodSync(adbExe, 0o755); } catch { /* ignore */ }
      }
      adb.setAdbPath(adbExe);
      // 설정에 저장
      try {
        await withSettingsLock(async () => {
          const parsed = await readSettingsWithRetry();
          const current = parsed.ok && parsed.data ? parsed.data : {};
          await writeSettingsAtomic({ ...current, adbPath: adbExe });
        });
      } catch { /* ignore */ }
      return { ok: true, adbPath: adbExe };
    }
    return { ok: false, error: 'ADB 실행 파일을 찾을 수 없습니다.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.whenReady().then(() => {
  // Secure file protocol: serves screenshot/image files only from tmpdir or userData.
  // This replaces webSecurity:false + file:// approach, restricting access to allowed dirs only.
  protocol.handle('groundview-file', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      // Windows: /C:/Users/... → C:/Users/...
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      filePath = filePath.replace(/\//g, path.sep);
      const resolved = path.resolve(filePath);
      const tmpDir = path.resolve(os.tmpdir());
      const userDir = path.resolve(effectiveUserDataPath);
      // Windows: case-insensitive path comparison
      const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
      const isAllowed =
        norm(resolved).startsWith(norm(tmpDir) + path.sep) ||
        norm(resolved).startsWith(norm(userDir) + path.sep);
      if (!isAllowed) {
        return new Response('Forbidden', { status: 403 });
      }
      // Use fs.readFile for reliable file serving (avoids net.fetch quirks in packaged app)
      const data = await fs.readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      return new Response(data, { status: 200, headers: { 'Content-Type': mime } });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  cleanChromiumData()
    .catch(() => {})
    .finally(async () => {
      // Create window immediately so UI appears right away
      createWindow();

      // Start backend server in background — non-blocking
      startPythonServer().then((serverResult) => {
        if (!serverResult.ok) {
          // Log error silently; UI handles graceful degradation
          const logPath = logFile();
          fs.appendFile(logPath, `[server-start-failed] ${serverResult.error || 'unknown'}\n`, 'utf8').catch(() => {});
        }
      }).catch((err) => {
        fs.appendFile(logFile(), `[server-start-exception] ${err?.message || err}\n`, 'utf8').catch(() => {});
      });
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up backend process
  if (backendProcess && !backendProcess.killed) {
    try {
      backendProcess.kill();
    } catch {
      /* ignore */
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up backend process
  if (backendProcess && !backendProcess.killed) {
    try {
      backendProcess.kill();
    } catch {
      /* ignore */
    }
  }
  
  // Kill ADB server and related processes
  try {
    const { execSync } = require('child_process');
    
    // Stop ADB server gracefully first
    try {
      execSync('adb kill-server', { timeout: 3000, windowsHide: true });
    } catch {
      /* ignore if adb not found or already stopped */
    }
    
    // Force kill any remaining adb processes on Windows
    if (process.platform === 'win32') {
      try {
        execSync('taskkill /F /IM adb.exe /T', { timeout: 2000, windowsHide: true });
      } catch {
        /* ignore if no processes found */
      }
      try {
        execSync('taskkill /F /IM adb-backend.exe /T', { timeout: 2000, windowsHide: true });
      } catch {
        /* ignore if no processes found */
      }
    }
  } catch {
    /* ignore cleanup errors */
  }
});
