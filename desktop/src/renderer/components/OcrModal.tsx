import React from 'react';
import { pressableStyle, pressableHandlers } from '../utils/styles';
import { copyToClipboard } from '../utils/locatorHelpers';

interface OcrModalProps {
  error?: string;
  rawText?: string;
  source?: string;
  onClose: () => void;
}

export const OcrModal: React.FC<OcrModalProps> = ({ error, rawText, source, onClose }) => {
  const extractPlainText = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
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
        zIndex: 1160
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0b1221',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 16,
          width: 600,
          maxWidth: '90%',
          color: '#e5e7eb',
          boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {error ? '❌ OCR 오류' : '✅ Gemini OCR 결과'}
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

        {error ? (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.15)',
              color: '#f87171',
              border: '1px solid #ef4444'
            }}
          >
            {error}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: '#9ca3af' }}>
              Source: {source || 'unknown'}
            </div>
            <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
              WebView 전용 독립 기능입니다. 기존 트리/컨텐츠 로직의 영향을 주지 않습니다.
            </div>
            <style>{`
              .ocr-modal-content p {
                margin: 8px 0;
                color: #e5e7eb;
              }
              .ocr-modal-content table {
                width: 100%;
                border-collapse: collapse;
                margin: 12px 0;
                color: #e5e7eb;
              }
              .ocr-modal-content th,
              .ocr-modal-content td {
                border: 1px solid #374151;
                padding: 8px;
                text-align: left;
              }
              .ocr-modal-content th {
                background: #1f2937;
                font-weight: 700;
              }
              .ocr-modal-content td {
                background: #111827;
              }
            `}</style>
            <div
              className="ocr-modal-content"
              style={{
                padding: 12,
                borderRadius: 8,
                background: '#0e1726',
                border: '1px solid #1f2937',
                maxHeight: 400,
                overflowY: 'auto',
                fontSize: 14,
                lineHeight: 1.6,
                userSelect: 'text'
              }}
              dangerouslySetInnerHTML={{ __html: rawText || '(결과 없음)' }}
            />
            {rawText && (
              <button
                onClick={() => copyToClipboard(extractPlainText(rawText))}
                style={{
                  marginTop: 8,
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                Copy
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
