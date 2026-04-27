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

function adbSpawnOptions() {
  if (!adbBin || adbBin === 'adb' || !path.isAbsolute(adbBin)) {
    return { windowsHide: true };
  }
  const adbDir = path.dirname(adbBin);
  return {
    windowsHide: true,
    cwd: adbDir,
    env: {
      ...process.env,
      PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}`
    }
  };
}

function runSpawn(cmd, args, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const ps = cmd === adbBin ? spawn(cmd, args, adbSpawnOptions()) : spawn(cmd, args, { windowsHide: true });
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
    const ps = spawn(adbBin, args, adbSpawnOptions());
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
      const status = parts[1]; // 'device', 'offline', 'unauthorized', etc.

      // Only return ready devices
      if (status !== 'device') return null;

      const modelMatch = line.match(/model:([^\s]+)/);
      const deviceMatch = line.match(/device:([^\s]+)/);
      let name = modelMatch ? modelMatch[1].replace(/_/g, ' ') : deviceMatch ? deviceMatch[1] : undefined;

      // For wireless connections (ip:port format), append IP to name
      const isWireless = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(id);
      if (isWireless) {
        const ip = id.split(':')[0];
        name = name ? `${name} (${ip})` : ip;
      }

      return { id, name: name || id, platform: 'android', wireless: isWireless };
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
  const longTimeout = 30000;

  // Two-step capture: write PNG to device storage first, then pull.
  // This is significantly faster than streaming via exec-out on most USB connections.
  // Falls back to exec-out streaming if the two-step approach fails.
  const DEVICE_TMP = '/sdcard/gv_screenshot_tmp.png';
  const captureScreen = async () => {
    try {
      await runAdb(['-s', deviceId, 'shell', 'screencap', '-p', DEVICE_TMP], { timeout: longTimeout });
      await runAdbToFile(['-s', deviceId, 'exec-out', 'cat', DEVICE_TMP], screenshotPath, { timeout: longTimeout });
      // best-effort cleanup
      runAdb(['-s', deviceId, 'shell', 'rm', '-f', DEVICE_TMP], { timeout: 5000 }).catch(() => {});
    } catch {
      // fallback: stream directly (original method)
      await runAdbToFile(['-s', deviceId, 'exec-out', 'screencap', '-p'], screenshotPath, { timeout: longTimeout });
    }
  };

  // ─── Phase 2: groundview-service AccessibilityService (Compose 지원) ───
  try {
    // 포트 포워딩과 스크린샷을 병렬로 실행
    await Promise.all([
      captureScreen(),
      setupGVServicePort(deviceId)
    ]);
    const { ready, error } = await ensureGVService(deviceId);
    if (ready) {
      try {
        const result = await captureViaGVService(deviceId, screenshotPath);
        return result;
      } catch (gvErr) {
        console.log('[gv-service] capture failed, falling back to uiautomator dump:', gvErr.message);
      }
    } else if (error) {
      console.log('[gv-service] setup failed:', error);
    }
  } catch (screenErr) {
    console.log('[capture] screenshot failed:', screenErr.message);
  }

  // ─── Legacy uiautomator dump ───
  const xmlCompressed = tmpFile('xml');
  const xmlUncompressed = tmpFile('xml');
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
    // Phase 1: uncompressed first — Compose apps expose more nodes without --compressed
    let uncompressedErr = null;
    try {
      await dumpUncompressed();
    } catch (e) {
      uncompressedErr = e;
    }
    let compressedErr = null;
    try {
      await dumpCompressed();
    } catch (e) {
      compressedErr = e;
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

// ─── GroundView AccessibilityService HTTP server ───
const http = require('http');

const GV_SERVICE_PORT = 9800;
const GV_SERVICE_PKG = 'com.groundview.service';
const GV_SERVICE_ACTIVITY = `${GV_SERVICE_PKG}/.SetupActivity`;

// APK 경로 탐색 (개발 모드 + 패키징 모드 모두 지원)
function findGVServiceApk() {
  const candidates = [
    // 패키징된 앱 내부 (electron-builder extraResources)
    path.join(process.resourcesPath || '', 'resources', 'groundview-service.apk'),
    // 개발 모드: 프로젝트 루트 resources 폴더
    path.join(__dirname, '..', '..', 'resources', 'groundview-service.apk'),
    path.join(process.cwd(), 'resources', 'groundview-service.apk'),
    // 개발 모드: groundview-service 빌드 아티팩트
    path.join(__dirname, '..', '..', 'groundview-service', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(process.cwd(), 'groundview-service', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function isGVServiceInstalled(deviceId) {
  console.log(`[gv-service] checking if ${GV_SERVICE_PKG} is installed on ${deviceId}...`);

  // adb shell pm list packages --user 0  (사용자 권한으로 설치된 앱만 확인)
  const tryCheck = () => new Promise((resolve) => {
    const ps = require('child_process').spawn(
      adbBin,
      ['-s', deviceId, 'shell', 'pm', 'list', 'packages', '--user', '0'],
      { windowsHide: true }
    );
    let stdout = '';
    ps.stdout.on('data', (d) => { stdout += d.toString(); });
    ps.on('close', () => resolve(stdout));
    ps.on('error', () => resolve(''));
    setTimeout(() => { try { ps.kill(); } catch {} resolve(''); }, 10000);
  });

  let stdout = await tryCheck();

  // stdout이 비어있으면 ADB 데몬 초기화 중 — 1.5초 후 재시도
  if (!stdout.trim()) {
    console.log('[gv-service] pm list --user 0 returned empty, retrying after 1.5s...');
    await new Promise((r) => setTimeout(r, 1500));
    stdout = await tryCheck();
  }

  const found = stdout.includes(`package:${GV_SERVICE_PKG}`);

  if (found) {
    console.log(`[gv-service] ✓ ${GV_SERVICE_PKG} is already installed — skipping install`);
  } else {
    console.log(`[gv-service] ✗ ${GV_SERVICE_PKG} not found in package list — will install`);
  }

  return found;
}

async function installGVServiceApk(deviceId) {
  const apk = findGVServiceApk();
  if (!apk) {
    console.log('[gv-service] ✗ APK not found in any candidate path');
    throw new Error('GroundView Service APK를 찾을 수 없습니다. groundview-service 빌드가 필요합니다.');
  }
  console.log(`[gv-service] installing APK: ${apk}`);
  await runAdb(['-s', deviceId, 'install', '-r', '-g', apk], { timeout: 60000 });
  console.log('[gv-service] ✓ APK install complete');
}

async function launchGVServiceApp(deviceId) {
  try {
    // SetupActivity 실행 → 사용자가 접근성 권한 활성화 안내 화면 보임
    await runAdb(['-s', deviceId, 'shell', 'am', 'start', '-n', GV_SERVICE_ACTIVITY], { timeout: 8000 });
  } catch {
    // ignore — 이미 실행 중일 수 있음
  }
}

/**
 * GV Service가 준비될 때까지 대기 (최대 waitSec초).
 * 사용자가 접근성 권한을 활성화하면 HTTP 서버가 시작되어 /status 응답이 옴.
 */
async function waitForGVService(host = '127.0.0.1', waitSec = 60) {
  for (let i = 0; i < waitSec; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isGVServiceReady(host)) return true;
  }
  return false;
}

async function ensureGVService(deviceId) {
  const host = getDeviceHost(deviceId);
  await setupGVServicePort(deviceId);

  // 포트 포워딩 직후 짧은 대기 (첫 연결 안정화 + ADB 데몬 준비)
  await new Promise((r) => setTimeout(r, 500));

  // 이미 서버가 응답하면 바로 사용
  if (await isGVServiceReady(host)) {
    console.log('[gv-service] already ready');
    return { ready: true, installed: true };
  }

  // ADB 데몬이 막 시작된 경우 pm 명령이 빈 결과를 반환할 수 있으므로 추가 대기
  await new Promise((r) => setTimeout(r, 1000));

  // APK 설치 확인 → 없으면 설치, 있으면 건너뜀
  const installed = await isGVServiceInstalled(deviceId);
  if (!installed) {
    try {
      await installGVServiceApk(deviceId);
      // 설치 후 포트 포워딩 재설정 (install -r이 기존 연결을 끊음)
      await new Promise((r) => setTimeout(r, 1000));
      await setupGVServicePort(deviceId);
    } catch (e) {
      console.log('[gv-service] ✗ APK install failed:', e.message);
      return { ready: false, installed: false, error: e.message };
    }
  } else {
    console.log('[gv-service] install step skipped (already installed)');
  }

  // 서버가 이미 응답하면 (접근성 권한이 이미 활성화된 경우) 바로 사용
  if (await isGVServiceReady(host)) {
    console.log('[gv-service] ready after install/port-forward');
    return { ready: true, installed: true };
  }

  // 앱 실행 (접근성 설정 화면 오픈)
  await launchGVServiceApp(deviceId);
  await setupGVServicePort(deviceId);
  console.log('[gv-service] waiting for accessibility permission...');

  // 서버 응답 대기 (사용자가 접근성 권한 활성화할 때까지)
  const ready = await waitForGVService(host, 90);
  console.log('[gv-service] ready after wait:', ready);
  return { ready, installed: true };
}

// ─── GroundView AccessibilityService 연동 함수 ───

// deviceId가 IP:port 형태인지 확인 (무선 ADB)
function isWirelessDevice(deviceId) {
  return /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(deviceId);
}

// 무선 연결 시 디바이스 IP 추출 (192.168.x.x:5555 → 192.168.x.x)
function getDeviceHost(deviceId) {
  if (isWirelessDevice(deviceId)) {
    return deviceId.split(':')[0];
  }
  return '127.0.0.1'; // USB: 포트 포워딩 사용
}

async function setupGVServicePort(deviceId) {
  if (isWirelessDevice(deviceId)) {
    // 무선 연결: adb forward 불필요 — 디바이스 IP로 직접 접근
    return;
  }
  try {
    await runAdb(['-s', deviceId, 'forward', `tcp:${GV_SERVICE_PORT}`, `tcp:${GV_SERVICE_PORT}`], { timeout: 5000 });
  } catch {
    // ignore — may already be forwarded
  }
}

function gvHttpGet(urlPath, host, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: host,
      port: GV_SERVICE_PORT,
      path: urlPath,
      method: 'GET',
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GV service HTTP request timed out')); });
    req.end();
  });
}

async function isGVServiceReady(host = '127.0.0.1') {
  try {
    const resp = await gvHttpGet('/status', host, 3000);
    const json = JSON.parse(resp);
    return json && json.ready === true;
  } catch {
    return false;
  }
}

async function captureViaGVService(deviceId, screenshotPath) {
  const host = getDeviceHost(deviceId);
  const xmlPath = tmpFile('xml');

  // 첫 번째 시도
  let xml = await gvHttpGet('/source', host, 20000);

  // 노드가 5개 미만이면 접근성 트리가 아직 준비 안 된 것 → 재시도
  const isThinResult = (x) => (x.match(/<node/g) || []).length < 5;

  if (isThinResult(xml)) {
    console.log('[gv-service] thin result, retrying after 800ms...');
    await new Promise((r) => setTimeout(r, 800));
    xml = await gvHttpGet('/source', host, 20000);
  }

  fs.writeFileSync(xmlPath, xml, 'utf8');
  return {
    screenshotPath,
    xmlPath,
    xmlVariant: 'groundview-service',
    captureMethod: 'accessibility-service',
    xmlStats: { uncompressedBytes: Buffer.byteLength(xml, 'utf8') }
  };
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
  // Prefer uncompressed — Compose apps lose nodes with --compressed merging
  const pickUncompressed = hasUncompressed;
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
  getAdbPath,
  ensureGVService,
  isGVServiceInstalled
};
