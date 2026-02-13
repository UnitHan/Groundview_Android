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

// Helper function
const buildEasyLocator = (node: any, platform: 'android' | 'ios') => {
  try {
    const safeNode = node || {};
    if (platform === 'ios') {
      const pred = safeNode.text
        ? `label == "${safeNode.text}"`
        : safeNode.contentDesc
        ? `name == "${safeNode.contentDesc}"`
        : 'label CONTAINS "__"';
      const python = `el = driver.find_element(\n    by=AppiumBy.IOS_PREDICATE,\n    value='${pred}'\n)\nel.click()`;
      const java = `var el = driver.findElement(\n    AppiumBy.iOSNsPredicateString("${pred.replace(/"/g, '\\"')}")\n);\nel.click();`;
      return { python, java, note: 'iOS predicate 기반', label: pred };
    }
    let selector = '';
    let note = '';
    if (safeNode.resourceId) {
      selector = `new UiSelector().resourceId("${safeNode.resourceId}")`;
      note = 'resource-id 기반';
    } else if (safeNode.contentDesc) {
      selector = `new UiSelector().description("${safeNode.contentDesc}")`;
      note = 'content-desc 기반';
    } else if (safeNode.text) {
      selector = `new UiSelector().textContains("${safeNode.text}")`;
      note = '텍스트 기반';
    } else {
      const inst = typeof safeNode.index === 'number' ? safeNode.index : 0;
      selector = `new UiSelector().className("${safeNode.cls || 'android.view.View'}").instance(${inst})`;
      note = 'class + instance';
    }
    const python = `el = driver.find_element(\n    by=AppiumBy.ANDROID_UIAUTOMATOR,\n    value='${selector}'\n)\nel.click()`;
    const java = `var el = driver.findElement(\n    AppiumBy.androidUIAutomator("${selector.replace(/"/g, '\\"')}")\n);\nel.click();`;
    return { python, java, note, label: selector };
  } catch (e) {
    return { python: '# error', java: '// error', note: 'fallback', label: 'error' };
  }
};

// Welcome Component
const Welcome: React.FC = () => {
  const { setAdbPath, scanAdb, state, setPhase } = useAppStore();
  const [message, setMessage] = React.useState('');

  const pickAdb = async () => {
    console.log('pickAdb called');
    if (window.groundview?.dialog?.openAdb) {
      const res = await window.groundview.dialog.openAdb();
      console.log('Dialog result:', res);
      if (res?.ok && res.path) {
        await setAdbPath(res.path);
        console.log('ADB path set, changing phase to devices');
        setPhase('devices');
        return;
      }
    }
    console.log('Scanning for ADB...');
    const found = await scanAdb();
    console.log('Found ADB paths:', found);
    if (found[0]) {
      await setAdbPath(found[0]);
      console.log('Setting phase to devices');
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
        fontSize: 48,
        color: '#fff',
        fontWeight: 800,
        boxShadow: '0 12px 32px rgba(37,99,235,0.35)'
      }}>
        📱
      </div>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a' }}>GroundView</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
          Mobile UI Capture & Locator Generator
        </div>
      </div>
      <button onClick={pickAdb} style={{
        padding: '14px 28px',
        fontSize: 16,
        borderRadius: 12,
        border: 'none',
        background: '#2563eb',
        color: '#fff',
        fontWeight: 800,
        cursor: 'pointer',
        ...pressableStyle,
        boxShadow: '0 6px 16px rgba(37,99,235,0.25)'
      }} {...pressableHandlers}>
        Select ADB
      </button>
      {message && <div style={{ color: '#ef4444', fontSize: 13 }}>{message}</div>}
    </div>
  );
};

