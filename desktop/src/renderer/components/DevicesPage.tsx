import React from 'react';
import { useAppStore } from '../store';
import { colors, pressableStyle, pressableHandlers } from '../utils/styles';
import geminiLogo from '/Gemini_logo.png';
import { EnvSetupModal } from './EnvSetupModal';
import { useT } from '../i18n';

// 환경 진단 결과 타입
interface EnvDiagnosis {
  adbFound: boolean;
  readyDevices: string[];
  unauthorizedDevices: string[];
  offlineDevices: string[];
}

type TrafficLight = 'red' | 'yellow' | 'green';

function calcLight(diag: EnvDiagnosis | null, deviceCount: number): TrafficLight {
  if (deviceCount > 0) return 'green';
  if (!diag) return 'red';
  if (!diag.adbFound) return 'red';
  if (diag.unauthorizedDevices.length > 0 || diag.offlineDevices.length > 0) return 'yellow';
  return 'yellow'; // ADB 있지만 기기 없음
}

const LIGHT_COLORS: Record<TrafficLight, string> = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#22c55e',
};

export const DevicesPage: React.FC = () => {
  const { state, loadDevices, selectDevice, capture, loadDump } = useAppStore();
  const t = useT();
  const [envModalOpen, setEnvModalOpen] = React.useState(false);
  const [envDiag, setEnvDiag] = React.useState<EnvDiagnosis | null>(null);
  const autoOpenedRef = React.useRef(false);

  const runDiagnose = React.useCallback(() => {
    (window as any).groundview?.env?.diagnose?.().then((d: EnvDiagnosis) => {
      setEnvDiag(d);
      // ADB가 없으면 최초 1회에 한해 Setup 모달 자동 표시
      if (!autoOpenedRef.current && !d?.adbFound) {
        autoOpenedRef.current = true;
        setEnvModalOpen(true);
      }
    }).catch(() => {});
  }, []);

  // 마운트 시 환경 진단 수행
  React.useEffect(() => {
    runDiagnose();
  }, [runDiagnose]);

  const light = calcLight(envDiag, state.devices.length);
  const lightCfg = { color: LIGHT_COLORS[light], label: t.devices.status[light] };

  // 마운트 시 즉시 로드 + 3초마다 자동 폴링 (analyze 중엔 폴링 중단)
  React.useEffect(() => {
    loadDevices();
    if (state.uiPhase === 'analyze') return;
    const timer = setInterval(() => loadDevices(), 3000);
    return () => clearInterval(timer);
  }, [state.uiPhase]);

  const gvStatus = state.gvServiceStatus;
  const showGvBanner = state.platform === 'android' && gvStatus === 'waiting_permission';

  return (
    <>
      {envModalOpen && <EnvSetupModal onClose={() => { setEnvModalOpen(false); runDiagnose(); }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: colors.textMain }}>Appkium Inspector</div>
        <img
          src={geminiLogo}
          alt="Gemini AI Logo"
          style={{ height: 40, objectFit: 'contain', marginLeft: 12 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ color: colors.textSub }}>Android UI Inspector & Test Automation Locator Tool</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 신호등 버튼 */}
          <button
            onClick={() => setEnvModalOpen(true)}
            title={lightCfg.label}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: lightCfg.color,
              border: `2px solid ${lightCfg.color}cc`,
              cursor: 'pointer',
              boxShadow: `0 0 8px ${lightCfg.color}88`,
              flexShrink: 0,
              padding: 0,
              transition: 'box-shadow 120ms ease, transform 120ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          />
          {/* 환경설정 버튼 */}
          <button
            onClick={() => setEnvModalOpen(true)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              ...pressableStyle,
            }}
            {...pressableHandlers}
          >
            ⚙ Setup
          </button>
        </div>
      </div>
      
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Connected Devices Section */}
        <div
          style={{
            background: colors.cardGreen,
            border: '1px solid #c8f5d3',
            borderRadius: 14,
            padding: 16
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: '#22c55e'
                  }}
                />
                <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>Connected Devices</div>
              </div>
              <div style={{ color: colors.textSub, marginTop: 6 }}>{state.devices.length} device(s) found</div>
            </div>
            <button
              onClick={loadDevices}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #b7f0c2',
                background: '#fff',
                color: '#16a34a',
                cursor: 'pointer',
                fontWeight: 700,
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Refresh
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              background: '#f8fff9',
              border: '1px dashed #c8f5d3',
              borderRadius: 12,
              padding: 16,
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontWeight: 600,
              textAlign: 'center'
            }}
          >
            {state.devices.length === 0 ? (
              <div>
                <div style={{ fontSize: 32, marginBottom: 4 }}>📱</div>
                No devices connected
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Connect via USB or enable ADB over WiFi.
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: 640, textAlign: 'left', color: '#0f172a' }}>
                <div style={{ marginBottom: 10, color: '#475569' }}>Select Device</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {state.devices.map((d) => {
                    const isWireless = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(d.id);
                    const isSelected = state.selectedDevice?.id === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => selectDevice(d.id)}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid #16a34a' : '1px solid #c8f5d3',
                          background: isSelected ? '#dcfce7' : '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          textAlign: 'left',
                          ...pressableStyle
                        }}
                        {...pressableHandlers}
                      >
                        <span style={{ fontSize: 20 }}>{isWireless ? '📡' : '📱'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                            {d.name || d.id}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {d.id}{isWireless ? ` · ${t.devices.wireless}` : ' · USB'}
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 13 }}>✓ Selected</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!state.selectedDevice && (
                  <div
                    style={{
                      background: '#f8dadd',
                      border: '1px solid #f6c8cd',
                      padding: 12,
                      borderRadius: 10,
                      color: '#b91c1c',
                      marginBottom: 12
                    }}
                  >
                    Select a device to capture.
                  </div>
                )}
                {state.selectedDevice && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {state.capturing ? (
                      <div
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fecdd3',
                          padding: 14,
                          borderRadius: 10,
                          color: '#b91c1c',
                          textAlign: 'center',
                          fontWeight: 800
                        }}
                      >
                        ★ Capturing...
                      </div>
                    ) : (
                      <button
                        onClick={capture}
                        style={{
                          width: '100%',
                          padding: '14px 12px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#ef4444',
                          color: '#fff',
                          fontWeight: 800,
                          cursor: 'pointer',
                          ...pressableStyle
                        }}
                        {...pressableHandlers}
                      >
                        Capture Screen
                      </button>
                    )}
                    <button
                      onClick={loadDump}
                      style={{
                        width: '100%',
                        padding: '14px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        ...pressableStyle
                      }}
                      {...pressableHandlers}
                    >
                      Load ZIP File
                    </button>
                    <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                      Ready to capture from: {state.selectedDevice.id}
                    </div>
                    {showGvBanner && (
                      <div style={{
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: 10,
                        padding: '12px 14px',
                        color: '#92400e',
                        fontSize: 13,
                        lineHeight: 1.6
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.devices.gvService.permTitle}</div>
                        <div>{t.devices.gvService.permDesc}</div>
                        <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, background: '#fef3c7', padding: '4px 8px', borderRadius: 6 }}>
                          {t.devices.gvService.permGuide}
                        </div>
                        <div style={{ marginTop: 8, color: '#78350f', fontSize: 12 }}>
                          {t.devices.gvService.permRetry}
                        </div>
                      </div>
                    )}
                    {gvStatus === 'ready' && (
                      <div style={{
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderRadius: 10,
                        padding: '8px 14px',
                        color: '#166534',
                        fontSize: 13,
                        fontWeight: 600
                      }}>
                        {t.devices.gvService.enabled}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
