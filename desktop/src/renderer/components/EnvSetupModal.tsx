import React from 'react';
import { colors, pressableStyle, pressableHandlers } from '../utils/styles';

const spinKeyframes = `
@keyframes gv-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes gv-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
@keyframes gv-dot {
  0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
  40%            { transform: scale(1);   opacity: 1;   }
}
`;

const SpinnerStyle = () => (
  <style>{spinKeyframes}</style>
);

interface EnvDiagnosis {
  adbFound: boolean;
  adbPath: string | null;
  adbVersion: string | null;
  readyDevices: string[];
  unauthorizedDevices: string[];
  offlineDevices: string[];
  androidStudioFound: boolean;
  platformToolsUrl: string;
}

type TrafficLight = 'red' | 'yellow' | 'green';

function getTrafficLight(diag: EnvDiagnosis | null): TrafficLight {
  if (!diag) return 'red';
  if (!diag.adbFound) return 'red';
  if (diag.unauthorizedDevices.length > 0 || diag.offlineDevices.length > 0) return 'yellow';
  if (diag.readyDevices.length === 0 && diag.adbFound) return 'yellow';
  return 'green';
}

const LIGHT_COLORS: Record<TrafficLight, { bg: string; border: string; label: string }> = {
  red:    { bg: '#ef4444', border: '#dc2626', label: '설정 필요' },
  yellow: { bg: '#f59e0b', border: '#d97706', label: '일부 설정 미완료' },
  green:  { bg: '#22c55e', border: '#16a34a', label: '정상' },
};

interface Props {
  onClose: () => void;
}

