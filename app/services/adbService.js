const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

let adbBin = 'adb';
function setAdbPath(bin) {
  if (bin && bin.trim()) {
    adbBin = bin.trim();
  }
}
function getAdbPath() {
  return adbBin;
}

function adbCmd(args) {
  const quoted = adbBin.includes(' ') ? `"${adbBin}"` : adbBin;
  return `${quoted} ${args}`;
}

function adbCmdQuotedBin(args) {
  // Like adbCmd, but also quotes any inline adbBin occurrences for chained commands.
  const quoted = adbBin.includes(' ') ? `"${adbBin}"` : adbBin;
  return `${quoted} ${args.replace(/\bADB_BIN\b/g, quoted)}`;
}

function tmpFile(ext) {
  return path.join(
    os.tmpdir(),
    `groundview-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  );
}

function run(cmd, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      {
        timeout,
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
    await run(adbCmd('start-server'), { timeout: 15000 });
  } catch {
    // ignore; best-effort warmup
  }
  const out = await run(adbCmd('devices -l'));
  return parseDevices(out);
}

async function health() {
  try {
    const version = await run(adbCmd('version'));
    return { ok: true, details: version.split('\n')[0] || version };
  } catch (e) {
    return { ok: false, details: e.message };
  }
}

async function capture(deviceId) {
  // Start/ensure daemon is up before capture to avoid first-call failures on packaged builds.
  try {
    await run(adbCmd('start-server'), { timeout: 15000 });
  } catch {
    // ignore; best-effort
  }

  const screenshotPath = tmpFile('png');
  const xmlCompressed = tmpFile('xml');
  const xmlUncompressed = tmpFile('xml');
  const dumpCompressed = adbCmd(
    `-s ${deviceId} shell uiautomator dump --compressed /sdcard/view.xml && ${adbBin} -s ${deviceId} exec-out cat /sdcard/view.xml > "${xmlCompressed}"`
  );
  const dumpUncompressed = adbCmd(
    `-s ${deviceId} shell uiautomator dump /sdcard/view_raw.xml && ${adbBin} -s ${deviceId} exec-out cat /sdcard/view_raw.xml > "${xmlUncompressed}"`
  );
  const screenCmd = adbCmd(`-s ${deviceId} exec-out screencap -p > "${screenshotPath}"`);

  const dumpDefault = async (target) => {
    const quoted = adbBin.includes(' ') ? `"${adbBin}"` : adbBin;
    const cmd = `${quoted} -s ${deviceId} shell uiautomator dump && ${quoted} -s ${deviceId} exec-out cat /sdcard/window_dump.xml > "${target}"`;
    await run(cmd, { timeout: 20000 });
  };

  const attempt = async () => {
    await run(screenCmd, { timeout: 20000 });
    let compressedErr = null;
    try {
      await run(dumpCompressed, { timeout: 20000 });
    } catch (e) {
      compressedErr = e;
    }
    let uncompressedErr = null;
    try {
      await run(dumpUncompressed, { timeout: 20000 });
    } catch (e) {
      uncompressedErr = e;
    }
    return { compressedErr, uncompressedErr };
  };

  const legacyDump = async (target) => {
    const quoted = adbBin.includes(' ') ? `"${adbBin}"` : adbBin;
    const cmd = `${quoted} -s ${deviceId} shell uiautomator dump --compressed /sdcard/view.xml && ${quoted} -s ${deviceId} exec-out cat /sdcard/view.xml > "${target}"`;
    await run(cmd, { timeout: 20000 });
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
        await run(adbCmd('start-server'), { timeout: 15000 });
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
