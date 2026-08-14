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

// 타임아웃된 프로세스를 확실히 정리한다.
// Windows에서 ps.kill()은 즉시 프로세스에만 SIGTERM을 보내 자식 adb.exe가 고아로 남아
// 디바이스 전송(transport)을 붙잡은 채 "ADB offline"을 유발할 수 있으므로 트리 강제종료.
function killProc(ps) {
  if (!ps || ps.killed) return;
  try {
    if (process.platform === 'win32' && ps.pid) {
      spawn('taskkill', ['/pid', String(ps.pid), '/T', '/F'], { windowsHide: true });
    } else {
      ps.kill('SIGKILL');
    }
  } catch {
    try { ps.kill(); } catch { /* ignore */ }
  }
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
          killProc(ps);
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
        killProc(ps);
        return reject(err);
      }
      return resolve();
    };

    const timer = timeout
      ? setTimeout(() => {
          killProc(ps);
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
// 번들된 APK의 versionCode (groundview-service/app/build.gradle와 동기화 유지).
// 기기에 설치된 버전이 이보다 낮으면 자동으로 install -r 업데이트한다.
const GV_SERVICE_BUNDLED_VERSION = 4;

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

// ADB 전송(transport)이 준비될 때까지 대기.
// 프레임워크 패키지(android)는 항상 존재하므로, 이 조회가 비어있으면 ADB 데몬이 아직
// 준비 안 된 것 → 이 상태에서 설치 여부를 판단하면 "미설치"로 오탐해 매번 재설치하게 된다.
// pm path 조회 — 단말별 --user 0 필요 여부가 다르므로 기본 → --user 0 순으로 시도.
async function pmPath(deviceId, pkg) {
  const variants = [
    ['-s', deviceId, 'shell', 'pm', 'path', pkg],
    ['-s', deviceId, 'shell', 'pm', 'path', '--user', '0', pkg]
  ];
  for (const args of variants) {
    try {
      const out = await runAdb(args, { timeout: 8000 });
      if (out && out.includes('package:')) return out;
    } catch {
      /* 다음 변형 시도 */
    }
  }
  return '';
}

async function waitForAdbReady(deviceId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    // 프레임워크 패키지(android)는 항상 존재 → 비어있으면 ADB 전송 아직 준비 안 됨
    if ((await pmPath(deviceId, 'android')).includes('package:')) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 기기에 설치된 GV Service의 versionCode 조회.
//  - 설치됨: 숫자(versionCode)
//  - 미설치: null
//  - 설치됐으나 버전 파싱 실패: -1 (재설치 방지용 "설치됨" 표시)
async function getInstalledGVVersion(deviceId) {
  // dumpsys는 전체 유저 대상이라 --user 스코프 영향 없음 (버전 조회에 가장 신뢰도 높음)
  try {
    const out = await runAdb(
      ['-s', deviceId, 'shell', 'dumpsys', 'package', GV_SERVICE_PKG],
      { timeout: 8000 }
    );
    const m = out.match(/versionCode=(\d+)/);
    if (m) return Number(m[1]);
  } catch {
    /* pm path로 폴백 */
  }
  // dumpsys 실패/공백 → pm path 양방향으로 설치 유무만이라도 확인
  const path = await pmPath(deviceId, GV_SERVICE_PKG);
  if (path.includes('package:')) return -1; // 설치는 됨(버전 미상) — 불필요한 재설치 방지
  return null; // 미설치
}

async function installGVServiceApk(deviceId) {
  const apk = findGVServiceApk();
  if (!apk) {
    console.log('[gv-service] ✗ APK not found in any candidate path');
    throw new Error('Appkium Inspector Service APK를 찾을 수 없습니다. groundview-service 빌드가 필요합니다.');
  }
  console.log(`[gv-service] installing APK: ${apk}`);
  // 단말에 따라 --user 0 필요 여부가 다르므로 기본 → 실패 시 --user 0 순으로 시도.
  try {
    await runAdb(['-s', deviceId, 'install', '-r', '-g', apk], { timeout: 60000 });
  } catch (e1) {
    console.log('[gv-service] install 기본 실패, --user 0 재시도:', e1.message);
    await runAdb(['-s', deviceId, 'install', '-r', '-g', '--user', '0', apk], { timeout: 60000 });
  }
  console.log('[gv-service] ✓ APK install complete');
}

async function launchGVServiceApp(deviceId) {
  // SetupActivity 실행 → 사용자가 접근성 권한 활성화 안내 화면 보임.
  // 단말별 --user 0 필요 여부가 다르므로 기본 → --user 0 순으로 시도.
  try {
    await runAdb(['-s', deviceId, 'shell', 'am', 'start', '-n', GV_SERVICE_ACTIVITY], { timeout: 8000 });
  } catch {
    try {
      await runAdb(['-s', deviceId, 'shell', 'am', 'start', '--user', '0', '-n', GV_SERVICE_ACTIVITY], { timeout: 8000 });
    } catch {
      // ignore — 이미 실행 중이거나 권한 화면 열려 있을 수 있음
    }
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

// 이번 세션에서 버전 최신 확인이 끝난 디바이스 (매 캡처마다 dumpsys 반복 방지)
const gvVersionVerified = new Set();

async function ensureGVService(deviceId) {
  const host = getDeviceHost(deviceId);
  await setupGVServicePort(deviceId);

  // 이번 세션에서 이미 최신 확인됐고 서버가 응답하면 바로 사용 (설치 판정 생략)
  if (gvVersionVerified.has(deviceId) && (await isGVServiceReady(host))) {
    console.log('[gv-service] already ready (verified this session)');
    return { ready: true, installed: true };
  }

  // ★ ADB 전송 준비를 먼저 확실히 한다.
  // 준비 전엔 dumpsys/pm이 빈 결과를 내서 "미설치"로 오탐 → 매 실행 재설치 문제 발생.
  const adbReady = await waitForAdbReady(deviceId);
  if (!adbReady) {
    console.log('[gv-service] ADB 전송 준비 안 됨 — 설치 판정 생략, 서비스 응답만 확인');
    if (await isGVServiceReady(host)) return { ready: true, installed: true };
  }

  // dumpsys를 단일 신뢰 소스로 설치/버전 판정 (ADB 준비된 경우에만 신뢰)
  const installedVer = adbReady ? await getInstalledGVVersion(deviceId) : null;

  if (adbReady && installedVer === null) {
    // 진짜 미설치 → 설치
    console.log('[gv-service] 미설치 확인 — 설치 진행...');
    try {
      await installGVServiceApk(deviceId);
      await new Promise((r) => setTimeout(r, 1000));
      await setupGVServicePort(deviceId);
      gvVersionVerified.add(deviceId);
    } catch (e) {
      console.log('[gv-service] ✗ APK install failed:', e.message);
      return { ready: false, installed: false, error: e.message };
    }
  } else if (installedVer !== null && installedVer >= 0 && installedVer < GV_SERVICE_BUNDLED_VERSION) {
    // 구버전 → install -r 로 업데이트 (앱 데이터·접근성 권한 유지)
    // (installedVer === -1 은 "설치됨/버전 미상" → 재설치하지 않고 아래 else에서 건너뜀)
    console.log(`[gv-service] 구버전 (installed=${installedVer} < bundled=${GV_SERVICE_BUNDLED_VERSION}) — 업데이트...`);
    try {
      await installGVServiceApk(deviceId);
      await new Promise((r) => setTimeout(r, 1000));
      await setupGVServicePort(deviceId);
      gvVersionVerified.add(deviceId);
    } catch (e) {
      console.log('[gv-service] update failed (계속 진행):', e.message);
    }
  } else if (installedVer !== null) {
    // 최신 → 설치 건너뜀, 이번 세션 재확인 생략
    console.log(`[gv-service] 최신 버전 (installed=${installedVer}) — 설치 건너뜀`);
    gvVersionVerified.add(deviceId);
  }

  // 이미 접근성 활성화되어 서버가 살아있는데도, 포트 포워딩 타이밍 때문에
  // 첫 체크가 실패할 수 있다. 그 상태에서 SetupActivity를 띄우면 단말에 서비스 화면이
  // 불쑥 뜨는 문제가 생긴다. 그래서 앱을 띄우기 전에 재포워딩+짧은 폴링으로 먼저 확인한다.
  for (let i = 0; i < 6; i++) {
    if (await isGVServiceReady(host)) {
      console.log('[gv-service] ready after port-forward (설치 화면 안 띄움)');
      gvVersionVerified.add(deviceId);
      return { ready: true, installed: true };
    }
    await setupGVServicePort(deviceId);
    await new Promise((r) => setTimeout(r, 700));
  }

  // 여기까지 응답 없으면 접근성 권한 미활성 가능성 → SetupActivity 안내 화면 오픈
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

// dumpsys 출력에서 "패키지/액티비티" 형태를 뽑아 정규화한다.
function parsePackageActivity(text) {
  if (!text) return {};
  // 예: "u0 com.openai.chatgpt/.MainActivity t123" → com.openai.chatgpt / .MainActivity
  const m = text.match(/([a-zA-Z][a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.$]+)/);
  if (!m) return {};
  const pkg = m[1];
  let act = m[2];
  if (act.startsWith('.')) act = pkg + act;
  else if (!act.includes('.')) act = `${pkg}.${act}`;
  return { appPackage: pkg, appActivity: act };
}

// 현재 포그라운드(최상단) 앱의 패키지/액티비티 조회.
async function getForegroundApp(deviceId) {
  // 1순위: 최상단 resumed 액티비티
  try {
    const out = await runAdb(['-s', deviceId, 'shell', 'dumpsys activity activities'], { timeout: 8000 });
    const line = out
      .split('\n')
      .find((l) => /topResumedActivity|mResumedActivity|ResumedActivity/.test(l));
    const r = parsePackageActivity(line || '');
    if (r.appPackage) return r;
  } catch {
    /* 폴백 진행 */
  }
  // 2순위: 현재 포커스 윈도우
  try {
    const out = await runAdb(['-s', deviceId, 'shell', 'dumpsys window'], { timeout: 8000 });
    const line = out
      .split('\n')
      .find((l) => /mCurrentFocus|mFocusedApp/.test(l));
    const r = parsePackageActivity(line || '');
    if (r.appPackage) return r;
  } catch {
    /* 무시 */
  }
  return {};
}

// 연결된 단말 + 포그라운드 앱 정보 (Appium capabilities 구성용).
async function getDeviceInfo(deviceId) {
  const info = { udid: deviceId, wireless: isWirelessDevice(deviceId) };

  // getprop 여러 개를 한 번의 shell 호출로 (순서 고정)
  try {
    const props = await runAdb(
      [
        '-s',
        deviceId,
        'shell',
        'getprop ro.product.manufacturer; getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk'
      ],
      { timeout: 8000 }
    );
    const lines = props.split('\n').map((s) => s.trim());
    info.manufacturer = lines[0] || undefined;
    info.model = lines[1] || undefined;
    info.androidVersion = lines[2] || undefined;
    info.sdk = lines[3] || undefined;
  } catch {
    /* 무시 */
  }

  // 화면 크기 / 밀도
  try {
    const size = await runAdb(['-s', deviceId, 'shell', 'wm', 'size'], { timeout: 6000 });
    const m = size.match(/Physical size:\s*(\d+x\d+)/) || size.match(/(\d+x\d+)/);
    if (m) info.screenSize = m[1];
  } catch {
    /* 무시 */
  }
  try {
    const den = await runAdb(['-s', deviceId, 'shell', 'wm', 'density'], { timeout: 6000 });
    const m = den.match(/Physical density:\s*(\d+)/) || den.match(/(\d+)/);
    if (m) info.density = m[1];
  } catch {
    /* 무시 */
  }

  // 포그라운드 앱
  const fg = await getForegroundApp(deviceId);
  info.appPackage = fg.appPackage;
  info.appActivity = fg.appActivity;

  return info;
}

module.exports = {
  listDevices,
  capture,
  health,
  setAdbPath,
  getAdbPath,
  ensureGVService,
  isGVServiceInstalled,
  getDeviceInfo
};