export const EnvSetupModal: React.FC<Props> = ({ onClose }) => {
  const [diag, setDiag] = React.useState<EnvDiagnosis | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadResult, setDownloadResult] = React.useState<{ ok: boolean; error?: string } | null>(null);

  const runDiagnose = React.useCallback(async () => {
    setLoading(true);
    setDownloadResult(null);
    try {
      const result = await (window as any).groundview?.env?.diagnose?.();
      setDiag(result || null);
    } catch {
      setDiag(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    runDiagnose();
  }, [runDiagnose]);

  const handleDownloadAdb = async () => {
    setDownloading(true);
    setDownloadResult(null);
    try {
      const res = await (window as any).groundview?.env?.downloadAdb?.();
      setDownloadResult(res);
      if (res?.ok) {
        await runDiagnose();
      }
    } catch (e: any) {
      setDownloadResult({ ok: false, error: e.message });
    } finally {
      setDownloading(false);
    }
  };

  const openUrl = (url: string) => {
    (window as any).groundview?.external?.open?.(url);
  };

  const light = getTrafficLight(diag);
  const lightCfg = LIGHT_COLORS[light];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <SpinnerStyle />
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          width: 560,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          padding: '28px 32px',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: loading ? 'transparent' : lightCfg.bg,
              boxShadow: loading ? 'none' : `0 0 0 3px ${lightCfg.border}44`,
              border: loading ? `3px solid #e2e8f0` : undefined,
              borderTopColor: loading ? colors.primary : undefined,
              animation: loading ? 'gv-spin 0.9s linear infinite' : undefined,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>환경 설정 진단</div>
            <div style={{ fontSize: 13, color: colors.textSub, marginTop: 2 }}>{lightCfg.label}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, color: '#94a3b8', padding: '4px 8px',
              ...pressableStyle,
            }}
            {...pressableHandlers}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '44px 0 36px', color: '#64748b' }}>
            {/* 회전 스피너 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid #e2e8f0',
                borderTopColor: colors.primary,
                animation: 'gv-spin 0.9s linear infinite',
              }} />
            </div>
            {/* 펄스 텍스트 */}
            <div style={{
              fontSize: 15, fontWeight: 600,
              animation: 'gv-pulse 1.4s ease-in-out infinite',
            }}>
              환경을 진단하는 중
            </div>
            {/* 점 세 개 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: colors.primary,
                  animation: `gv-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── ADB 설치 ── */}
            <CheckItem
              status={diag?.adbFound ? 'ok' : 'error'}
              title="ADB (Android Debug Bridge)"
              description={
                diag?.adbFound
                  ? diag.adbPath || 'ADB 감지됨'
                  : 'ADB가 설치되어 있지 않거나 경로를 찾을 수 없습니다.'
              }
            >
              {!diag?.adbFound && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#7c3aed', background: '#f5f3ff', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6 }}>
                    <strong>자동 다운로드</strong>: Google Android Platform Tools를 홈 디렉터리에 다운로드합니다.
                  </div>
                  {downloadResult && (
                    <div style={{
                      fontSize: 13,
                      background: downloadResult.ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${downloadResult.ok ? '#86efac' : '#fca5a5'}`,
                      color: downloadResult.ok ? '#166534' : '#b91c1c',
                      borderRadius: 8, padding: '8px 12px',
                    }}>
                      {downloadResult.ok ? '✅ ADB 다운로드 및 설치 완료! 새로고침을 눌러주세요.' : `❌ ${downloadResult.error}`}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleDownloadAdb}
                      disabled={downloading}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                        background: downloading ? '#c4b5fd' : '#7c3aed',
                        color: '#fff', fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer',
                        fontSize: 14, ...pressableStyle,
                      }}
                      {...pressableHandlers}
                    >
                      {downloading ? '다운로드 중...' : '⬇ ADB 자동 다운로드'}
                    </button>
                    <button
                      onClick={() => openUrl('https://developer.android.com/tools/releases/platform-tools')}
                      style={{
                        padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                        background: '#fff', color: '#475569', fontWeight: 600,
                        cursor: 'pointer', fontSize: 13, ...pressableStyle,
                      }}
                      {...pressableHandlers}
                    >
                      공식 페이지 열기
                    </button>
                  </div>
                </div>
              )}
              {diag?.adbFound && diag.adbVersion && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>
                  {diag.adbVersion}
                </div>
              )}
            </CheckItem>

            {/* ── 연결된 기기 ── */}
            <CheckItem
              status={
                diag?.readyDevices && diag.readyDevices.length > 0 ? 'ok'
                : diag?.unauthorizedDevices && diag.unauthorizedDevices.length > 0 ? 'warn'
                : diag?.offlineDevices && diag.offlineDevices.length > 0 ? 'warn'
                : diag?.adbFound ? 'warn'
                : 'skip'
              }
              title="ADB 디바이스 연결"
              description={
                !diag?.adbFound ? 'ADB 설치 후 확인 가능합니다.'
                : diag?.readyDevices && diag.readyDevices.length > 0
                  ? `${diag.readyDevices.length}개 기기 정상 연결됨: ${diag.readyDevices.join(', ')}`
                  : diag?.unauthorizedDevices && diag.unauthorizedDevices.length > 0
                  ? `인증 대기 중인 기기: ${diag.unauthorizedDevices.join(', ')}`
                  : diag?.offlineDevices && diag.offlineDevices.length > 0
                  ? `오프라인 기기: ${diag.offlineDevices.join(', ')}`
                  : '연결된 기기가 없습니다.'
              }
            >
              {diag?.adbFound && (diag.unauthorizedDevices.length > 0 || diag.readyDevices.length === 0) && (
                <GuidanceBox title="📱 기기 연결 방법" color="blue">
                  <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 13 }}>
                    <li>안드로이드 기기의 <strong>개발자 옵션</strong>을 활성화합니다.</li>
                    <li>개발자 옵션 내 <strong>USB 디버깅</strong>을 켭니다.</li>
                    <li>USB 케이블로 PC와 연결합니다.</li>
                    {diag.unauthorizedDevices.length > 0 && (
                      <li style={{ color: '#b45309' }}>
                        기기 화면에 <strong>"USB 디버깅을 허용하시겠습니까?"</strong> 팝업이 뜨면<br />
                        <strong>"이 컴퓨터에서 항상 허용"</strong>을 체크하고 <strong>확인</strong>을 누릅니다.
                      </li>
                    )}
                    {diag.unauthorizedDevices.length > 0 && (
                      <li>케이블을 뽑았다가 다시 꽂은 후 아래 새로고침을 눌러주세요.</li>
                    )}
                  </ol>
                </GuidanceBox>
              )}
            </CheckItem>

            {/* ── 개발자 옵션 안내 ── */}
            {diag?.adbFound && diag.readyDevices.length === 0 && (
              <CheckItem
                status="info"
                title="개발자 옵션 활성화 방법"
                description="기기에서 개발자 옵션이 비활성화되어 있을 수 있습니다."
              >
                <GuidanceBox title="⚙️ 개발자 옵션 켜는 방법" color="purple">
                  <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 13 }}>
                    <li><strong>설정</strong> → <strong>휴대전화 정보</strong> (또는 소프트웨어 정보)</li>
                    <li><strong>빌드 번호</strong>를 7번 연속으로 탭합니다.</li>
                    <li>"개발자가 되었습니다!" 메시지 확인.</li>
                    <li><strong>설정</strong> → <strong>개발자 옵션</strong> → <strong>USB 디버깅</strong> 활성화.</li>
                  </ol>
                </GuidanceBox>
              </CheckItem>
            )}

            {/* ── Android Studio 권장 ── */}
            <CheckItem
              status={diag?.androidStudioFound ? 'ok' : 'info'}
              title="Android Studio (권장 사항)"
              description={
                diag?.androidStudioFound
                  ? 'Android Studio가 설치되어 있습니다.'
                  : 'Android Studio를 설치하면 ADB를 포함한 Platform Tools가 자동으로 제공됩니다.'
              }
            >
              {!diag?.androidStudioFound && (
                <GuidanceBox title="💡 권장 사항" color="gray">
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
                    GroundView를 사용하기 전에 <strong>Android Studio</strong>를 설치하고
                    SDK Manager에서 <strong>Android SDK Platform-Tools</strong> 설치를 완료하면
                    별도 설정 없이 <strong>즉시 사용</strong>할 수 있습니다.
                  </p>
                  <button
                    onClick={() => openUrl('https://developer.android.com/studio')}
                    style={{
                      marginTop: 10, padding: '8px 14px', borderRadius: 8,
                      border: '1px solid #cbd5e1', background: '#fff',
                      color: '#1e40af', fontWeight: 600, cursor: 'pointer',
                      fontSize: 13, ...pressableStyle,
                    }}
                    {...pressableHandlers}
                  >
                    Android Studio 다운로드 →
                  </button>
                </GuidanceBox>
              )}
            </CheckItem>

            {/* 새로고침 버튼 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={runDiagnose}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: colors.primary, color: '#fff', fontWeight: 700,
                  cursor: 'pointer', fontSize: 15, ...pressableStyle,
                }}
                {...pressableHandlers}
              >
                🔄 다시 진단
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 20px', borderRadius: 12,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#475569', fontWeight: 600, cursor: 'pointer',
                  fontSize: 15, ...pressableStyle,
                }}
                {...pressableHandlers}
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 내부 컴포넌트 ──────────────────────────────────────────────────────────

type ItemStatus = 'ok' | 'warn' | 'error' | 'info' | 'skip';

const STATUS_ICON: Record<ItemStatus, string> = {
  ok:    '✅',
  warn:  '⚠️',
  error: '❌',
  info:  'ℹ️',
  skip:  '⬜',
};
const STATUS_COLOR: Record<ItemStatus, string> = {
  ok:    '#166534',
  warn:  '#92400e',
  error: '#b91c1c',
  info:  '#1e40af',
  skip:  '#94a3b8',
};
const STATUS_BG: Record<ItemStatus, string> = {
  ok:    '#f0fdf4',
  warn:  '#fffbeb',
  error: '#fef2f2',
  info:  '#eff6ff',
  skip:  '#f8fafc',
};

const CheckItem: React.FC<{
  status: ItemStatus;
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({ status, title, description, children }) => (
  <div
    style={{
      background: STATUS_BG[status],
      border: `1px solid ${STATUS_COLOR[status]}33`,
      borderRadius: 12,
      padding: '14px 16px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{STATUS_ICON[status]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: colors.textMain }}>{title}</div>
        <div style={{ fontSize: 13, color: STATUS_COLOR[status], marginTop: 3 }}>{description}</div>
        {children}
      </div>
    </div>
  </div>
);

const GUIDE_COLORS = {
  blue:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  purple: { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  gray:   { bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },
};

const GuidanceBox: React.FC<{
  title: string;
  color: keyof typeof GUIDE_COLORS;
  children: React.ReactNode;
}> = ({ title, color, children }) => {
  const c = GUIDE_COLORS[color];
  return (
    <div
      style={{
        marginTop: 12,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        color: c.text,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{title}</div>
      {children}
    </div>
  );
};
