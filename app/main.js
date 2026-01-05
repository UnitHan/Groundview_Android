// Minimal Electron entrypoint; loads renderer dev server or packaged file.
// Suppress security warnings in dev; packaging will remove this.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const adb = require('./services/adbService');
const wda = require('./services/wdaService');
const fsSync = require('fs');
const os = require('os');
const { exec, execSync, spawn, spawnSync } = require('child_process');
const http = require('http');
const https = require('https');
let lastZipDir = '';
let backendProcess = null;

// Use project-local userData/cache to avoid permission locks on default AppData path
const userDataPath = path.join(process.cwd(), 'user-data');
try {
  fsSync.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
} catch {
  /* ignore */
}
const cacheDir = path.join(userDataPath, 'Cache');
try {
  fsSync.mkdirSync(cacheDir, { recursive: true });
} catch {
  /* ignore */
}
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
app.commandLine.appendSwitch('media-cache-dir', cacheDir);
app.commandLine.appendSwitch('disable-http-cache', '1');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Default PaddleOCR cache path (if not set by user)
if (!process.env.PADDLEOCR_HOME) {
  const defaultOcrHome = path.join(process.cwd(), 'backend', 'models', 'paddleocr');
  try {
    fsSync.mkdirSync(defaultOcrHome, { recursive: true });
    process.env.PADDLEOCR_HOME = defaultOcrHome;
  } catch {
    /* ignore */
  }
}

// Load stored Gemini credentials from settings.json (if present)
const preloadGeminiFromSettings = () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (!fsSync.existsSync(settingsPath)) return;
    const data = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
    if (data.geminiApiKey) process.env.GEMINI_API_KEY = data.geminiApiKey;
    if (data.geminiModel) process.env.GEMINI_MODEL = data.geminiModel;
  } catch {
    /* ignore */
  }
};
preloadGeminiFromSettings();

const loadGeminiEnv = () => {
  let key = process.env.GEMINI_API_KEY;
  let model = process.env.GEMINI_MODEL;
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fsSync.existsSync(settingsPath)) {
      const data = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
      if (data.geminiApiKey) key = data.geminiApiKey;
      if (data.geminiModel) model = data.geminiModel;
    }
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      // file:// 스크린샷 로딩을 위해 webSecurity 비활성화 (개발 시)
      webSecurity: false,
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
  // Bundle-aware Python path (portable MSI/zip 배포 시 venv 포함 가정)
  if (!process.env.PYTHON_BIN) {
    const bundledPyWin = path.join(process.resourcesPath || '', 'venv', 'Scripts', 'python.exe');
    const bundledPyNix = path.join(process.resourcesPath || '', 'venv', 'bin', 'python3');
    if (fsSync.existsSync(bundledPyWin)) {
      process.env.PYTHON_BIN = bundledPyWin;
    } else if (fsSync.existsSync(bundledPyNix)) {
      process.env.PYTHON_BIN = bundledPyNix;
    }
  }

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

const resolvePythonBin = () => {
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

  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    MODEL_PORT: port,
    GEMINI_API_KEY: geminiKey || process.env.GEMINI_API_KEY,
    GEMINI_MODEL: geminiModel || process.env.GEMINI_MODEL
  };

  const args = [...(python.prefixArgs || []), scriptPath];

  await writeServerLog(`Starting server: ${python.cmd} ${args.join(' ')}`);
  await writeServerLog(`Port: ${port}, Script: ${scriptPath}`);

  return new Promise((resolve) => {
    try {
      backendProcess = spawn(python.cmd, args, {
        windowsHide: true,
        env,
        cwd: path.dirname(scriptPath)
      });

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
      });

      backendProcess.on('close', (code) => {
        writeServerLog(`Process exited with code ${code}`);
        backendProcess = null;
      });

      // Wait for server to be ready (check if port is listening)
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = 500;

      const checkServer = () => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: parseInt(port, 10),
            path: '/healthz',
            method: 'GET',
            timeout: 1000
          },
          (res) => {
            if (res.statusCode === 200 || res.statusCode === 404) {
              writeServerLog('Server is ready!');
              resolve({ ok: true });
            } else {
              retryCheck();
            }
          }
        );

        req.on('error', () => {
          retryCheck();
        });

        req.end();
      };

      const retryCheck = () => {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkServer, checkInterval);
        } else {
          writeServerLog('ERROR: Server failed to start within timeout');
          resolve({ ok: false, error: 'Server failed to start' });
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
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    process.env.USERPROFILE &&
      path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    'adb' // rely on PATH
  ].filter(Boolean);
  // Add `where adb` results (Windows)
  if (process.platform === 'win32') {
    try {
      const whereOut = execSync('where adb', { encoding: 'utf8', windowsHide: true });
      const lines = whereOut
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      candidates.push(...lines);
    } catch {
      // ignore
    }
  }
  const found = [];
  for (const c of candidates) {
    if (!c) continue;
    if (c === 'adb') {
      // skip existence check
      found.push('adb');
      continue;
    }
    try {
      fsSync.accessSync(c);
      found.push(c);
    } catch {
      // ignore missing
    }
  }
  return found;
}

