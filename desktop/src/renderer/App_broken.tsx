import React from 'react';
import { useAppStore } from './store';
import { TreeView } from './components/TreeView';
import { Overlay, parseBounds as parseOverlayBounds } from './components/Overlay';
import { generateLocators, LocatorSuggestion } from '../../../core/src/locator';
import { Platform } from '../../../core/src/types';

const colors = {
  primary: '#2563eb',
  danger: '#ef4444',
  success: '#22c55e',
  surface: '#0b1221',
  panel: '#0e1726',
  border: '#1f2937',
  cardBlue: '#eef3ff',
  cardGreen: '#eaffef',
  textMain: '#0f172a',
  textSub: '#475569'
};

const selectionStyle = `
*::selection {
  background: #fbbf24;
  color: #0b1221;
}
*::-moz-selection {
  background: #fbbf24;
  color: #0b1221;
}
`;

const pressableStyle = {
  transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  outline: 'none'
} as const;

const pressableHandlers = {
  onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(0.98)';
    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.24)';
  },
  onMouseUp: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
    e.currentTarget.style.boxShadow = pressableStyle.boxShadow;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
    e.currentTarget.style.boxShadow = pressableStyle.boxShadow;
  },
  onBlur: (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
    e.currentTarget.style.boxShadow = pressableStyle.boxShadow;
  },
  onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.35)';
  }
};

// Welcome Component
const Welcome: React.FC = () => {
  const { setAdbPath, scanAdb, state, setPhase } = useAppStore();
  const [message, setMessage] = React.useState('');

  const pickAdb = async () => {
    if (window.groundview?.dialog?.openAdb) {
      const res = await window.groundview.dialog.openAdb();
      if (res?.ok && res.path) {
        await setAdbPath(res.path);
        setPhase('devices');
        return;
      }
    }
    const found = await scanAdb();
    if (found[0]) {
      await setAdbPath(found[0]);
      setPhase('devices');
    } else {
      setMessage('ADB를 찾지 못했습니다. 다운로드 후 다시 선택하세요.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f9fb',
      color: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16
    }}>
      <div style={{
        width: 120,
        height: 120,
        borderRadius: 28,
        background: 'linear-gradient(180deg,#1e3a8a,#2563eb)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 48,
        fontWeight: 900
      }}>G</div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>GroundView</h1>
      <p style={{ color: '#64748b', margin: 0 }}>Android UI Test Automation Helper</p>
      {message && <div style={{ color: colors.danger }}>{message}</div>}
      <button onClick={pickAdb} style={{
        padding: '14px 28px',
        fontSize: 16,
        borderRadius: 12,
        border: 'none',
        background: colors.primary,
        color: '#fff',
        fontWeight: 800,
        cursor: 'pointer',
        ...pressableStyle
      }} {...pressableHandlers}>
        Select ADB
      </button>
    </div>
  );
};

