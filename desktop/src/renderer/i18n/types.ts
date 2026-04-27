export interface Translation {
  settings: {
    title: string;
    subtitle: string;
    close: string;
    lang: {
      title: string;
      ko: string;
      en: string;
    };
    adb: {
      desc: string;
      placeholder: string;
      scanning: string;
      autoDetect: string;
      save: string;
      detected: (path: string) => string;
      notFound: string;
      pathSaved: string;
      error: (msg: string) => string;
    };
    gemini: {
      title: string;
      apiKey: string;
      change: string;
      loading: string;
      placeholder: string;
      keySaved: string;
      editHint: string;
      model: string;
      saveBtn: string;
      noKey: string;
      saveFailed: (err: string) => string;
      backendStarting: string;
      saveSuccess: string;
      encryptNote: string;
      apiKeyNote: string;
    };
    footer: {
      terms: string;
      privacy: string;
    };
  };
  devices: {
    status: {
      red: string;
      yellow: string;
      green: string;
    };
    wireless: string;
    gvService: {
      permTitle: string;
      permDesc: string;
      permGuide: string;
      permRetry: string;
      enabled: string;
    };
  };
  analyze: {
    analyzing: string;
    ocrFailed: (err: string) => string;
  };
  env: {
    title: string;
    diagnosing: string;
    status: {
      red: string;
      yellow: string;
      green: string;
    };
    adb: {
      found: (path: string) => string;
      notFound: string;
      autoDownloadNote: string;
      downloadSuccess: string;
      downloading: string;
      downloadBtn: string;
      openPage: string;
    };
    devices: {
      title: string;
      notAvailable: string;
      connected: (n: number, ids: string) => string;
      unauthorized: (ids: string) => string;
      offline: (ids: string) => string;
      noDevice: string;
    };
    connectGuide: {
      title: string;
      steps: string[];
      unauthStep: string;
      unauthReplug: string;
    };
    devOptions: {
      title: string;
      desc: string;
      guideTitle: string;
      steps: string[];
    };
    studio: {
      title: string;
      installed: string;
      notInstalled: string;
      guideTitle: string;
      guideDesc: string;
      downloadBtn: string;
    };
    reDiagnose: string;
    close: string;
  };
  consent: {
    title: string;
    subtitle: string;
    infoTitle: string;
    infoItems: string[];
    termsPrefix: string;
    termsBtn: string;
    termsSuffix: string;
    privacyPrefix: string;
    privacyBtn: string;
    privacySuffix: string;
    acceptBtn: string;
    closeBtn: string;
    viewTermsTitle: string;
    viewPrivacyTitle: string;
  };
}