ipcMain.handle('adb:listDevices', async () => adb.listDevices());
ipcMain.handle('adb:capture', async (_e, id) => adb.capture(id));
ipcMain.handle('adb:health', async () => adb.health());
ipcMain.handle('adb:setPath', async (_e, bin) => {
  adb.setAdbPath(bin);
  return { ok: true, details: `ADB path set to: ${adb.getAdbPath()}` };
});
ipcMain.handle('adb:scan', async () => scanAdbPaths());
ipcMain.handle('ios:listDevices', async () => wda.listDevices());
ipcMain.handle('ios:capture', async (_e, id) => wda.capture(id));
ipcMain.handle('ios:health', async () => wda.health());
ipcMain.handle('fs:readText', async (_e, filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
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
    const data = await fs.readFile(settingsFile(), 'utf8');
    return { ok: true, data: JSON.parse(data) };
  } catch {
    return { ok: true, data: {} };
  }
});

ipcMain.handle('settings:save', async (_e, obj) => {
  try {
    // Read existing settings first
    let existing = {};
    try {
      const existingData = await fs.readFile(settingsFile(), 'utf8');
      existing = JSON.parse(existingData);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
    
    // Merge new settings with existing, preserving geminiApiKeyEncrypted
    const merged = {
      ...existing,
      ...obj,
      // Always preserve encrypted API key from backend
      geminiApiKeyEncrypted: existing.geminiApiKeyEncrypted
    };
    
    const data = JSON.stringify(merged, null, 2);
    await fs.writeFile(settingsFile(), data, 'utf8');
    return { ok: true };
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
ipcMain.handle('locator:gemini', async (_e, payload) => {
  try {
    const { key: envKey, model: envModel } = loadGeminiEnv();
    const apiKey = envKey || process.env.GEMINI_API_KEY;
    const rawModel = envModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' };

    const normalizeModel = (m) => {
      let mm = (m || '').trim();
      if (mm.startsWith('models/')) mm = mm.slice('models/'.length);
      if (mm.endsWith('-latest')) mm = mm.slice(0, -'-latest'.length);
      if (!mm) mm = 'gemini-2.5-flash';
      if (mm.startsWith('gemini-1.5')) mm = 'gemini-2.5-flash';
      return `models/${mm}`;
    };

    const model = normalizeModel(rawModel);
    const { node, screenshot, bounds } = payload || {};
    if (!node) return { ok: false, error: '노드 정보가 없습니다.' };

    let imagePart = null;
    if (screenshot && fsSync.existsSync(screenshot)) {
      try {
        const b64 = fsSync.readFileSync(screenshot, { encoding: 'base64' });
        imagePart = {
          inline_data: {
            mime_type: 'image/png',
            data: b64
          }
        };
      } catch {
        /* ignore */
      }
    }

    const prompt = [
      // 1) 역할
      '역할: 당신은 Appium 2.x 기반 모바일 테스트 자동화 전문가입니다.',

      // 2) 입력/대상
      '입력: Android UI 덤프에서 "선택된 단일 노드" 정보를 제공합니다.',
      '반드시 이 노드만 대상으로 로케이터와 코드를 만드세요. 부모/형제/자식 등 다른 노드 정보는 사용하지 마세요.',

      // 3) 목표/UX
      '목표: 초보자도 복사해 바로 실행할 수 있는 짧은 테스트 함수를 생성합니다. 구조를 단순/일관되게 유지하세요.',

      // 4) 언어/플랫폼
      '플랫폼: Android만 작성합니다 (iOS 정보 없음).',
      '언어: Appium 2.x 기준 Python과 Java 두 가지 버전.',

      // 5) 코드 형식
      '각 언어는 테스트 함수 하나만 포함합니다.',
      'Python: run_test(driver, timeout: int = 10) -> bool',
      'Java: public boolean runTest(AppiumDriver driver, int timeoutSeconds)',
      'driver 초기화 예시, __main__ 블록, 긴 설명, print/로그 출력은 넣지 마세요.',
      '주석은 한두 줄로만, 코드 길이는 최대한 짧게 유지하세요.',

      // 6) 로케이터 우선순위
      'Android 로케이터 우선순위(Plan A 사용, Plan B는 한 줄 주석으로만):',
      '1) content-desc -> AppiumBy.ACCESSIBILITY_ID',
      '2) resource-id -> AppiumBy.ID',
      '3) text -> UiSelector().text("...")',
      '4) 동적 텍스트 -> UiSelector().textContains("...")',
      '5) 위가 없을 때만 className + instance / UiSelector fallback',
      'Plan A 로케이터만 코드에 사용하고, Plan B 후보는 한 줄 주석으로만 남깁니다.',

      // 7) Wait 규칙
      'WebDriverWait 필수. 클릭은 element_to_be_clickable(locator), 존재확인은 presence_of_element_located(locator).',

      // 8) clickable 플래그
      '노드가 clickable=false면 함수 상단에 "// NOTE: clickable=false, 상위 요소가 클릭 대상일 수 있음" 한 줄 주석을 넣으세요.',

      // 9) 리스크/힌트
      'risks/hints에 로케이터가 깨질 수 있는 상황과 초보자 팁을 한국어로 담습니다.',

      // 10) 출력 형식
      '응답은 오직 JSON 객체 하나만 반환합니다. 마크다운/백틱/자연어를 포함하지 마세요.',
      '{"python":"<Python 코드 문자열>", "java":"<Java 코드 문자열>", "risks":["..."], "hints":["..."], "note":"..."}',
      '"python"/"java"에는 함수 코드 전체를 문자열로 넣고, risks/hints는 한국어 문장 리스트, note는 한 문장 요약입니다.'
    ].join('\n');

    const contents = [
      {
        parts: [
          {
            text: `${prompt}
노드 정보:
- text: ${node.text || '(none)'}
- contentDesc: ${node.contentDesc || '(none)'}
- resourceId: ${node.resourceId || '(none)'}
- class: ${node.cls || '(none)'}
- package: ${node.packageName || '(none)'}
- bounds: ${node.bounds || '(none)'}
- flags: clickable=${node.clickable}, enabled=${node.enabled}, focusable=${node.focusable}, scrollable=${node.scrollable}, longClickable=${node.longClickable}
- parentClass: ${node.parentClass || '(none)'}
- parentResourceId: ${node.parentResourceId || '(none)'}
- selectedBounds: ${bounds || '(none)'}`
          }
        ]
      }
    ];
    if (imagePart) contents[0].parts.push(imagePart);

    const body = { contents };
    const url = `https://generativelanguage.googleapis.com/v1/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Gemini 오류 ${resp.status}: ${txt.slice(0, 400)}` };
    }
    const data = await resp.json();
    const first = (data.candidates && data.candidates[0]) || {};
    const parts = (first.content && first.content.parts) || [];
    const textPart = parts.find((p) => p.text);
    if (!textPart || !textPart.text) return { ok: false, error: 'Gemini 응답에 텍스트가 없습니다.' };
    let suggestion = null;
    try {
      const stripFence = (raw) => {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence && fence[1]) return fence[1].trim();
        return raw.trim();
      };
      const rawText = stripFence(textPart.text || '');
      const sliced = (() => {
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}');
        if (start >= 0 && end > start) return rawText.slice(start, end + 1);
        return rawText;
      })();
      suggestion = JSON.parse(sliced);
    } catch (e) {
      return { ok: false, error: `Gemini 응답 파싱 실패: ${e.message || e}` };
    }
    return { ok: true, suggestion };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

app.whenReady().then(() => {
  cleanChromiumData()
    .catch(() => {})
    .finally(async () => {
      // Start backend server first
      const serverResult = await startPythonServer();
      if (!serverResult.ok) {
        console.error('Failed to start backend server:', serverResult.error);
        // Show error dialog with helpful information
        const { dialog } = require('electron');
        const errorMsg = serverResult.error || '알 수 없는 오류';
        const logPath = logFile();
        
        dialog.showMessageBox({
          type: 'error',
          title: 'Backend Server Error',
          message: '백엔드 서버를 시작할 수 없습니다',
          detail: `${errorMsg}\n\n로그 파일: ${logPath}`,
          buttons: ['로그 파일 열기', '계속 진행', '종료'],
          defaultId: 1,
          cancelId: 1
        }).then((result) => {
          if (result.response === 0) {
            // Open log file
            const { shell } = require('electron');
            shell.openPath(logPath);
          } else if (result.response === 2) {
            // Exit
            app.quit();
          }
        });
      }
      
      // Create window regardless (UI can still show helpful error)
      createWindow();
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
});
