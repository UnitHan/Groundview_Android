import React from 'react';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { getApiUrl } from '../utils/api';

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

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(getApiUrl('/api/settings/gemini-key'));
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
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSaveGeminiKey = async () => {
    if (!geminiKey.trim()) {
      setSaveStatus({ type: 'error', message: 'API Key를 입력하세요.' });
      return;
    }
    try {
      const response = await fetch(getApiUrl('/api/settings/gemini-key'), {
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
            <div style={{ fontWeight: 800, fontSize: 16 }}>Gemini API 설정</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>API Key는 암호화되어 안전하게 저장됩니다</div>
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

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 700 }}>API Key</label>
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
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>모델</label>
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
          💾 저장
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
      </div>
    </div>
  );
};
