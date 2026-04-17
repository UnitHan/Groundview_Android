/**
 * bundle-python.js
 * Creates a self-contained Python 3.10 embeddable bundle at resources/python-bundle/
 * with all packages from requirements.txt pre-installed.
 *
 * Run: node scripts/bundle-python.js
 * Called automatically by: npm run dist:win
 *
 * The bundle is portable and does NOT require Python to be installed on the end-user machine.
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PYTHON_VERSION = '3.10.11';
const PYTHON_SHORT = '3.10'; // major.minor
const EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

const ROOT_DIR = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT_DIR, 'resources', 'python-bundle');
const PYTHON_EXE = path.join(BUNDLE_DIR, 'python.exe');
const REQUIREMENTS = path.join(ROOT_DIR, 'requirements.txt');

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[bundle-python] ${msg}`);
}

function err(msg) {
  console.error(`[bundle-python] ERROR: ${msg}`);
}

/** HTTP(S) download with redirect following. */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https://') ? https.get : http.get;
    const req = get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.destroy();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastPct = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const pct = Math.floor((received / total) * 100);
          if (pct - lastPct >= 10) {
            process.stdout.write(`\r[bundle-python]   ${pct}%`);
            lastPct = pct;
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        if (total > 0) process.stdout.write('\r[bundle-python]   100%\n');
        file.close();
        resolve();
      });
    });
    req.on('error', (e) => {
      file.destroy();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(e);
    });
  });
}

/** Run a command synchronously; throw on non-zero exit. */
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    windowsHide: true,
    ...opts
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with code ${result.status}`);
  }
}

/** Extract zip using PowerShell (Windows only). */
function extractZip(zipPath, destDir) {
  run('powershell', [
    '-NonInteractive', '-NoProfile', '-Command',
    `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`
  ]);
}

/**
 * Returns a clean environment for running the embedded Python.
 * - PYTHONNOUSERSITE=1  : ignore user site-packages (%APPDATA%/Python/...)
 * - PYTHONPATH cleared  : prevent host venv/system paths leaking in
 * This ensures pip installs packages INTO the bundle, not into the system Python.
 */
function isolatedEnv() {
  const env = { ...process.env };
  env.PYTHONNOUSERSITE = '1';
  env.PYTHONPATH = '';
  // Remove venv-related vars that could redirect to the host venv
  delete env.VIRTUAL_ENV;
  delete env.VIRTUAL_ENV_PROMPT;
  return env;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  if (process.platform !== 'win32') {
    log('Skipping: Python bundle is Windows-only (NSIS installer target).');
    return;
  }

  if (fs.existsSync(PYTHON_EXE)) {
    log('Bundle already exists at resources/python-bundle/. Delete that folder to rebuild.');
    return;
  }

  if (!fs.existsSync(REQUIREMENTS)) {
    err(`requirements.txt not found at ${REQUIREMENTS}`);
    process.exit(1);
  }

  fs.mkdirSync(BUNDLE_DIR, { recursive: true });

  // ── 1. Download Python embeddable zip ──
  const zipCache = path.join(os.tmpdir(), `python-${PYTHON_VERSION}-embed-amd64.zip`);
  if (fs.existsSync(zipCache)) {
    log(`Using cached embed zip: ${zipCache}`);
  } else {
    log(`Downloading Python ${PYTHON_VERSION} embeddable package...`);
    log(`  Source: ${EMBED_URL}`);
    await download(EMBED_URL, zipCache);
    log('Download complete.');
  }

  // ── 2. Extract ──
  log('Extracting embeddable package...');
  extractZip(zipCache, BUNDLE_DIR);
  log('Extraction complete.');

  // ── 2b. Unblock all extracted files ──
  // Windows marks files downloaded from the internet with Zone.Identifier ADS.
  // This causes EPERM when trying to execute them; Unblock-File removes the mark.
  log('Unblocking extracted files (Zone.Identifier removal)...');
  try {
    run('powershell', [
      '-NonInteractive', '-NoProfile', '-Command',
      `Get-ChildItem -Path "${BUNDLE_DIR}" -Recurse | Unblock-File`
    ]);
    log('Files unblocked.');
  } catch (e) {
    // Non-fatal: older Windows may not support Unblock-File on all items
    log(`Unblock-File warning (non-fatal): ${e.message}`);
  }

  // ── 3. Enable site-packages ──
  // The ._pth file controls Python's path; we must uncomment `import site`
  // so that pip-installed packages in Lib/site-packages are importable.
  const pthFiles = fs.readdirSync(BUNDLE_DIR).filter((f) => f.endsWith('._pth'));
  if (pthFiles.length === 0) {
    err('No ._pth file found in bundle dir — unexpected embed zip structure.');
    process.exit(1);
  }
  for (const pthName of pthFiles) {
    const pthPath = path.join(BUNDLE_DIR, pthName);
    const original = fs.readFileSync(pthPath, 'utf8');
    const patched = original.replace('#import site', 'import site');
    if (patched !== original) {
      fs.writeFileSync(pthPath, patched, 'utf8');
      log(`Enabled site-packages in ${pthName}`);
    }
  }

  // ── 4. Bootstrap pip ──
  log('Bootstrapping pip...');
  const getPipDest = path.join(BUNDLE_DIR, 'get-pip.py');
  await download(GET_PIP_URL, getPipDest);
  run(PYTHON_EXE, [getPipDest, '--no-warn-script-location'], { env: isolatedEnv() });
  fs.unlinkSync(getPipDest);
  log('pip installed.');

  // ── 5. Install requirements ──
  // Use `python -m pip` with isolated env so packages go into the bundle's
  // own site-packages, not into the system/user Python paths.
  log(`Installing packages from requirements.txt...`);
  run(PYTHON_EXE, [
    '-m', 'pip',
    'install',
    '-r', REQUIREMENTS,
    '--no-warn-script-location',
    '--disable-pip-version-check',
    '--ignore-installed'   // force install into bundle even if found elsewhere
  ], { env: isolatedEnv() });
  log('All packages installed.');

  // ── 6. Verify critical imports ──
  log('Verifying critical imports...');
  const critical = ['fastapi', 'uvicorn', 'cryptography', 'PIL', 'httpx'];
  for (const mod of critical) {
    const check = spawnSync(PYTHON_EXE, ['-c', `import ${mod}`], {
      windowsHide: true,
      env: isolatedEnv()
    });
    if (check.status !== 0) {
      err(`Import check failed for: ${mod}`);
      process.exit(1);
    }
  }
  log('All imports OK.');

  log(`\nPython bundle ready at: ${BUNDLE_DIR}`);
  log(`Bundle size: ${getDirSizeMB(BUNDLE_DIR)} MB`);
}

function getDirSizeMB(dir) {
  let total = 0;
  const walk = (d) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else { try { total += fs.statSync(full).size; } catch { /* ignore */ } }
      }
    } catch { /* ignore */ }
  };
  walk(dir);
  return (total / (1024 * 1024)).toFixed(1);
}

main().catch((e) => {
  err(e.message || e);
  process.exit(1);
});
