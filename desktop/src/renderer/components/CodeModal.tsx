import React from 'react';
import { LocatorSuggestion } from '../../../../core/src/locator';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { buildEasyLocator, copyToClipboard } from '../utils/locatorHelpers';
import { friendlyHint, friendlyRisk, locatorHints } from '../utils/codeHelpers';
import { useEscClose } from '../hooks/useEscClose';

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
  useEscClose(onClose);
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
          console.log('[CodeModal] Gemini 응답:', res);
          if (res?.ok && res.suggestion) {
            setGeminiLocator({ loading: false, error: null, data: res.suggestion });
          } else {
            const errorMsg = res?.error || 'Gemini 제안 실패 (알 수 없는 오류)';
            console.error('[CodeModal] Gemini 오류:', errorMsg, res);
            setGeminiLocator({ loading: false, error: errorMsg, data: null });
          }
        })
        .catch((e: any) => {
          console.error('[CodeModal] Gemini 예외:', e);
          setGeminiLocator({ loading: false, error: `네트워크 오류: ${String(e)}`, data: null });
        });
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
          <div style={{ marginBottom: 8 }}>
            {/* 안정성 배지 */}
            <div style={{ 
              display: 'flex', 
              gap: 8, 
              alignItems: 'center', 
              marginBottom: 8,
              padding: 10,
              background: easyBlock.stability === 'high' ? '#10b98120' : 
                         easyBlock.stability === 'medium' ? '#f59e0b20' : '#ef444420',
              borderRadius: 8,
              border: `1px solid ${easyBlock.stability === 'high' ? '#10b981' : 
                                   easyBlock.stability === 'medium' ? '#f59e0b' : '#ef4444'}`
            }}>
              <span style={{
                padding: '4px 12px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                background: easyBlock.stability === 'high' ? '#10b981' : 
                           easyBlock.stability === 'medium' ? '#f59e0b' : '#ef4444',
                color: '#fff'
              }}>
                {easyBlock.badge}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {easyBlock.note}
                </div>
                {easyBlock.caution && (
                  <div style={{ fontSize: 11, color: '#fca5a5' }}>
                    ⚠️ {easyBlock.caution}
                  </div>
                )}
              </div>
            </div>

            {/* 코드 블록 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>
                  Easy Python (Wait 포함)
                </div>
                <pre style={{ 
                  whiteSpace: 'pre-wrap', 
                  color: '#e5e7eb', 
                  fontSize: 11, 
                  minHeight: 60, 
                  userSelect: 'text',
                  lineHeight: 1.5,
                  maxHeight: 250,
                  overflowY: 'auto'
                }}>
                  {easyBlock.python}
                </pre>
                <button
                  onClick={() => copyToClipboard(easyBlock.python)}
                  style={{
                    marginTop: 4,
                    background: easyBlock.stability === 'high' ? '#10b981' : 
                               easyBlock.stability === 'medium' ? '#f59e0b' : '#6b7280',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  📋 복사하기
                </button>
              </div>
              <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>
                  Easy Java (Wait 포함)
                </div>
                <pre style={{ 
                  whiteSpace: 'pre-wrap', 
                  color: '#e5e7eb', 
                  fontSize: 11, 
                  minHeight: 60, 
                  userSelect: 'text',
                  lineHeight: 1.5,
                  maxHeight: 250,
                  overflowY: 'auto'
                }}>
                  {easyBlock.java}
                </pre>
                <button
                  onClick={() => copyToClipboard(easyBlock.java)}
                  style={{
                    marginTop: 4,
                    background: easyBlock.stability === 'high' ? '#10b981' : 
                               easyBlock.stability === 'medium' ? '#f59e0b' : '#6b7280',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  📋 복사하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gemini AI Recommendations */}
        <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, border: '1px solid #1f2937', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Gemini 제안 (LLM)</div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
            화면과 선택한 요소를 보고 AI가 추천한 안정적인 코드입니다. 기다리면 자동으로 채워집니다.
          </div>
          {geminiLocator.loading && <div style={{ color: '#9ca3af' }}>🤖 Gemini AI가 초보자용 코드를 생성 중입니다...</div>}
          {!geminiLocator.loading && geminiLocator.error && (
            <div style={{ color: '#f87171' }}>⚠️ 오류: {geminiLocator.error}</div>
          )}
          {!geminiLocator.loading && !geminiLocator.error && geminiLocator.data && (
            <div>
              {/* 안정성 배지 */}
              {geminiLocator.data?.stability && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    background: geminiLocator.data.stability === 'high' ? '#10b981' : 
                               geminiLocator.data.stability === 'medium' ? '#f59e0b' : '#ef4444',
                    color: '#fff'
                  }}>
                    {geminiLocator.data.stability === 'high' ? '🥇 높은 안정성' :
                     geminiLocator.data.stability === 'medium' ? '🥈 중간 안정성' : '⚠️ 낮은 안정성'}
                  </span>
                  {geminiLocator.data?.locatorType && (
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>
                      전략: {geminiLocator.data.locatorType}
                    </span>
                  )}
                </div>
              )}

              {/* 요약 및 힌트 (코드보다 먼저 표시) */}
              <div style={{ background: '#0e1726', borderRadius: 8, padding: 10, marginBottom: 8, border: '1px solid #1f2937' }}>
                {geminiLocator.data?.note && (
                  <div style={{ marginBottom: 8, color: '#e5e7eb', fontSize: 13 }}>
                    💡 <strong>요약:</strong> {geminiLocator.data.note}
                  </div>
                )}
                {geminiLocator.data?.hints && geminiLocator.data.hints.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#10b981', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      ✅ 초보자 팁:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, color: '#9ca3af', fontSize: 12 }}>
                      {geminiLocator.data.hints.map((hint: string, i: number) => (
                        <li key={i} style={{ marginBottom: 2 }}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {geminiLocator.data?.risks && geminiLocator.data.risks.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#f87171', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      ⚠️ 주의사항:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, color: '#fca5a5', fontSize: 12 }}>
                      {geminiLocator.data.risks.map((risk: string, i: number) => (
                        <li key={i} style={{ marginBottom: 2 }}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {geminiLocator.data?.devRequest && (
                  <div style={{ 
                    marginTop: 8,
                    padding: 8,
                    background: '#3b82f620',
                    borderRadius: 6,
                    border: '1px solid #3b82f6'
                  }}>
                    <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      👨‍💻 개발팀 요청사항:
                    </div>
                    <div style={{ color: '#93c5fd', fontSize: 11 }}>
                      {geminiLocator.data.devRequest}
                    </div>
                  </div>
                )}
              </div>

              {/* 코드 블록 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#0b1221', borderRadius: 6, padding: 8, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Python (복사 후 바로 사용)</span>
                  </div>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    color: '#e5e7eb', 
                    fontSize: 12, 
                    minHeight: 60, 
                    userSelect: 'text',
                    lineHeight: 1.5,
                    fontFamily: 'Consolas, Monaco, monospace'
                  }}>
                    {geminiLocator.data?.python || '(empty)'}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(geminiLocator.data?.python || '')}
                    style={{
                      marginTop: 4,
                      background: '#10b981',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      ...pressableStyle
                    }}
                    {...pressableHandlers}
                  >
                    📋 복사하기
                  </button>
                </div>
                <div style={{ background: '#0b1221', borderRadius: 6, padding: 8, border: '1px solid #1f2937' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Java (복사 후 바로 사용)</span>
                  </div>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    color: '#e5e7eb', 
                    fontSize: 12, 
                    minHeight: 60, 
                    userSelect: 'text',
                    lineHeight: 1.5,
                    fontFamily: 'Consolas, Monaco, monospace'
                  }}>
                    {geminiLocator.data?.java || '(empty)'}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(geminiLocator.data?.java || '')}
                    style={{
                      marginTop: 4,
                      background: '#10b981',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      ...pressableStyle
                    }}
                    {...pressableHandlers}
                  >
                    📋 복사하기
                  </button>
                </div>
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
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
              🤖 자동 생성 로케이터 (다양한 전략)
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              여러 방법을 제공합니다. ✅ 추천을 먼저 사용하세요.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {locators.slice(0, 5).map((loc, idx) => {
              const isRecommended = loc.tier === 'recommended';
              const isAlternative = loc.tier === 'alternative';
              const isFallback = loc.tier === 'fallback';
              
              return (
              <div
                key={idx}
                style={{
                  background: '#0e1726',
                  borderRadius: 8,
                  padding: 10,
                  border: isFallback ? '1px solid #7f1d1d' : '1px solid #1f2937',
                  opacity: isFallback ? 0.7 : 1
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
                  {isRecommended && '✅ 추천'}
                  {isAlternative && '⚠️  대안'}
                  {isFallback && '❌ 최후 수단'}
                  {' '}({codeLang.toUpperCase()}) · {loc.strategy}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>{loc.value}</div>
                <div
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    background: isRecommended ? 'rgba(34,197,94,0.2)' : 
                               isAlternative ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.2)',
                    color: isRecommended ? '#4ade80' : isAlternative ? '#fbbf24' : '#ef4444',
                    border: '1px solid #1f2937',
                    marginBottom: 4
                  }}
                >
                  점수 {loc.score}
                </div>
                
                {/* Risks 경고 (빨간색 강조) */}
                {loc.risks && loc.risks.length > 0 && (
                  <div style={{ 
                    background: '#7f1d1d20', 
                    border: '1px solid #7f1d1d',
                    borderRadius: 6,
                    padding: '6px 8px',
                    marginBottom: 6
                  }}>
                    <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                      ⚠️  주의사항:
                    </div>
                    {loc.risks.map((r: string, i: number) => (
                      <div key={`risk-${i}`} style={{ color: '#fca5a5', fontSize: 11 }}>
                        • {r}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Notes */}
                {loc.notes && loc.notes.length > 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
                    {loc.notes.map((n: string, i: number) => (
                      <div key={`note-${i}`}>💡 {friendlyHint(n)}</div>
                    ))}
                  </div>
                )}
                
                {/* Fallback 경고 */}
                {isFallback && (
                  <div style={{
                    background: '#7f1d1d30',
                    border: '1px dashed #ef4444',
                    borderRadius: 6,
                    padding: 8,
                    marginBottom: 6,
                    fontSize: 11,
                    color: '#fca5a5'
                  }}>
                    ❌ <strong>초보자 비추천</strong>: 매우 불안정합니다. 다른 방법 먼저 시도하세요.
                  </div>
                )}
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: '#e5e7eb',
                    fontSize: 11,
                    minHeight: 60,
                    userSelect: 'text',
                    lineHeight: 1.5
                  }}
                >
                  {codeLang === 'python' ? loc.codePython : loc.codeJava}
                </pre>
                <button
                  onClick={() => copyToClipboard(codeLang === 'python' ? loc.codePython : loc.codeJava)}
                  style={{
                    marginTop: 4,
                    background: isRecommended ? '#10b981' : isAlternative ? '#f59e0b' : '#6b7280',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  {isRecommended ? '✅ 복사' : isAlternative ? '⚠️  복사' : '❌ 복사'}
                </button>
              </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
};
