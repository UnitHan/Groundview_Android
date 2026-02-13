const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

let adbBin = 'adb';
function normalizeAdbPath(bin) {
  const trimmed = (bin || '').trim();
  if (!trimmed) return '';
  const hasQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return hasQuotes ? trimmed.slice(1, -1) : trimmed;
}
function setAdbPath(bin) {
  const normalized = normalizeAdbPath(bin);
  if (normalized) {
    adbBin = normalized;
  }
}
function getAdbPath() {
  return adbBin;
}

function tmpFile(ext) {
  return path.join(
    os.tmpdir(),
    `groundview-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  );
}

function wrapSpawnError(err, cmd, args) {
  const code = err && err.code ? `${err.code}: ` : '';
  const msg = err && err.message ? err.message : String(err);
  const fullCmd = `${cmd}${args && args.length ? ` ${args.join(' ')}` : ''}`;
  const wrapped = new Error(`${code}${msg} (cmd: ${fullCmd})`);
  if (err && err.code) wrapped.code = err.code;
  return wrapped;
}

function runSpawn(cmd, args, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const ps = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const done = (err, out) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) return reject(err);
      resolve(out);
    };

    const timer = timeout
      ? setTimeout(() => {
          try {
            ps.kill();
          } catch {
            /* ignore */
          }
          done(new Error(`command timed out after ${timeout}ms`));
        }, timeout)
      : null;

    ps.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    ps.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    ps.on('error', (err) => {
      done(wrapSpawnError(err, cmd, args));
    });
    ps.on('close', (code) => {
      if (code === 0) return done(null, stdout.trim());
      const msg = (stderr || stdout || `command failed with code ${code}`).trim();
      return done(new Error(msg));
    });
  });
}

function runAdb(args, { timeout = 12000 } = {}) {
  if (!adbBin) throw new Error('ADB path not set');
  return runSpawn(adbBin, args, { timeout });
}

function runAdbToFile(args, filePath, { timeout = 20000 } = {}) {
  if (!adbBin) return Promise.reject(new Error('ADB path not set'));
  return new Promise((resolve, reject) => {
    const ps = spawn(adbBin, args, { windowsHide: true });
    const out = fs.createWriteStream(filePath);
    let stderr = '';
    let exited = false;
    let finished = false;
    let settled = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        try {
          out.destroy();
        } catch {
          /* ignore */
        }
        try {
          if (ps && !ps.killed) ps.kill();
        } catch {
          /* ignore */
        }
        return reject(err);
      }
      return resolve();
    };

    const timer = timeout
      ? setTimeout(() => {
          try {
            ps.kill();
          } catch {
            /* ignore */
          }
          done(new Error(`command timed out after ${timeout}ms`));
        }, timeout)
      : null;

    ps.stdout.pipe(out);
    ps.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    ps.on('error', (err) => {
      done(wrapSpawnError(err, adbBin, args));
    });
    ps.on('close', (code) => {
      exited = true;
      if (code !== 0) {
        const msg = (stderr || `command failed with code ${code}`).trim();
        return done(new Error(msg));
      }
      if (finished) return done();
    });
    out.on('finish', () => {
      finished = true;
      if (exited) return done();
    });
    out.on('error', (err) => done(err));
  });
}

function parseDevices(output) {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('List of devices'));
  return lines
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) return null;
      const id = parts[0];
      const modelMatch = line.match(/model:([^\s]+)/);
      const deviceMatch = line.match(/device:([^\s]+)/);
      const name = modelMatch ? modelMatch[1] : deviceMatch ? deviceMatch[1] : undefined;
      return { id, name, platform: 'android' };
    })
    .filter(Boolean);
}

async function listDevices() {
  // Ensure daemon is up to avoid "daemon not running" errors on first call.
  try {
    await runAdb(['start-server'], { timeout: 15000 });
  } catch {
    // ignore; best-effort warmup
  }
  const out = await runAdb(['devices', '-l']);
  return parseDevices(out);
}

async function health() {
  try {
    const version = await runAdb(['version']);
    return { ok: true, details: version.split('\n')[0] || version };
  } catch (e) {
    return { ok: false, details: e.message };
  }
}

async function capture(deviceId) {
  // Start/ensure daemon is up before capture to avoid first-call failures on packaged builds.
  try {
    await runAdb(['start-server'], { timeout: 15000 });
  } catch {
    // ignore; best-effort
  }

  const screenshotPath = tmpFile('png');
  const xmlCompressed = tmpFile('xml');
  const xmlUncompressed = tmpFile('xml');
  const longTimeout = 20000;
  const captureScreen = () =>
    runAdbToFile(['-s', deviceId, 'exec-out', 'screencap', '-p'], screenshotPath, {
      timeout: longTimeout
    });
  const dumpCompressed = async () => {
    await runAdb(['-s', deviceId, 'shell', 'uiautomator', 'dump', '--compressed', '/sdcard/view.xml'], {
      timeout: longTimeout
    });
    await runAdbToFile(['-s', deviceId, 'exec-out', 'cat', '/sdcard/view.xml'], xmlCompressed, {
      timeout: longTimeout
    });
  };
  const dumpUncompressed = async () => {
    await runAdb(['-s', deviceId, 'shell', 'uiautomator', 'dump', '/sdcard/view_raw.xml'], {
      timeout: longTimeout
    });
    await runAdbToFile(['-s', deviceId, 'exec-out', 'cat', '/sdcard/view_raw.xml'], xmlUncompressed, {
      timeout: longTimeout
    });
  };

  const dumpDefault = async (target) => {
    await runAdb(['-s', deviceId, 'shell', 'uiautomator', 'dump'], { timeout: longTimeout });
    await runAdbToFile(['-s', deviceId, 'exec-out', 'cat', '/sdcard/window_dump.xml'], target, {
      timeout: longTimeout
    });
  };

  const attempt = async () => {
    await captureScreen();
    let compressedErr = null;
    try {
      await dumpCompressed();
    } catch (e) {
      compressedErr = e;
    }
    let uncompressedErr = null;
    try {
      await dumpUncompressed();
    } catch (e) {
      uncompressedErr = e;
    }
    return { compressedErr, uncompressedErr };
  };

  const legacyDump = async (target) => {
    await runAdb(['-s', deviceId, 'shell', 'uiautomator', 'dump', '--compressed', '/sdcard/view.xml'], {
      timeout: longTimeout
    });
    await runAdbToFile(['-s', deviceId, 'exec-out', 'cat', '/sdcard/view.xml'], target, {
      timeout: longTimeout
    });
  };

  const shouldRetry = (msg) =>
    msg.includes('device not found') ||
    msg.includes('daemon not running') ||
    msg.toLowerCase().includes('eperm') ||
    msg.toLowerCase().includes('permission');

  try {
    const { compressedErr, uncompressedErr } = await attempt();
    let pick = pickXml(xmlCompressed, xmlUncompressed);
    if (!pick.path) {
      // Fallback to single legacy dump (compressed) to avoid "No XML captured"
      try {
        await legacyDump(xmlCompressed);
        pick = pickXml(xmlCompressed, xmlUncompressed);
      } catch (legacyErr) {
        pick.error = pick.error || legacyErr.message;
      }
    }
    if (!pick.path) {
      // Final fallback: default window_dump.xml path (no flags)
      try {
        await dumpDefault(xmlUncompressed);
        pick = pickXml(xmlCompressed, xmlUncompressed);
      } catch (defErr) {
        pick.error = pick.error || defErr.message;
      }
    }
    const err =
      pick.error ||
      (!pick.path
        ? `No XML captured (compressedErr=${compressedErr?.message || 'none'}, uncompressedErr=${uncompressedErr?.message || 'none'})`
        : undefined);
    return {
      screenshotPath,
      xmlPath: pick.path,
      xmlPathCompressed: fs.existsSync(xmlCompressed) ? xmlCompressed : undefined,
      xmlPathUncompressed: fs.existsSync(xmlUncompressed) ? xmlUncompressed : undefined,
      xmlVariant: pick.variant,
      xmlStats: pick.stats,
      error: err
    };
  } catch (e) {
    if (shouldRetry(e.message)) {
      try {
        await runAdb(['start-server'], { timeout: 15000 });
        const { compressedErr, uncompressedErr } = await attempt();
        let pick = pickXml(xmlCompressed, xmlUncompressed);
        if (!pick.path) {
          try {
            await legacyDump(xmlCompressed);
            pick = pickXml(xmlCompressed, xmlUncompressed);
          } catch (legacyErr) {
            pick.error = pick.error || legacyErr.message;
          }
        }
        if (!pick.path) {
          try {
            await dumpDefault(xmlUncompressed);
            pick = pickXml(xmlCompressed, xmlUncompressed);
          } catch (defErr) {
            pick.error = pick.error || defErr.message;
          }
        }
        const err =
          pick.error ||
          (!pick.path
            ? `No XML captured (compressedErr=${compressedErr?.message || 'none'}, uncompressedErr=${uncompressedErr?.message || 'none'})`
            : undefined);
        return {
          screenshotPath,
          xmlPath: pick.path,
          xmlPathCompressed: fs.existsSync(xmlCompressed) ? xmlCompressed : undefined,
          xmlPathUncompressed: fs.existsSync(xmlUncompressed) ? xmlUncompressed : undefined,
          xmlVariant: pick.variant,
          xmlStats: pick.stats,
          error: err
        };
      } catch (e2) {
        const pick = pickXml(xmlCompressed, xmlUncompressed);
        const err =
          pick.error || (!pick.path ? pick.error || e2.message || undefined : undefined);
        return {
          screenshotPath,
          xmlPath: pick.path,
          xmlPathCompressed: fs.existsSync(xmlCompressed) ? xmlCompressed : undefined,
          xmlPathUncompressed: fs.existsSync(xmlUncompressed) ? xmlUncompressed : undefined,
          xmlVariant: pick.variant,
          xmlStats: pick.stats,
          error: err
        };
      }
    }
    const pick = pickXml(xmlCompressed, xmlUncompressed);
    const err = pick.error || (!pick.path ? pick.error || e.message || undefined : undefined);
    return {
      screenshotPath,
      xmlPath: pick.path,
      xmlPathCompressed: fs.existsSync(xmlCompressed) ? xmlCompressed : undefined,
      xmlPathUncompressed: fs.existsSync(xmlUncompressed) ? xmlUncompressed : undefined,
      xmlVariant: pick.variant,
      xmlStats: pick.stats,
      error: err
    };
  }
}

function pickXml(compressedPath, uncompressedPath) {
  const stats = {
    compressedBytes: fs.existsSync(compressedPath) ? fs.statSync(compressedPath).size : undefined,
    uncompressedBytes: fs.existsSync(uncompressedPath) ? fs.statSync(uncompressedPath).size : undefined
  };
  const hasCompressed = stats.compressedBytes && stats.compressedBytes > 0;
  const hasUncompressed = stats.uncompressedBytes && stats.uncompressedBytes > 0;
  if (!hasCompressed && !hasUncompressed) {
    return { path: undefined, variant: undefined, stats, error: 'No XML captured' };
  }
  const pickUncompressed =
    hasUncompressed &&
    (!hasCompressed || (stats.uncompressedBytes || 0) >= (stats.compressedBytes || 0));
  return {
    path: pickUncompressed ? uncompressedPath : compressedPath,
    variant: pickUncompressed ? 'uncompressed' : 'compressed',
    stats
  };
}

module.exports = {
  listDevices,
  capture,
  health,
  setAdbPath,
  getAdbPath
};
