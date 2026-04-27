/**
 * bundle-adb.js
 *
 * MSIX 빌드용 ADB 바이너리 번들링 스크립트.
 *
 * 문제 배경:
 *   MSIX(AppX) 패키지로 설치된 GroundView에서 외부 Android SDK 경로의
 *   adb.exe를 spawnSync/spawn으로 실행하면 0xC0000135(STATUS_DLL_NOT_FOUND)
 *   코드로 즉시 종료된다.
 *   원인: MSIX 컨텍스트(Desktop AppX Container)에서 자식 프로세스가
 *   user AppData 경로(%LocalAppData%\Android\Sdk\platform-tools)의 DLL을
 *   로드하지 못한다.
 *
 * 해결:
 *   adb.exe + 의존 DLL을 MSIX 패키지 내부(resources/adb/)에 포함한다.
 *   패키지 설치 디렉터리(C:\Program Files\WindowsApps\...)는 MSIX가
 *   신뢰하는 경로이므로 DLL 로딩 제한이 적용되지 않는다.
 *
 * 사용:
 *   node scripts/bundle-adb.js
 *
 * 환경변수 우선순위:
 *   1. ANDROID_HOME
 *   2. ANDROID_SDK_ROOT
 *   3. %LOCALAPPDATA%\Android\Sdk  (Windows 기본 위치)
 *
 * 번들 파일:
 *   adb.exe            - ADB 클라이언트/서버 바이너리 (PE32, 32-bit)
 *   AdbWinApi.dll      - ADB Windows API DLL
 *   AdbWinUsbApi.dll   - ADB Windows USB API DLL
 *   libwinpthread-1.dll - MinGW 스레드 런타임
 *
 * 라이선스:
 *   위 파일들은 Android Open Source Project 일부로 Apache License 2.0 적용.
 *   THIRD-PARTY-NOTICES.md 에 고지 사항을 추가해야 한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ADB_FILES = [
  'adb.exe',
  'AdbWinApi.dll',
  'AdbWinUsbApi.dll',
  'libwinpthread-1.dll',
];

function findSdkPlatformTools() {
  const candidates = [];

  if (process.env.ANDROID_HOME) {
    candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools'));
  }
  if (process.env.ANDROID_SDK_ROOT) {
    candidates.push(path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools'));
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'Android', 'Sdk', 'platform-tools'));
  }

  for (const dir of candidates) {
    const adbPath = path.join(dir, 'adb.exe');
    if (fs.existsSync(adbPath)) {
      return dir;
    }
  }
  return null;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const targetDir = path.join(projectRoot, 'resources', 'adb');

  const sourceDir = findSdkPlatformTools();
  if (!sourceDir) {
    console.error('ERROR: Android SDK platform-tools를 찾을 수 없습니다.');
    console.error('ANDROID_HOME 또는 ANDROID_SDK_ROOT 환경변수를 설정하거나');
    console.error('Android Studio를 통해 SDK를 설치해주세요.');
    process.exit(1);
  }

  console.log(`소스: ${sourceDir}`);
  console.log(`대상: ${targetDir}`);

  fs.mkdirSync(targetDir, { recursive: true });

  let ok = true;
  for (const file of ADB_FILES) {
    const src = path.join(sourceDir, file);
    const dst = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      const size = fs.statSync(dst).size;
      console.log(`  복사 완료: ${file} (${(size / 1024).toFixed(1)} KB)`);
    } else {
      // AdbWinUsbApi.dll 은 일부 platform-tools 버전에 없을 수 있음
      if (file === 'AdbWinUsbApi.dll') {
        console.warn(`  경고: ${file} 없음 (선택적 파일, 계속 진행)`);
      } else {
        console.error(`  오류: ${file} 없음 - ${src}`);
        ok = false;
      }
    }
  }

  if (!ok) {
    console.error('필수 파일 복사 실패. 빌드를 중단합니다.');
    process.exit(1);
  }

  console.log('\nADB 번들링 완료.');
}

main();
