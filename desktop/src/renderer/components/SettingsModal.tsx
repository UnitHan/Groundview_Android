import React from 'react';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { getApiUrl, fetchWithRetry } from '../utils/api';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../utils/legalTexts';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [geminiKey, setGeminiKey] = React.useState('');
  const [geminiModel, setGeminiModel] = React.useState('gemini-2.5-flash');
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasSavedKey, setHasSavedKey] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  // ADB state
  const [adbPath, setAdbPath] = React.useState('');
  const [adbStatus, setAdbStatus] = React.useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);

  // Legal popup state
  const [legalPopup, setLegalPopup] = React.useState<'terms' | 'privacy' | null>(null);

  React.useEffect(() => {
    const loadSettings = async () => {
      // Retry up to 5 times (500ms apart) to handle slow backend startup
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await fetchWithRetry(getApiUrl('/api/settings/gemini-key'));
          if (response.ok) {
            const data = await response.json();
            if (data.apiKey) {
              setGeminiKey(data.apiKey);
              setHasSavedKey(true);
            }
            if (data.model) {
              setGeminiModel(data.model);
            }
          }
          setIsLoading(false);
          return;
        } catch (e) {
          lastError = e;
          if (attempt < 4) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
      // All retries exhausted — show soft warning, don't block usage
      console.warn('Backend not reachable after retries:', lastError);
      setSaveStatus({ type: 'error', message: '백엔드 서버 준비 중입니다. 잠시 후 다시 시도해주세요.' });
      setIsLoading(false);
    };
    loadSettings();

    // Load current ADB path
    const loadAdb = async () => {
      try {
        if (window.groundview?.adb?.getPath) {
          const p = await window.groundview.adb.getPath();
          if (p) setAdbPath(p);
        }
      } catch { /* ignore */ }
    };
    loadAdb();
  }, []);

  const handleSaveGeminiKey = async () => {
    if (!geminiKey.trim()) {
      setSaveStatus({ type: 'error', message: 'API Key를 입력하세요.' });
      return;
    }
    try {
      const response = await fetchWithRetry(getApiUrl('/api/settings/gemini-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey, model: geminiModel })
      });

      if (response.ok) {
        setSaveStatus({ type: 'success', message: 'API Key가 암호화되어 저장되었습니다!' });
        setHasSavedKey(true);
        setIsEditing(false);
        setTimeout(() => {
          onClose();
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

  const handleAdbAutoDetect = async () => {
    setIsScanning(true);
    setAdbStatus(null);
    try {
      const result = await window.groundview.adb.autoDetect();
      if (result?.ok && result.path) {
        setAdbPath(result.path);
        setAdbStatus({ type: 'success', message: `자동 감지됨: ${result.path}` });
      } else {
        setAdbStatus({ type: 'info', message: 'ADB를 찾지 못했습니다. Android Studio를 설치하거나 경로를 직접 입력하세요.' });
      }
    } catch (e) {
      setAdbStatus({ type: 'error', message: `오류: ${String(e)}` });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAdbSave = async () => {
    if (!adbPath.trim()) return;
    try {
      await window.groundview.adb.setPath(adbPath.trim());
      setAdbStatus({ type: 'success', message: 'ADB 경로가 저장되었습니다.' });
    } catch (e) {
      setAdbStatus({ type: 'error', message: `오류: ${String(e)}` });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1150
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0b1221',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 16,
          width: 520,
          maxWidth: '90%',
          color: '#e5e7eb',
          boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>설정</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>앱 설정을 관리합니다</div>
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

        {/* ADB 섹션 */}
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>ADB (Android Debug Bridge)</div>
          <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 8 }}>
            Android 기기 연결에 사용됩니다. Android Studio 설치 시 자동 감지됩니다.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={adbPath}
              onChange={(e) => setAdbPath(e.target.value)}
              placeholder="adb.exe 경로 (예: C:\Users\...\platform-tools\adb.exe)"
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #1f2937',
                background: '#0e1726',
                color: '#e5e7eb',
                fontSize: 12,
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={handleAdbAutoDetect}
              disabled={isScanning}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #1f2937',
                background: '#1e3a5f',
                color: '#60a5fa',
                fontSize: 12,
                cursor: isScanning ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              {isScanning ? '탐색 중...' : '자동 감지'}
            </button>
            <button
              onClick={handleAdbSave}
              disabled={!adbPath.trim()}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: adbPath.trim() ? '#2563eb' : '#1f2937',
                color: '#fff',
                fontSize: 12,
                cursor: adbPath.trim() ? 'pointer' : 'not-allowed',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              저장
            </button>
          </div>
          {adbStatus && (
            <div style={{
              fontSize: 11,
              color: adbStatus.type === 'success' ? '#4ade80' : adbStatus.type === 'error' ? '#f87171' : '#60a5fa',
              marginTop: 4
            }}>
              {adbStatus.type === 'success' ? '✓' : adbStatus.type === 'error' ? '✗' : 'ℹ'} {adbStatus.message}
            </div>
          )}
        </div>

        {/* Gemini API Key 섹션 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Gemini API 설정</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>API Key</label>
            {hasSavedKey && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #1f2937',
                  background: '#111827',
                  color: '#60a5fa',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                변경
              </button>
            )}
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={isLoading ? "로딩 중..." : "AIza..."}
            disabled={isLoading || (hasSavedKey && !isEditing)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #1f2937',
              background: '#0e1726',
              color: '#e5e7eb',
              fontSize: 14,
              opacity: (isLoading || (hasSavedKey && !isEditing)) ? 0.6 : 1,
              boxSizing: 'border-box',
              cursor: (hasSavedKey && !isEditing) ? 'not-allowed' : 'text'
            }}
          />
          {hasSavedKey && !isLoading && !isEditing && (
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
              ✓ API Key가 저장되어 있습니다
            </div>
          )}
          {isEditing && (
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4 }}>
              ✏️ 새로운 API Key를 입력하세요
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>모델</label>
          <select
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #1f2937',
              background: '#0e1726',
              color: '#e5e7eb',
              fontSize: 14,
              boxSizing: 'border-box'
            }}
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
          </select>
        </div>

        {saveStatus && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              marginBottom: 12,
              background: saveStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: saveStatus.type === 'success' ? '#4ade80' : '#f87171',
              border: `1px solid ${saveStatus.type === 'success' ? '#22c55e' : '#ef4444'}`
            }}
          >
            {saveStatus.message}
          </div>
        )}

        <button
          onClick={handleSaveGeminiKey}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            ...pressableStyle
          }}
          {...pressableHandlers}
        >
          💾 Gemini Key 저장
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          <div style={{ marginBottom: 4 }}>🔒 API Key는 PBKDF2-HMAC-SHA256 해시 + Fernet 암호화로 보호됩니다</div>
          <div>
            📌 Gemini API Key는{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa' }}
            >
              Google AI Studio
            </a>
            에서 발급받을 수 있습니다
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8
        }}>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            © {new Date().getFullYear()} QA Bulls. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => setLegalPopup('terms')}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              이용약관
            </button>
            <button
              onClick={() => setLegalPopup('privacy')}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              개인정보처리방침
            </button>
          </div>
        </div>
      </div>

      {/* Legal content popup */}
      {legalPopup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200
          }}
          onClick={() => setLegalPopup(null)}
        >
          <div
            style={{
              background: '#0b1221',
              border: '1px solid #1f2937',
              borderRadius: 12,
              padding: 24,
              width: 560,
              maxWidth: '92%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#e5e7eb' }}>
                {legalPopup === 'terms' ? '이용약관' : '개인정보처리방침'}
              </div>
              <button
                onClick={() => setLegalPopup(null)}
                style={{
                  border: 'none',
                  background: '#111827',
                  color: '#e5e7eb',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                닫기
              </button>
            </div>
            <div style={{
              overflowY: 'auto',
              flex: 1,
              fontSize: 12,
              color: '#9ca3af',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit'
            }}>
              {legalPopup === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
