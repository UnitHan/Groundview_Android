import React from 'react';
import { useAppStore } from './store';
import { Welcome } from './components/Welcome';
import { DevicesPage } from './components/DevicesPage';
import { AnalyzePage } from './components/AnalyzePage';
import { InfoModal } from './components/InfoModal';
import { selectionStyle } from './utils/styles';

// Main App Component
const App: React.FC = () => {
  const { state } = useAppStore();
  const [infoOpen, setInfoOpen] = React.useState(false);
  const appVersion = '0.0.5';

  React.useEffect(() => {
    console.log('App state.uiPhase:', state.uiPhase);
  }, [state.uiPhase]);

  React.useEffect(() => {
    const off = window.groundview?.ui?.onInfo?.(() => setInfoOpen(true));
    return () => {
      if (off) off();
    };
  }, []);

  const bg = state.uiPhase === 'devices' ? '#f5f7fb' 
    : state.uiPhase === 'welcome' ? '#f7f9fb' 
    : 'radial-gradient(circle at 20% 20%, #1f2937, #0b1221)';
  const textColor = state.uiPhase === 'devices' || state.uiPhase === 'welcome' ? '#0f172a' : '#e5e7eb';

  const content = state.uiPhase === 'welcome' ? <Welcome /> 
    : state.uiPhase === 'devices' ? <DevicesPage />
    : state.uiPhase === 'analyze' && state.lastCapture?.screenshotPath && state.tree ? <AnalyzePage />
    : <Welcome />;

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
      {content}
      {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} appVersion={appVersion} />}
    </div>
  );
};

export default App;
