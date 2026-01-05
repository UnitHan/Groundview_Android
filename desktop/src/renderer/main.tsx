import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './store';
import { useStartup } from './hooks/useStartup';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

const StartupWrapper: React.FC = () => {
  useStartup();
  return <App />;
};

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppProvider>
      <StartupWrapper />
    </AppProvider>
  </React.StrictMode>
);
