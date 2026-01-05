import React from 'react';
import { LocatorSuggestion } from '../../../../core/src/locator';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { buildEasyLocator, copyToClipboard } from '../utils/locatorHelpers';
import { friendlyHint, friendlyRisk, locatorHints } from '../utils/codeHelpers';

interface CodeModalProps {
  node: any;
  platform: 'android' | 'ios';
  locators?: LocatorSuggestion[];
  screenshotPath?: string;
  selectedBounds?: string;
  onClose: () => void;
}

export const CodeModal: React.FC<CodeModalProps> = ({ node, platform, locators, screenshotPath, selectedBounds, onClose }) => {
  const [codeLang, setCodeLang] = React.useState<'python' | 'java'>('python');
  const [geminiLocator, setGeminiLocator] = React.useState<{
    loading: boolean;
    error?: string | null;
    data?: any | null;
  }>({
    loading: false,
    error: null,
    data: null
  });

  React.useEffect(() => {
    // Load Gemini recommendations when modal opens
    if (node && screenshotPath) {
      setGeminiLocator({ loading: true, error: null, data: null });
      
      if (!window.groundview?.locator?.gemini) {
        setGeminiLocator({ loading: false, error: 'Gemini 제안 브리지가 없습니다.', data: null });
        return;
      }

      window.groundview.locator
        .gemini({
          node,
          screenshot: screenshotPath,
          bounds: selectedBounds
        })
        .then((res) => {
          if (res?.ok && res.suggestion) {
            setGeminiLocator({ loading: false, error: null, data: res.suggestion });
          } else {
            setGeminiLocator({ loading: false, error: res?.error || 'Gemini 제안 실패', data: null });
          }
        })
        .catch((e: any) => setGeminiLocator({ loading: false, error: String(e), data: null }));
    }
  }, [node, screenshotPath, selectedBounds]);

  const easyBlock = buildEasyLocator(node, platform);
  const title = node.text || node.resourceId || node.cls || 'element';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2050
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0b1221',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #1f2937',
          width: 820,
          maxWidth: '94%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
          color: '#e5e7eb'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 800 }}>{title}</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>
              text: {node.text || '(none)'} · id: {node.resourceId || '(none)'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#111827',
              color: '#e5e7eb',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              ...pressableStyle
            }}
            {...pressableHandlers}
          >
            Close
          </button>
        </div>

        {/* Basic Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Basic</div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, userSelect: 'text' }}>
              <div>Package: {node.packageName || '-'}</div>
              <div>Class: {node.cls || '-'}</div>
              <div>Text: {node.text || '-'}</div>
              <div>Content-desc: {node.contentDesc || '-'}</div>
              <div>Resource-id: {node.resourceId || '-'}</div>
              <div>Index: {node.index ?? '-'}</div>
              <div>Bounds: {node.bounds || '-'}</div>
            </div>
          </div>
          <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Flags</div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, userSelect: 'text' }}>
              <div>clickable: {String(node.clickable)}</div>
              <div>enabled: {String(node.enabled)}</div>
              <div>focusable: {String(node.focusable)}</div>
              <div>checkable: {String(node.checkable)}</div>
              <div>checked: {String(node.checked)}</div>
              <div>selected: {String(node.selected)}</div>
              <div>scrollable: {String(node.scrollable)}</div>
              <div>longClickable: {String(node.longClickable)}</div>
            </div>
          </div>
        </div>

        {/* Easy Locators */}
        {easyBlock && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Easy (Python)</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                선택한 요소만 바로 찾고 클릭하는 기본 코드입니다.
                <br />
                {easyBlock.note}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                {easyBlock.python}
              </pre>
              <button
                onClick={() => copyToClipboard(easyBlock.python)}
                style={{
                  marginTop: 4,
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                Copy
              </button>
            </div>
            <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Easy (Java)</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{easyBlock.note}</div>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                {easyBlock.java}
              </pre>
              <button
                onClick={() => copyToClipboard(easyBlock.java)}
                style={{
                  marginTop: 4,
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Gemini AI Recommendations */}
        <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Gemini 제안 (LLM)</div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
            화면과 선택한 요소를 보고 AI가 추천한 안정적인 코드입니다. 기다리면 자동으로 채워집니다.
          </div>
          {geminiLocator.loading && <div style={{ color: '#9ca3af' }}>Gemini 제안을 불러오는 중입니다...</div>}
          {!geminiLocator.loading && geminiLocator.error && (
            <div style={{ color: '#f87171' }}>오류: {geminiLocator.error}</div>
          )}
          {!geminiLocator.loading && !geminiLocator.error && geminiLocator.data && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#0b1221', borderRadius: 6, padding: 8, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Python (Wait 포함)</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                  {geminiLocator.data?.python || '(empty)'}
                </pre>
                <button
                  onClick={() => copyToClipboard(geminiLocator.data?.python || '')}
                  style={{
                    marginTop: 4,
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  Copy
                </button>
              </div>
              <div style={{ background: '#0b1221', borderRadius: 6, padding: 8, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Java (Wait 포함)</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', fontSize: 12, minHeight: 60, userSelect: 'text' }}>
                  {geminiLocator.data?.java || '(empty)'}
                </pre>
                <button
                  onClick={() => copyToClipboard(geminiLocator.data?.java || '')}
                  style={{
                    marginTop: 4,
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  Copy
                </button>
              </div>
              <div style={{ gridColumn: '1 / span 2', color: '#9ca3af', fontSize: 12 }}>
                {geminiLocator.data?.note && <div>요약: {geminiLocator.data.note}</div>}
                {geminiLocator.data?.hints && geminiLocator.data.hints.length > 0 && (
                  <div>힌트: {geminiLocator.data.hints.join(' · ')}</div>
                )}
                {geminiLocator.data?.risks && geminiLocator.data.risks.length > 0 && (
                  <div style={{ color: '#f87171' }}>위험: {geminiLocator.data.risks.join(' · ')}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Generated Locators - Language Toggle */}
        {locators && locators.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => setCodeLang('python')}
              style={{
                border: '1px solid #1f2937',
                background: codeLang === 'python' ? '#22c55e' : '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Python
            </button>
            <button
              onClick={() => setCodeLang('java')}
              style={{
                border: '1px solid #1f2937',
                background: codeLang === 'java' ? '#22c55e' : '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Java
            </button>
          </div>
        )}

        {/* AI Generated Locators List */}
        {locators && locators.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
            {locators.slice(0, 5).map((loc, idx) => (
              <div
                key={idx}
                style={{
                  background: '#0e1726',
                  borderRadius: 8,
                  padding: 10,
                  border: '1px solid #1f2937'
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {loc.tier === 'recommended' ? 'Recommended' : loc.tier === 'alternative' ? 'Alternative' : 'Fallback'}{' '}
                  ({codeLang.toUpperCase()}) · {loc.strategy}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 2 }}>{loc.value}</div>
                <div
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    background:
                      loc.tier === 'recommended'
                        ? 'rgba(34,197,94,0.15)'
                        : loc.tier === 'alternative'
                        ? 'rgba(14,165,233,0.12)'
                        : 'rgba(248,113,113,0.14)',
                    color: loc.tier === 'recommended' ? '#4ade80' : loc.tier === 'alternative' ? '#38bdf8' : '#fca5a5',
                    border: '1px solid #1f2937',
                    marginBottom: 4
                  }}
                >
                  score {loc.score}
                </div>
                {loc.notes && loc.notes.length > 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                    {loc.notes.map((n: string, i: number) => (
                      <div key={`note-${i}`}>💡 {friendlyHint(n)}</div>
                    ))}
                  </div>
                )}
                {loc.risks && loc.risks.length > 0 && (
                  <div style={{ color: '#f87171', fontSize: 12, marginBottom: 4 }}>
                    위험:{' '}
                    {loc.risks.map((r: string, i: number) => (
                      <div key={`risk-${i}`}>⚠️ {friendlyRisk(r)}</div>
                    ))}
                  </div>
                )}
                {idx === 0 && (
                  <div style={{ color: '#a3e635', fontSize: 12, marginBottom: 4 }}>
                    {(locatorHints(node || {}) || []).map((h: string, i: number) => (
                      <div key={`hint-${i}`}>💬 {friendlyHint(h)}</div>
                    ))}
                  </div>
                )}
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: '#e5e7eb',
                    fontSize: 12,
                    minHeight: 60,
                    userSelect: 'text'
                  }}
                >
                  {codeLang === 'python' ? loc.codePython : loc.codeJava}
                </pre>
                <button
                  onClick={() => copyToClipboard(codeLang === 'python' ? loc.codePython : loc.codeJava)}
                  style={{
                    marginTop: 4,
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
