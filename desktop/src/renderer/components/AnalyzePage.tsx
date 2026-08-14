import React from 'react';
import { useAppStore } from '../store';
import { TreeView } from './TreeView';
import { ListView } from './ListView';
import { Overlay } from './Overlay';
import { CodeModal } from './CodeModal';
import { SettingsModal } from './SettingsModal';
import { OcrModal } from './OcrModal';
import { DeviceInfoModal } from './DeviceInfoModal';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { generateLocators, LocatorSuggestion } from '../../../../core/src/locator';
import { buildEasyLocator } from '../utils/locatorHelpers';
import { getApiUrl, fetchWithRetry } from '../utils/api';
import { useT } from '../i18n';

export const AnalyzePage: React.FC = () => {
  const { state, setPhase, capture, exportZip, selectNode } = useAppStore();
  const t = useT();
  const [treeViewMode, setTreeViewMode] = React.useState<'tree' | 'list'>('list');
  const [showCodeModal, setShowCodeModal] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showDeviceInfo, setShowDeviceInfo] = React.useState(false);
  const [showOcrResult, setShowOcrResult] = React.useState(false);
  const [ocrLoading, setOcrLoading] = React.useState(false);
  const [ocrData, setOcrData] = React.useState<{ error?: string; rawText?: string; source?: string }>({});
  const [selectedNodeForModal, setSelectedNodeForModal] = React.useState<any>(null);
  const [locatorsForModal, setLocatorsForModal] = React.useState<LocatorSuggestion[]>([]);

  const flatNodes = React.useMemo(() => {
    const list: any[] = [];
    const walk = (n: any) => {
      list.push(n);
      n.children?.forEach(walk);
    };
    state.tree?.forEach(walk);
    return list;
  }, [state.tree]);

  const showNodeModal = (node?: any) => {
    if (!node) return;
    setSelectedNodeForModal(node);
    const platform = state.selectedDevice?.platform || 'android';
    const locators = generateLocators([node], platform);
    setLocatorsForModal(locators);
    setShowCodeModal(true);
  };

  const handleGeminiOcr = async () => {
    if (!state.lastCapture?.screenshotPath) {
      setOcrData({ error: 'No screenshot available' });
      setShowOcrResult(true);
      return;
    }

    setOcrLoading(true);
    try {
      const response = await fetchWithRetry(getApiUrl('/gemini_ocr'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot_path: state.lastCapture.screenshotPath })
      });

      if (response.ok) {
        const data = await response.json();
        setOcrData({ rawText: data.raw_text, source: data.source });
        setShowOcrResult(true);
      } else {
        const errorText = await response.text();
        setOcrData({ error: t.analyze.ocrFailed(errorText) });
        setShowOcrResult(true);
      }
    } catch (e) {
      setOcrData({ error: t.analyze.ocrFailed(String(e)) });
      setShowOcrResult(true);
    } finally {
      setOcrLoading(false);
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
          <button onClick={() => setShowDeviceInfo(true)} style={{
            background: '#0ea5e9',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
            ...pressableStyle
          }} disabled={(state.selectedDevice?.platform || 'android') !== 'android'} {...pressableHandlers}>
            📱 기기 정보
          </button>
          <button onClick={() => setShowSettings(true)} style={{
            background: '#6366f1',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
            ...pressableStyle
          }} {...pressableHandlers}>
            ⚙️ Settings
          </button>
          <button onClick={handleGeminiOcr} style={{
            background: ocrLoading ? '#9ca3af' : '#10b981',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: ocrLoading ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: ocrLoading ? 0.8 : 1,
            ...pressableStyle
          }} disabled={!state.lastCapture?.screenshotPath || ocrLoading} {...pressableHandlers}>
            {ocrLoading ? '⏳ Processing...' : '🤖 Gemini OCR'}
          </button>
          <button onClick={capture} style={{
            background: state.capturing ? '#9ca3af' : '#3b82f6',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: state.capturing ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: state.capturing ? 0.8 : 1,
            ...pressableStyle
          }} disabled={state.capturing} {...pressableHandlers}>
            {state.capturing ? '⏳ Capturing...' : '📸 Capture'}
          </button>
          <button onClick={exportZip} style={{
            background: state.saving ? '#9ca3af' : '#a855f7',
            color: '#fff',
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            cursor: state.saving ? 'wait' : 'pointer',
            fontWeight: 700,
            opacity: state.saving ? 0.85 : 1,
            ...pressableStyle
          }} disabled={!state.lastCapture || state.saving} {...pressableHandlers}>
            {state.saving ? '💾 Saving…' : '💾 Save'}
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
              disableHighlight={false}
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
            <ListView
              nodes={flatNodes}
              selectedNodeId={state.selectedNodeId}
              selectedBounds={state.selectedBounds}
              onSelect={(id, bounds) => selectNode(id, bounds)}
              onDoubleClick={showNodeModal}
            />
          )}
        </div>
      </div>

      {showCodeModal && selectedNodeForModal && (
        <CodeModal
          node={selectedNodeForModal}
          platform={state.selectedDevice?.platform || 'android'}
          locators={locatorsForModal}
          screenshotPath={state.lastCapture?.screenshotPath}
          selectedBounds={state.selectedBounds}
          onClose={() => setShowCodeModal(false)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showDeviceInfo && (
        <DeviceInfoModal
          deviceId={state.selectedDevice?.id || state.metaDeviceId || ''}
          onClose={() => setShowDeviceInfo(false)}
        />
      )}

      {showOcrResult && (
        <OcrModal
          error={ocrData.error}
          rawText={ocrData.rawText}
          source={ocrData.source}
          onClose={() => setShowOcrResult(false)}
        />
      )}

      {ocrLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            flexDirection: 'column',
            gap: 16
          }}
        >
          <div style={{
            width: 60,
            height: 60,
            border: '4px solid rgba(16, 185, 129, 0.3)',
            borderTop: '4px solid #10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ color: '#e5e7eb', fontSize: 16, fontWeight: 700 }}>
            {t.analyze.analyzing}
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </>
  );
};
