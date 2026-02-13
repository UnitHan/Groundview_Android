import { useEffect } from 'react';
import { useAppStore } from '../store';

export const useStartup = () => {
  const { setPreferredLang, setPlatform, setAppiumVersion, saveGemini } = useAppStore();
  useEffect(() => {
    (async () => {
      try {
        if (window.groundview?.settings) {
          const res = await window.groundview.settings.load();
          const data = res.data || {};
          if (data.preferredLang) setPreferredLang(data.preferredLang);
          if (data.platform) setPlatform(data.platform);
          if (data.appiumVersion) setAppiumVersion(data.appiumVersion);
          if (data.geminiApiKey || data.geminiModel) {
            saveGemini(data.geminiApiKey, data.geminiModel);
          }
        } else if (typeof localStorage !== 'undefined') {
          const savedLang = localStorage.getItem('preferredLang') as 'python' | 'java' | null;
          if (savedLang) setPreferredLang(savedLang);
          const savedPlatform = localStorage.getItem('platform') as 'android' | 'ios' | null;
          if (savedPlatform) setPlatform(savedPlatform);
          const savedVersion = localStorage.getItem('appiumVersion') as '1' | '2' | '3' | null;
          if (savedVersion) setAppiumVersion(savedVersion);
        }
      } catch {
        // ignore startup errors
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
