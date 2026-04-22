import React from 'react';
import { useAppStore } from './store';
import { DevicesPage } from './components/DevicesPage';
import { AnalyzePage } from './components/AnalyzePage';
import { InfoModal } from './components/InfoModal';
import { ConsentModal } from './components/ConsentModal';
import { CONSENT_KEY } from './utils/legalTexts';
import { selectionStyle } from './utils/styles';

// Main App Component
const App: React.FC = () => {
  const { state } = useAppStore();
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [consentDone, setConsentDone] = React.useState(() => {
    try {
      return !!localStorage.getItem(CONSENT_KEY);
    } catch {
      return false;
    }
  });
  const appVersion = '0.0.6';

  React.useEffect(() => {
    const off = window.groundview?.ui?.onInfo?.(() => setInfoOpen(true));
    return () => {
      if (off) off();
    };
  }, []);

  const bg = state.uiPhase === 'devices'
    ? '#f5f7fb'
    : 'radial-gradient(circle at 20% 20%, #1f2937, #0b1221)';
  const textColor = state.uiPhase === 'devices' ? '#0f172a' : '#e5e7eb';

  const content = state.uiPhase === 'analyze' && state.lastCapture?.screenshotPath && state.tree
    ? <AnalyzePage />
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
      {!consentDone && <ConsentModal onAccept={() => setConsentDone(true)} />}
      {content}
      {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} appVersion={appVersion} />}
    </div>
  );
};

export default App;
