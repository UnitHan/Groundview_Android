import React from 'react';
import { DeviceInfo } from '../../types/global';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { copyToClipboard } from '../utils/locatorHelpers';
import { useEscClose } from '../hooks/useEscClose';

interface DeviceInfoModalProps {
  deviceId: string;
  onClose: () => void;
}

// Appium capabilities 스니펫 생성 (값 있는 항목만 포함)
const buildPythonCaps = (info: DeviceInfo): string => {
  const lines: string[] = [
    'caps = {',
    "    'platformName': 'Android',",
    "    'appium:automationName': 'UiAutomator2',",
    `    'appium:udid': '${info.udid}',`
  ];
  if (info.model) lines.push(`    'appium:deviceName': '${info.model}',`);
  if (info.androidVersion) lines.push(`    'appium:platformVersion': '${info.androidVersion}',`);
  if (info.appPackage) lines.push(`    'appium:appPackage': '${info.appPackage}',`);
  if (info.appActivity) lines.push(`    'appium:appActivity': '${info.appActivity}',`);
  lines.push("    'appium:noReset': True,");
  lines.push('}');
  return lines.join('\n');
};

const buildJavaCaps = (info: DeviceInfo): string => {
  const lines: string[] = ['UiAutomator2Options options = new UiAutomator2Options()'];
  const chain: string[] = [`.setUdid("${info.udid}")`];
  if (info.model) chain.push(`.setDeviceName("${info.model}")`);
  if (info.androidVersion) chain.push(`.setPlatformVersion("${info.androidVersion}")`);
  if (info.appPackage) chain.push(`.setAppPackage("${info.appPackage}")`);
  if (info.appActivity) chain.push(`.setAppActivity("${info.appActivity}")`);
  chain.push('.setNoReset(true)');
  chain.forEach((c, i) => lines.push(`    ${c}${i === chain.length - 1 ? ';' : ''}`));
  return lines.join('\n');
};

const Row: React.FC<{ label: string; value?: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #1f2937' }}>
    <span style={{ color: '#9ca3af', fontSize: 13 }}>{label}</span>
    <span
      style={{
        color: value ? '#e5e7eb' : '#6b7280',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: mono ? 'Consolas, Monaco, monospace' : undefined,
        userSelect: 'text',
        textAlign: 'right',
        wordBreak: 'break-all'
      }}
    >
      {value || '-'}
    </span>
  </div>
);

export const DeviceInfoModal: React.FC<DeviceInfoModalProps> = ({ deviceId, onClose }) => {
  const [state, setState] = React.useState<{ loading: boolean; error?: string; info?: DeviceInfo }>({
    loading: true
  });
  const [lang, setLang] = React.useState<'python' | 'java'>('python');
  useEscClose(onClose);

  const load = React.useCallback(() => {
    setState({ loading: true });
    if (!window.groundview?.adb?.deviceInfo) {
      setState({ loading: false, error: '기기 정보 브리지가 없습니다.' });
      return;
    }
    window.groundview.adb
      .deviceInfo(deviceId)
      .then((res) => {
        if (res?.ok && res.info) setState({ loading: false, info: res.info });
        else setState({ loading: false, error: res?.error || '기기 정보 조회 실패' });
      })
      .catch((e) => setState({ loading: false, error: String(e) }));
  }, [deviceId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const info = state.info;
  const caps = info ? (lang === 'python' ? buildPythonCaps(info) : buildJavaCaps(info)) : '';
  const missingApp = info && (!info.appPackage || !info.appActivity);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2100
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0b1221',
          borderRadius: 14,
          padding: 18,
          border: '1px solid #1f2937',
          width: 640,
          maxWidth: '94%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 16px 60px rgba(0,0,0,0.6)',
          color: '#e5e7eb'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>기기 · 앱 정보</div>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>Appium capabilities 구성용</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={load}
              disabled={state.loading}
              style={{
                border: '1px solid #1f2937',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 8,
                padding: '6px 12px',
                cursor: state.loading ? 'wait' : 'pointer',
                fontWeight: 600,
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              {state.loading ? '조회 중…' : '🔄 새로고침'}
            </button>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Close
            </button>
          </div>
        </div>

        {state.loading && <div style={{ color: '#9ca3af', padding: '20px 0' }}>기기 정보를 불러오는 중…</div>}
        {!state.loading && state.error && (
          <div style={{ color: '#f87171', padding: '12px 0' }}>⚠️ {state.error}</div>
        )}

        {!state.loading && info && (
          <>
            {/* 정보 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: '#0e1726', borderRadius: 10, padding: 12, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>단말</div>
                <Row label="제조사" value={info.manufacturer} />
                <Row label="모델" value={info.model} />
                <Row label="Android" value={info.androidVersion} />
                <Row label="SDK" value={info.sdk} />
                <Row label="udid" value={info.udid} mono />
                <Row label="연결" value={info.wireless ? '무선(Wi-Fi)' : 'USB'} />
                <Row label="해상도" value={info.screenSize} />
                <Row label="밀도(dpi)" value={info.density} />
              </div>
              <div style={{ background: '#0e1726', borderRadius: 10, padding: 12, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>포그라운드 앱</div>
                <Row label="appPackage" value={info.appPackage} mono />
                <Row label="appActivity" value={info.appActivity} mono />
                {info.appPackage && (
                  <button
                    onClick={() => copyToClipboard(info.appPackage || '')}
                    style={{
                      marginTop: 8,
                      background: '#3b82f6',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      ...pressableStyle
                    }}
                    {...pressableHandlers}
                  >
                    📋 패키지명 복사
                  </button>
                )}
                {missingApp && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#fca5a5' }}>
                    ⚠️ 앱 정보를 못 읽었어요. 대상 앱을 화면 맨 앞에 두고 🔄 새로고침 하세요.
                  </div>
                )}
              </div>
            </div>

            {/* Capabilities 스니펫 */}
            <div style={{ background: '#0e1726', borderRadius: 10, padding: 12, border: '1px solid #1f2937' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Appium Capabilities</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setLang('python')}
                    style={{
                      border: '1px solid #1f2937',
                      background: lang === 'python' ? '#22c55e' : '#111827',
                      color: '#e5e7eb',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      ...pressableStyle
                    }}
                    {...pressableHandlers}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setLang('java')}
                    style={{
                      border: '1px solid #1f2937',
                      background: lang === 'java' ? '#22c55e' : '#111827',
                      color: '#e5e7eb',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      ...pressableStyle
                    }}
                    {...pressableHandlers}
                  >
                    Java
                  </button>
                </div>
              </div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  color: '#e5e7eb',
                  fontSize: 12,
                  lineHeight: 1.6,
                  userSelect: 'text',
                  fontFamily: 'Consolas, Monaco, monospace',
                  margin: 0,
                  maxHeight: 260,
                  overflowY: 'auto'
                }}
              >
                {caps}
              </pre>
              <button
                onClick={() => copyToClipboard(caps)}
                style={{
                  marginTop: 8,
                  background: '#10b981',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                📋 복사하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
