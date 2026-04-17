import React from 'react';
import { TERMS_OF_SERVICE, PRIVACY_POLICY, CONSENT_KEY } from '../utils/legalTexts';
import { pressableStyle, pressableHandlers } from '../utils/styles';

interface ConsentModalProps {
  onAccept: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({ onAccept }) => {
  const [termsChecked, setTermsChecked] = React.useState(false);
  const [privacyChecked, setPrivacyChecked] = React.useState(false);
  const [viewing, setViewing] = React.useState<'terms' | 'privacy' | null>(null);

  const canAccept = termsChecked && privacyChecked;

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } catch { /* ignore */ }
    onAccept();
  };

  if (viewing) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          background: '#0b1221',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 24,
          width: 580,
          maxWidth: '92%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#e5e7eb' }}>
              {viewing === 'terms' ? '이용약관' : '개인정보처리방침'}
            </div>
            <button
              onClick={() => setViewing(null)}
              style={{
                border: 'none',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 12,
                ...pressableStyle
              }}
              {...pressableHandlers}
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
            {viewing === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: '#0b1221',
        border: '1px solid #1f2937',
        borderRadius: 14,
        padding: 28,
        width: 480,
        maxWidth: '92%',
        color: '#e5e7eb',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>GroundView에 오신 것을 환영합니다</div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
            서비스를 이용하기 전에 아래 약관을 읽고 동의해 주세요.
          </div>
        </div>

        {/* Info box */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 10,
          padding: 14,
          marginBottom: 20,
          fontSize: 12,
          color: '#9ca3af',
          lineHeight: 1.7
        }}>
          <div style={{ marginBottom: 6, color: '#d1d5db', fontWeight: 600 }}>이 앱은 다음을 수행합니다</div>
          <div>• Android 기기 화면을 로컬에서 캡처하고 UI 요소를 분석합니다</div>
          <div>• AI 분석 기능 사용 시 화면 이미지가 Google Gemini API로 전송됩니다</div>
          <div>• Gemini API Key는 이용자 기기 내에 암호화하여 저장됩니다</div>
          <div>• 회사 서버로는 어떤 데이터도 전송되지 않습니다</div>
        </div>

        {/* Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
            />
            <span style={{ fontSize: 13, color: '#d1d5db' }}>
              <button
                onClick={() => setViewing('terms')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                이용약관
              </button>
              을 읽고 동의합니다 (필수)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={privacyChecked}
              onChange={(e) => setPrivacyChecked(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
            />
            <span style={{ fontSize: 13, color: '#d1d5db' }}>
              <button
                onClick={() => setViewing('privacy')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                개인정보처리방침
              </button>
              을 읽고 동의합니다 (필수)
            </span>
          </label>
        </div>

        {/* Accept button */}
        <button
          onClick={handleAccept}
          disabled={!canAccept}
          style={{
            width: '100%',
            padding: 13,
            borderRadius: 8,
            border: 'none',
            background: canAccept ? '#2563eb' : '#1f2937',
            color: canAccept ? '#fff' : '#4b5563',
            fontWeight: 700,
            fontSize: 14,
            cursor: canAccept ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
            ...pressableStyle
          }}
          {...(canAccept ? pressableHandlers : {})}
        >
          동의하고 시작하기
        </button>

        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#4b5563' }}>
          © {new Date().getFullYear()} QA Bulls. All rights reserved.
        </div>
      </div>
    </div>
  );
};
