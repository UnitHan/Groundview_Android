import React from 'react';
import { useAppStore } from '../store';
import { colors, pressableStyle, pressableHandlers } from '../utils/styles';

export const Welcome: React.FC = () => {
  const { setAdbPath, scanAdb, setPhase } = useAppStore();
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
      <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, marginTop: 8 }}>
        You need Android Debug Bridge (ADB) to use this application.
      </div>
      <a
        href="https://developer.android.com/tools/releases/platform-tools"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#2563eb',
          fontSize: 14,
          textDecoration: 'none',
          fontWeight: 600
        }}
      >
        Download here
      </a>
      {message && <div style={{ color: '#ef4444', fontSize: 13 }}>{message}</div>}
    </div>
  );
};
