const { exec } = require('child_process');
const os = require('os');
const path = require('path');

function tmpFile(ext) {
  return path.join(
    os.tmpdir(),
    `groundview-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  );
}

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      {
        timeout: 15000,
        windowsHide: true
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

function parseXctraceDevices(output) {
  const lines = output.split('\n').map((l) => l.trim());
  const devices = [];
  for (const line of lines) {
    // Example: My iPhone (1234567890abcdef) (iOS 17.2)
    const match = line.match(/\(([^)]+)\)\s*\(iOS/i);
    if (match) {
      const idMatch = line.match(/\(([0-9a-fA-F-]{16,})\)/);
      const id = idMatch ? idMatch[1] : match[1];
      const name = line.split('(')[0].trim();
      devices.push({ id, name, platform: 'ios' });
    }
  }
  return devices;
}

async function listDevices() {
  if (process.platform !== 'darwin') return [];
  const out = await run('xcrun xctrace list devices');
  return parseXctraceDevices(out);
}

async function health() {
  if (process.platform !== 'darwin') {
    return { ok: false, details: 'WDA available on macOS only' };
  }
  try {
    const status = await run('curl -s http://127.0.0.1:8100/status');
    return { ok: true, details: status.slice(0, 120) };
  } catch (e) {
    return { ok: false, details: e.message };
  }
}

async function capture(deviceId) {
  const screenshotPath = tmpFile('png');
  const xmlPath = tmpFile('xml');
  if (process.platform !== 'darwin') {
    return { screenshotPath, xmlPath, error: 'WDA capture requires macOS' };
  }
  try {
    await run(`curl -s http://127.0.0.1:8100/screenshot > "${screenshotPath}"`);
    await run(`curl -s http://127.0.0.1:8100/source > "${xmlPath}"`);
    return { screenshotPath, xmlPath };
  } catch (e) {
    return { screenshotPath, xmlPath, error: e.message };
  }
}

module.exports = {
  listDevices,
  capture,
  health
};