// DevicesPage Component  
const DevicesPage: React.FC = () => {
  const { state, loadDevices, selectDevice, capture, exportZip, loadDump } = useAppStore();
  
  React.useEffect(() => {
    if (state.uiPhase === 'devices') {
      loadDevices().catch(() => {});
    }
  }, [state.uiPhase, loadDevices]);

  return (
    <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: colors.textMain }}>GroundView</div>
        <img
          src="file:///C:/GroundView/Gemini_AI%20Logo.png"
          alt="Gemini AI Logo"
          style={{ height: 60, objectFit: 'contain', marginLeft: 12 }}
        />
      </div>
      <div style={{ marginBottom: 20, color: colors.textSub }}>ADB/WDA capture & locator generator</div>
      
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          background: colors.cardBlue,
          border: '1px solid #dbe7ff',
          borderRadius: 14,
          padding: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#4ade80',
              border: '1px solid #bbf7d0'
            }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>ADB FOUND</div>
          </div>
          <div style={{ color: colors.textSub, marginBottom: 10 }}>Available Android Debug Bridge Information</div>
          <div style={{
            background: 'white',
            border: '1px solid #dce3f5',
            borderRadius: 10,
            padding: 12,
            color: colors.textMain,
            fontFamily: 'monospace'
          }}>
            $ {state.health?.details?.split('\n')[0] || state.adbPath || 'Set ADB path to fetch version.'}
            {state.adbPath && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>path: {state.adbPath}</div>
            )}
          </div>
        </div>

        <div style={{
          background: colors.cardGreen,
          border: '1px solid #c8f5d3',
          borderRadius: 14,
          padding: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: '#22c55e'
                }} />
                <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>Connected Devices</div>
              </div>
              <div style={{ color: colors.textSub, marginTop: 6 }}>{state.devices.length} device(s) found</div>
            </div>
            <button onClick={loadDevices} style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #b7f0c2',
              background: '#fff',
              color: '#16a34a',
              cursor: 'pointer',
              fontWeight: 700,
              ...pressableStyle
            }} {...pressableHandlers}>
              Refresh
            </button>
          </div>

          <div style={{
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
          }}>
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
                <select
                  value={state.selectedDevice?.id || ''}
                  onChange={(e) => selectDevice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #c8f5d3',
                    marginBottom: 12,
                    fontSize: 14
                  }}
                >
                  <option value="">Choose a device...</option>
                  {state.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.id}
                    </option>
                  ))}
                </select>
                {!state.selectedDevice && (
                  <div style={{
                    background: '#f8dadd',
                    border: '1px solid #f6c8cd',
                    padding: 12,
                    borderRadius: 10,
                    color: '#b91c1c',
                    marginBottom: 12
                  }}>
                    Select a device to capture.
                  </div>
                )}
                {state.selectedDevice && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {state.capturing ? (
                      <div style={{
                        background: '#fee2e2',
                        border: '1px solid #fecdd3',
                        padding: 14,
                        borderRadius: 10,
                        color: '#b91c1c',
                        textAlign: 'center',
                        fontWeight: 800
                      }}>
                        ★ Capturing...
                      </div>
                    ) : (
                      <button onClick={capture} style={{
                        width: '100%',
                        padding: '14px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        ...pressableStyle
                      }} {...pressableHandlers}>
                        Capture Screen
                      </button>
                    )}
                    <button onClick={loadDump} style={{
                      width: '100%',
                      padding: '14px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontWeight: 800,
                      cursor: 'pointer',
                      ...pressableStyle
                    }} {...pressableHandlers}>
                      Load ZIP File
                    </button>
                    <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                      Ready to capture from: {state.selectedDevice?.id || '-'}
                    </div>
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

// AnalyzePage Component
const AnalyzePage: React.FC = () => {
  const { state, setPhase, capture, exportZip, selectNode } = useAppStore();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [geminiKey, setGeminiKey] = React.useState('');
  const [geminiModel, setGeminiModel] = React.useState('gemini-2.5-flash');
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ocrGeminiLoading, setOcrGeminiLoading] = React.useState(false);
  const [ocrModal, setOcrModal] = React.useState<{
    mode?: 'gemini';
    rawText?: string;
    source?: string;
    error?: string;
  } | null>(null);

  const handleSaveGeminiKey = async () => {
    if (!geminiKey.trim()) {
      setSaveStatus({ type: 'error', message: 'API Key를 입력하세요.' });
      return;
    }
    try {
      const response = await fetch('http://127.0.0.1:5005/api/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey, model: geminiModel })
      });
      
      if (response.ok) {
        setSaveStatus({ type: 'success', message: 'API Key가 암호화되어 저장되었습니다!' });
        setTimeout(() => {
          setSettingsOpen(false);
          setSaveStatus(null);
        }, 2000);
      } else {
        const error = await response.text();
        setSaveStatus({ type: 'error', message: `저장 실패: ${error}` });
      }
    } catch (e) {
      setSaveStatus({ type: 'error', message: `오류: ${String(e)}` });
    }
  };

  const runGeminiOcr = async () => {
    if (!state.lastCapture?.screenshotPath) {
      setOcrModal({ error: '스크린샷이 없습니다. 캡처 후 다시 시도하세요.' });
      return;
    }
    setOcrGeminiLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:5005/api/gemini/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          screenshotPath: state.lastCapture.screenshotPath,
          bounds: state.selectedBounds 
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setOcrModal({
          mode: 'gemini',
          rawText: data.text || 'OCR 결과 없음',
          source: 'gemini-vision'
        });
      } else {
        const error = await response.text();
        setOcrModal({ error: `OCR 실패: ${error}` });
      }
    } catch (e) {
      setOcrModal({ error: String(e) });
    } finally {
      setOcrGeminiLoading(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <button onClick={() => setPhase('devices')} style={{
            background: '#111827',
            color: '#e5e7eb',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
            ...pressableStyle
          }} {...pressableHandlers}>
            ← Back to Devices
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={capture} style={{
            background: state.capturing ? '#9ca3af' : '#0ea5e9',
            color: state.capturing ? '#1f2937' : '#0b1221',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: state.capturing ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: state.capturing ? 0.8 : 1,
            ...pressableStyle
          }} disabled={state.capturing} {...pressableHandlers}>
            {state.capturing ? '⏳ Capturing...' : 'Capture'}
          </button>
          <button onClick={exportZip} style={{
            background: state.saving ? '#9ca3af' : '#8b5cf6',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: state.saving ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: state.saving ? 0.85 : 1,
            ...pressableStyle
          }} disabled={!state.lastCapture || state.saving} {...pressableHandlers}>
            {state.saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={runGeminiOcr} style={{
            background: ocrGeminiLoading ? '#9ca3af' : '#10b981',
            color: '#0b1221',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: ocrGeminiLoading ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: ocrGeminiLoading ? 0.85 : 1,
            ...pressableStyle
          }} disabled={ocrGeminiLoading} title="Gemini Vision OCR (LLM)" {...pressableHandlers}>
            {ocrGeminiLoading ? 'Gemini…' : 'Gemini OCR'}
          </button>
          <button onClick={() => setSettingsOpen(true)} style={{
            background: '#f59e0b',
            color: '#0b1221',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
            ...pressableStyle
          }} title="Gemini API Key 설정" {...pressableHandlers}>
            ⚙️ Settings
          </button>
        </div>
      </div>
      
      <div style={{ color: '#9ca3af', marginBottom: 12 }}>
        Captured from: {state.selectedDevice?.id || state.metaDeviceId || '-'}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '50% 50%',
        gap: 16,
        background: '#0e1726',
        borderRadius: 12,
        padding: 12,
        color: '#e5e7eb'
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Screen Capture</div>
          {state.lastCapture?.screenshotPath && state.tree ? (
            <Overlay
              nodes={state.tree}
              selectedId={state.selectedNodeId}
              onSelect={(n) => selectNode(n.id, n.bounds)}
              onDoubleSelect={(n) => selectNode(n.id, n.bounds)}
              screenshotPath={state.lastCapture.screenshotPath}
              disableHighlight={false}
            />
          ) : (
            <div style={{ color: '#9ca3af' }}>No capture available.</div>
          )}
        </div>
        
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>UI Hierarchy Tree</div>
          {state.tree && state.tree.length > 0 ? (
            <TreeView
              nodes={state.tree}
              onSelect={(n) => selectNode(n.id, n.bounds)}
              onDoubleSelect={(n) => selectNode(n.id, n.bounds)}
              selectedId={state.selectedNodeId}
              selectedBounds={state.selectedBounds}
            />
          ) : (
            <div style={{ color: '#9ca3af' }}>No tree loaded.</div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1150
        }} onClick={() => {
          setSettingsOpen(false);
          setSaveStatus(null);
        }}>
          <div style={{
            background: '#0b1221',
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 16,
            width: 520,
            maxWidth: '90%',
            color: '#e5e7eb',
            boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Gemini API 설정</div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>API Key는 암호화되어 안전하게 저장됩니다</div>
              </div>
              <button onClick={() => {
                setSettingsOpen(false);
                setSaveStatus(null);
              }} style={{
                border: 'none',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                ...pressableStyle
              }} {...pressableHandlers}>
                Close
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>API Key</label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #1f2937',
                  background: '#0e1726',
                  color: '#e5e7eb',
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>모델</label>
              <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} style={{
                width: '100%',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #1f2937',
                background: '#0e1726',
                color: '#e5e7eb',
                fontSize: 14
              }}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              </select>
            </div>

            {saveStatus && (
              <div style={{
                padding: 10,
                borderRadius: 8,
                marginBottom: 12,
                background: saveStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: saveStatus.type === 'success' ? '#4ade80' : '#f87171',
                border: `1px solid ${saveStatus.type === 'success' ? '#22c55e' : '#ef4444'}`
              }}>
                {saveStatus.message}
              </div>
            )}

            <button onClick={handleSaveGeminiKey} style={{
              width: '100%',
              padding: 12,
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              ...pressableStyle
            }} {...pressableHandlers}>
              💾 저장
            </button>

            <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
              <div style={{ marginBottom: 4 }}>🔒 API Key는 PBKDF2-HMAC-SHA256 해시 + Fernet 암호화로 보호됩니다</div>
              <div>📌 Gemini API Key는 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>Google AI Studio</a>에서 발급받을 수 있습니다</div>
            </div>
          </div>
        </div>
      )}

      {/* OCR Result Modal */}
      {ocrModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1160
        }} onClick={() => setOcrModal(null)}>
          <div style={{
            background: '#0b1221',
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 16,
            width: 600,
            maxWidth: '90%',
            color: '#e5e7eb',
            boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {ocrModal.error ? '❌ OCR 오류' : '✅ Gemini OCR 결과'}
              </div>
              <button onClick={() => setOcrModal(null)} style={{
                border: 'none',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                ...pressableStyle
              }} {...pressableHandlers}>
                Close
              </button>
            </div>

            {ocrModal.error ? (
              <div style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                border: '1px solid #ef4444'
              }}>
                {ocrModal.error}
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#9ca3af' }}>
                  Source: {ocrModal.source || 'unknown'}
                </div>
                <div style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#0e1726',
                  border: '1px solid #1f2937',
                  maxHeight: 400,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontSize: 14,
                  lineHeight: 1.6,
                  userSelect: 'text'
                }}>
                  {ocrModal.rawText || '(결과 없음)'}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// Main App Component
const App: React.FC = () => {
  const { state } = useAppStore();

  const bg = state.uiPhase === 'devices' ? '#f5f7fb' 
    : state.uiPhase === 'welcome' ? '#f7f9fb' 
    : 'radial-gradient(circle at 20% 20%, #1f2937, #0b1221)';
  const textColor = state.uiPhase === 'devices' || state.uiPhase === 'welcome' ? '#0f172a' : '#e5e7eb';

  const content = state.uiPhase === 'welcome' ? <Welcome /> 
    : state.uiPhase === 'analyze' && state.lastCapture?.screenshotPath && state.tree ? <AnalyzePage />
    : <DevicesPage />;

  return (
    <div style={{
      minHeight: '100vh',
      background: bg,
      color: textColor,
      padding: 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative'
    }}>
      <style>{selectionStyle}</style>
      {content}
    </div>
  );
};

export default App;
