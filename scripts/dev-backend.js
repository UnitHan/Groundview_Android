/**
 * dev-backend.js
 *
 * Cross-platform launcher for the dev backend (`npm run dev:py`).
 *
 * Why this exists:
 *   The old script called `python backend/server.py` directly. On macOS the
 *   binary is usually `python3` (no `python`), so the command exited 127
 *   immediately — and because `npm run dev` uses `concurrently --kill-others`,
 *   that one failure tore down the renderer and electron processes too, so
 *   `npm run dev` never came up on a Mac.
 *
 * Resolution order:
 *   1. PYTHON_BIN env override
 *   2. project virtualenv  (.venv / venv → bin/python3 | Scripts/python.exe)
 *   3. python3, then python on PATH
 *
 * The server port comes from MODEL_PORT (set by the npm script via cross-env).
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

function venvPython(dir) {
  return isWin
    ? path.join(ROOT, dir, 'Scripts', 'python.exe')
    : path.join(ROOT, dir, 'bin', 'python3');
}

function resolvePython() {
  const candidates = [];
  if (process.env.PYTHON_BIN) candidates.push(process.env.PYTHON_BIN);
  candidates.push(venvPython('.venv'), venvPython('venv'));
  candidates.push('python3', 'python');

  for (const cmd of candidates) {
    // Absolute paths: just check existence. Bare names: probe with --version.
    if (path.isAbsolute(cmd)) {
      if (fs.existsSync(cmd)) return cmd;
      continue;
    }
    const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (!res.error && res.status === 0) return cmd;
  }
  return null;
}

const python = resolvePython();
if (!python) {
  console.error('[dev-backend] No Python found. Install Python 3.10+ or run ./setup_dev.sh');
  process.exit(1);
}

const script = path.join(ROOT, 'backend', 'server.py');
console.log(`[dev-backend] ${python} ${script} (MODEL_PORT=${process.env.MODEL_PORT || '5005'})`);

const child = spawn(python, [script], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});

child.on('exit', (code) => process.exit(code == null ? 0 : code));
child.on('error', (err) => {
  console.error(`[dev-backend] failed to start: ${err.message}`);
  process.exit(1);
});
