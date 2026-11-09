import React from 'react';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { getApiUrl, fetchWithRetry } from '../utils/api';
import { TERMS_OF_SERVICE, PRIVACY_POLICY, TERMS_OF_SERVICE_EN, PRIVACY_POLICY_EN } from '../utils/legalTexts';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import { useEscClose } from '../hooks/useEscClose';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  useEscClose(onClose);
  const { state, setLang } = useAppStore();
  const t = useT();
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
      setSaveStatus({ type: 'error', message: t.settings.gemini.backendStarting });
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
      setSaveStatus({ type: 'error', message: t.settings.gemini.noKey });
      return;
    }
    try {
      const response = await fetchWithRetry(getApiUrl('/api/settings/gemini-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey, model: geminiModel })
      });

      if (response.ok) {
        setSaveStatus({ type: 'success', message: t.settings.gemini.saveSuccess });
        setHasSavedKey(true);
        setIsEditing(false);
        setTimeout(() => {
          onClose();
          setSaveStatus(null);
        }, 2000);
      } else {
        const error = await response.text();
        setSaveStatus({ type: 'error', message: t.settings.gemini.saveFailed(error) });
      }
    } catch (e) {
      setSaveStatus({ type: 'error', message: t.settings.adb.error(String(e)) });
    }
  };

  const handleAdbAutoDetect = async () => {
    setIsScanning(true);
    setAdbStatus(null);
    try {
      if (!window.groundview) throw new Error('ADB is only available in the desktop app.');
      const result = await window.groundview.adb.autoDetect();
      if (result?.ok && result.path) {
        setAdbPath(result.path);
        setAdbStatus({ type: 'success', message: t.settings.adb.detected(result.path) });
      } else {
        setAdbStatus({ type: 'info', message: t.settings.adb.notFound });
      }
    } catch (e) {
      setAdbStatus({ type: 'error', message: t.settings.adb.error(String(e)) });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAdbSave = async () => {
    if (!adbPath.trim()) return;
    try {
      if (!window.groundview) throw new Error('ADB is only available in the desktop app.');
      await window.groundview.adb.setPath(adbPath.trim());
      setAdbStatus({ type: 'success', message: t.settings.adb.pathSaved });
    } catch (e) {
      setAdbStatus({ type: 'error', message: t.settings.adb.error(String(e)) });
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
            <div style={{ fontWeight: 800, fontSize: 16 }}>{t.settings.title}</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>{t.settings.subtitle}</div>
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
            {t.settings.close}
          </button>
        </div>

        {/* 언어 설정 섹션 */}
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: '#9ca3af' }}>{t.settings.lang.title}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['ko', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLang(lang)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: state.uiLang === lang ? '2px solid #2563eb' : '1px solid #1f2937',
                  background: state.uiLang === lang ? '#1e3a5f' : '#0e1726',
                  color: state.uiLang === lang ? '#60a5fa' : '#9ca3af',
                  fontSize: 13,
                  fontWeight: state.uiLang === lang ? 700 : 400,
                  cursor: 'pointer',
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                {t.settings.lang[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* ADB 섹션 */}
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>ADB (Android Debug Bridge)</div>
          <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 8 }}>
            {t.settings.adb.desc}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={adbPath}
              onChange={(e) => setAdbPath(e.target.value)}
              placeholder={t.settings.adb.placeholder}
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
              {isScanning ? t.settings.adb.scanning : t.settings.adb.autoDetect}
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
              {t.settings.adb.save}
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
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{t.settings.gemini.title}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>{t.settings.gemini.apiKey}</label>
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
                {t.settings.gemini.change}
              </button>
            )}
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={isLoading ? t.settings.gemini.loading : t.settings.gemini.placeholder}
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
              {t.settings.gemini.keySaved}
            </div>
          )}
          {isEditing && (
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4 }}>
              {t.settings.gemini.editHint}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t.settings.gemini.model}</label>
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
          {t.settings.gemini.saveBtn}
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          <div style={{ marginBottom: 4 }}>{t.settings.gemini.encryptNote}</div>
          <div>
            {t.settings.gemini.apiKeyNote}{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa' }}
            >
              Google AI Studio
            </a>
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
              {t.settings.footer.terms}
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
              {t.settings.footer.privacy}
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
                {legalPopup === 'terms' ? t.settings.footer.terms : t.settings.footer.privacy}
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
                {t.settings.close}
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
              {legalPopup === 'terms'
                ? (state.uiLang === 'en' ? TERMS_OF_SERVICE_EN : TERMS_OF_SERVICE)
                : (state.uiLang === 'en' ? PRIVACY_POLICY_EN : PRIVACY_POLICY)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