// DevicesPage Component
const DevicesPage: React.FC = () => {
  const { state, setPhase, loadDevices, selectDevice, capture } = useAppStore();

  React.useEffect(() => {
    console.log('DevicesPage mounted, loading devices...');
    loadDevices();
  }, []);

  const loadDump = async () => {
    if (!window.groundview?.dialog?.openDump) return;
    const res = await window.groundview.dialog.openDump();
    if (res?.ok && res.dump) {
      setPhase('analyze');
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: colors.textMain, marginBottom: 4 }}>
          GroundView
        </div>
        <div style={{ fontSize: 13, color: colors.textSub }}>
          Select a device and capture its screen
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: colors.textMain }}>
            🔌 Connected Devices
          </div>
          {state.devices && state.devices.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.devices.map((d) => (
                <div
                  key={d.id}
                  onClick={() => selectDevice(d.id)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: state.selectedDevice?.id === d.id ? colors.cardBlue : '#f8fafc',
                    border: `2px solid ${state.selectedDevice?.id === d.id ? colors.primary : '#e2e8f0'}`,
                    cursor: 'pointer',
                    transition: 'all 120ms ease'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: colors.textMain }}>
                    {d.id}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSub }}>
                    {d.name || 'Unknown Device'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>
              No devices found. Connect via USB or WiFi.
            </div>
          )}
        </div>

        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          {state.selectedDevice ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
              maxWidth: 300,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.textMain }}>
                ✅ Device Selected
              </div>
              <div style={{ fontSize: 13, color: colors.textSub, marginBottom: 8 }}>
                {state.selectedDevice.id}
              </div>
              {state.platform === 'android' && (
                <button onClick={capture} style={{
                  width: '100%',
                  padding: '14px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: state.capturing ? '#9ca3af' : '#22c55e',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: state.capturing ? 'wait' : 'pointer',
                  opacity: state.capturing ? 0.85 : 1,
                  ...pressableStyle
                }} disabled={state.capturing} {...pressableHandlers}>
                  {state.capturing ? 'Capturing…' : 'Capture Screen'}
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
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 14 }}>
              ← Select a device to continue
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// AnalyzePage Component
const AnalyzePage: React.FC = () => {
  const { state, setPhase, capture, exportZip, selectNode } = useAppStore();
  const [treeViewMode, setTreeViewMode] = React.useState<'tree' | 'list'>('list');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [geminiKey, setGeminiKey] = React.useState('');
  const [geminiModel, setGeminiModel] = React.useState('gemini-2.5-flash');
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ocrGeminiLoading, setOcrGeminiLoading] = React.useState(false);
  const [codeModal, setCodeModal] = React.useState<{
    title: string;
    node?: any;
    locators?: LocatorSuggestion[];
    easy?: {
      python: string;
      java: string;
      note: string;
      label: string;
    };
  } | null>(null);
  const [codeLang, setCodeLang] = React.useState<'python' | 'java'>('python');
  const [ocrModal, setOcrModal] = React.useState<{
    mode?: 'gemini';
    rawText?: string;
    source?: string;
    error?: string;
  } | null>(null);

  const flatNodes = React.useMemo(() => {
    const list: any[] = [];
    const walk = (n: any) => {
      list.push(n);
      n.children?.forEach(walk);
    };
    state.tree?.forEach(walk);
    return list;
  }, [state.tree]);

  const listRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const listWrapRef = React.useRef<HTMLDivElement | null>(null);

  const parseBounds = React.useCallback((b?: string) => {
    if (!b) return null;
    const m = b.match(/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/);
    if (!m) return null;
    return { x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) };
  }, []);

  React.useEffect(() => {
    if (treeViewMode !== 'list') return;
    const targetId = state.selectedNodeId;
    if (!targetId) return;
    const raf = requestAnimationFrame(() => {
      const el = listRefs.current[targetId];
      if (!el) return;
      const wrap = listWrapRef.current;
      if (wrap) {
        const wrapRect = wrap.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.top < wrapRect.top || elRect.bottom > wrapRect.bottom) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [state.selectedNodeId, state.selectedBounds, treeViewMode, flatNodes.length]);

  const copyToClipboard = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      /* ignore */
    }
  };

  const showNodeModal = (node?: any) => {
    if (!node) return;
    const sample = {
      cls: node.cls,
      text: node.text,
      id: node.resourceId,
      desc: node.contentDesc,
      bounds: node.bounds,
      packageName: node.packageName,
      index: node.index,
      clickable: node.clickable,
      enabled: node.enabled,
      focusable: node.focusable,
      checkable: node.checkable,
      checked: node.checked,
      selected: node.selected,
      scrollable: node.scrollable,
      longClickable: node.longClickable,
      parentResourceId: node.parentResourceId,
      parentClass: node.parentClass,
      isListItem: node.isListItem,
      uniqueText: node.uniqueText,
      uniqueDesc: node.uniqueDesc
    };
    const platform = state.platform || 'android';
    const locators = generateLocators([sample], platform);
    const easy = buildEasyLocator(node, platform);
    setCodeModal({
      title: node.text || node.resourceId || node.cls || 'element',
      node,
      locators,
      easy
    });
  };

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

  const easyBlock = codeModal ? buildEasyLocator(codeModal.node || {}, state.platform || 'android') : undefined;

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
              onDoubleSelect={(n) => {
                selectNode(n.id, n.bounds);
                showNodeModal(n);
              }}
              screenshotPath={state.lastCapture.screenshotPath}
              disableHighlight={!!codeModal}
            />
          ) : (
            <div style={{ color: '#9ca3af' }}>No capture available.</div>
          )}
        </div>
        
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>UI Hierarchy Tree</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setTreeViewMode('tree')} style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #1f2937',
                background: treeViewMode === 'tree' ? '#22c55e' : '#111827',
                color: '#e5e7eb',
                fontSize: 12,
                cursor: 'pointer',
                ...pressableStyle
              }} {...pressableHandlers}>
                Tree
              </button>
              <button onClick={() => setTreeViewMode('list')} style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #1f2937',
                background: treeViewMode === 'list' ? '#22c55e' : '#111827',
                color: '#e5e7eb',
                fontSize: 12,
                cursor: 'pointer',
                ...pressableStyle
              }} {...pressableHandlers}>
                List
              </button>
            </div>
          </div>
          {treeViewMode === 'tree' ? (
            state.tree && state.tree.length > 0 ? (
              <TreeView
                nodes={state.tree}
                onSelect={(n) => selectNode(n.id, n.bounds)}
                onDoubleSelect={(n) => {
                  selectNode(n.id, n.bounds);
                  showNodeModal(n);
                }}
                selectedId={state.selectedNodeId}
                selectedBounds={state.selectedBounds}
              />
            ) : (
              <div style={{ color: '#9ca3af' }}>No tree loaded.</div>
            )
          ) : (
            <div ref={listWrapRef} style={{
              maxHeight: 520,
              overflowY: 'auto',
              background: '#0b1221',
              borderRadius: 8,
              border: '1px solid #1f2937'
            }}>
              {flatNodes.map((n) => {
                const selected = n.id === state.selectedNodeId;
                return (
                  <div
                    key={n.id}
                    ref={(el) => { listRefs.current[n.id] = el; }}
                    data-bounds={n.bounds}
                    onClick={() => selectNode(n.id, n.bounds)}
                    onDoubleClick={() => showNodeModal(n)}
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #1f2937',
                      background: selected ? '#1e293b' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 100ms ease'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: selected ? 700 : 400, color: selected ? '#60a5fa' : '#e5e7eb' }}>
                      {n.text || n.resourceId || n.contentDesc || n.cls || '(no label)'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {n.cls} · {n.bounds}
                    </div>
                  </div>
                );
              })}
            </div>
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

      {/* Code Modal */}
      {codeModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2050
        }} onClick={() => setCodeModal(null)}>
          <div style={{
            background: '#0b1221',
            borderRadius: 12,
            padding: 16,
            border: '1px solid #1f2937',
            width: 820,
            maxWidth: '94%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.55)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800 }}>{codeModal.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  text: {codeModal.node?.text || '(none)'} · id: {codeModal.node?.resourceId || '(none)'}
                </div>
              </div>
              <button onClick={() => setCodeModal(null)} style={{
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

            {codeModal.node && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Basic</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, userSelect: 'text' }}>
                    <div>Package: {codeModal.node.packageName || '-'}</div>
                    <div>Class: {codeModal.node.cls || '-'}</div>
                    <div>Text: {codeModal.node.text || '-'}</div>
                    <div>Content-desc: {codeModal.node.contentDesc || '-'}</div>
                    <div>Resource-id: {codeModal.node.resourceId || '-'}</div>
                    <div>Index: {codeModal.node.index ?? '-'}</div>
                    <div>Bounds: {codeModal.node.bounds || '-'}</div>
                  </div>
                </div>
                <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Flags</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, userSelect: 'text' }}>
                    <div>clickable: {String(codeModal.node.clickable)}</div>
                    <div>enabled: {String(codeModal.node.enabled)}</div>
                    <div>focusable: {String(codeModal.node.focusable)}</div>
                    <div>checkable: {String(codeModal.node.checkable)}</div>
                    <div>checked: {String(codeModal.node.checked)}</div>
                    <div>selected: {String(codeModal.node.selected)}</div>
                    <div>scrollable: {String(codeModal.node.scrollable)}</div>
                    <div>longClickable: {String(codeModal.node.longClickable)}</div>
                  </div>
                </div>
              </div>
            )}

            {easyBlock && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Easy (Python)</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                    선택한 요소만 바로 찾고 클릭하는 기본 코드입니다. (가능하면 id/desc를 우선 사용)
                    <br />
                    {easyBlock.note}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                    {easyBlock.python}
                  </pre>
                  <button onClick={() => copyToClipboard(easyBlock.python)} style={{
                    marginTop: 4,
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }} {...pressableHandlers}>
                    Copy
                  </button>
                </div>
                <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Easy (Java)</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                    {easyBlock.note}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                    {easyBlock.java}
                  </pre>
                  <button onClick={() => copyToClipboard(easyBlock.java)} style={{
                    marginTop: 4,
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }} {...pressableHandlers}>
                    Copy
                  </button>
                </div>
              </div>
            )}

            {codeModal.locators && codeModal.locators.length > 0 && (
              <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>추천 로케이터 (AI Generated)</div>
                {codeModal.locators.slice(0, 3).map((loc, idx) => (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#60a5fa', marginBottom: 2 }}>
                      #{idx + 1} - {loc.strategy} (score: {loc.score}, tier: {loc.tier})
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 11, userSelect: 'text', background: '#0b1221', padding: 8, borderRadius: 4 }}>
                      {codeLang === 'python' ? loc.codePython : loc.codeJava}
                    </pre>
                    <button onClick={() => copyToClipboard(codeLang === 'python' ? loc.codePython : loc.codeJava)} style={{
                      marginTop: 4,
                      background: '#22c55e',
                      border: 'none',
                      borderRadius: 6,
                      color: '#0b1221',
                      padding: '4px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      ...pressableStyle
                    }} {...pressableHandlers}>
                      Copy {codeLang === 'python' ? 'Python' : 'Java'}
                    </button>
                  </div>
                ))}
              </div>
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

  React.useEffect(() => {
    console.log('App state.uiPhase:', state.uiPhase);
  }, [state.uiPhase]);

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
