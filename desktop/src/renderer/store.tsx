import React, { createContext, useContext, useReducer } from 'react';
import { CaptureResult, DeviceInfo, HealthStatus, Platform } from '../../../core/src/types';
import { generateLocators, LocatorSuggestion } from '../../../core/src/locator';

type SettingsPayload = {
  adbPath?: string;
  platform?: Platform;
  preferredLang?: 'python' | 'java';
  appiumVersion?: '1' | '2' | '3';
  geminiApiKey?: string;
  geminiModel?: string;
};

type State = {
  platform: Platform;
  devices: DeviceInfo[];
  selectedDevice?: DeviceInfo;
  statusMessage?: string;
  lastCapture?: CaptureResult;
  health?: HealthStatus;
  adbPath?: string;
  lastXml?: string;
  xmlSummary?: XmlSummary;
  tree?: UiNode[];
  locators?: LocatorSuggestion[];
  preferredLang?: 'python' | 'java';
  logs: string[];
  appiumVersion?: '1' | '2' | '3';
  selectedNodeId?: string;
  selectedBounds?: string;
  uiPhase: 'welcome' | 'devices' | 'analyze';
  metaDeviceId?: string;
  metaScreenSize?: string;
  metaTimestamp?: string;
  elementCount?: number;
  capturing?: boolean;
  saving?: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
};

type XmlNodeSample = {
  cls?: string;
  text?: string;
  id?: string;
  desc?: string;
  bounds?: string;
  packageName?: string;
  index?: number;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  checkable?: boolean;
  checked?: boolean;
  selected?: boolean;
  scrollable?: boolean;
  longClickable?: boolean;
  parentResourceId?: string;
  parentClass?: string;
  isListItem?: boolean;
};

type XmlSummary = {
  count: number;
  samples: XmlNodeSample[];
};

type Action =
  | { type: 'setPlatform'; platform: Platform }
  | { type: 'setDevices'; devices: DeviceInfo[] }
  | { type: 'selectDevice'; id: string }
  | { type: 'status'; message?: string }
  | { type: 'capture'; result?: CaptureResult }
  | { type: 'health'; health: HealthStatus }
  | { type: 'adbPath'; path?: string }
  | { type: 'xml'; xml?: string }
  | { type: 'xmlSummary'; summary?: XmlSummary }
  | { type: 'tree'; tree?: UiNode[] }
  | { type: 'locators'; locators?: LocatorSuggestion[] }
  | { type: 'lang'; lang: 'python' | 'java' }
  | { type: 'log'; message: string }
  | { type: 'version'; version: '1' | '2' | '3' }
  | { type: 'selectNode'; id?: string; bounds?: string }
  | { type: 'phase'; phase: State['uiPhase'] }
  | { type: 'capturing'; value: boolean }
  | { type: 'saving'; value: boolean }
  | { type: 'gemini'; key?: string; model?: string }
  | {
      type: 'meta';
      payload: {
        deviceId?: string;
        screenSize?: string;
        timestamp?: string;
        elementCount?: number;
      };
    };

const initialState: State = {
  platform: 'android',
  devices: [],
  logs: [],
  appiumVersion: '2',
  uiPhase: 'welcome',
  geminiApiKey: undefined,
  geminiModel: undefined
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setPlatform':
      return { ...state, platform: action.platform, selectedDevice: undefined, devices: [] };
    case 'setDevices':
      return { ...state, devices: action.devices, selectedDevice: undefined };
    case 'selectDevice': {
      const device = state.devices.find((d) => d.id === action.id);
      return { ...state, selectedDevice: device };
    }
    case 'status':
      return { ...state, statusMessage: action.message };
    case 'capture':
      return { ...state, lastCapture: action.result };
    case 'health':
      return { ...state, health: action.health };
    case 'adbPath':
      return { ...state, adbPath: action.path };
    case 'xml':
      return { ...state, lastXml: action.xml };
    case 'xmlSummary':
      return { ...state, xmlSummary: action.summary };
    case 'tree':
      return { ...state, tree: action.tree };
    case 'locators':
      return { ...state, locators: action.locators };
    case 'lang':
      return { ...state, preferredLang: action.lang };
    case 'version':
      return { ...state, appiumVersion: action.version };
    case 'log':
      return { ...state, logs: [...state.logs.slice(-49), action.message] };
    case 'selectNode':
      return { ...state, selectedNodeId: action.id, selectedBounds: action.bounds };
    case 'phase':
      return { ...state, uiPhase: action.phase };
    case 'capturing':
      return { ...state, capturing: action.value };
    case 'saving':
      return { ...state, saving: action.value };
    case 'gemini':
      return { ...state, geminiApiKey: action.key, geminiModel: action.model };
    case 'meta':
      return {
        ...state,
        metaDeviceId: action.payload.deviceId,
        metaScreenSize: action.payload.screenSize,
        metaTimestamp: action.payload.timestamp,
        elementCount: action.payload.elementCount
      };
    default:
      return state;
  }
}

type Ctx = {
  state: State;
  loadDevices: () => Promise<void>;
  selectDevice: (id: string) => void;
  setPlatform: (p: Platform) => void;
  capture: () => Promise<void>;
  exportZip: () => Promise<void>;
  checkHealth: () => Promise<void>;
  setAdbPath: (p: string) => Promise<void>;
  loadXml: (path: string, shotPath?: string) => Promise<void>;
  buildTreeFromXml: (xml: string, shotPath?: string) => void;
  loadDump: () => Promise<void>;
  setPreferredLang: (lang: 'python' | 'java') => void;
  log: (msg: string) => void;
  setAppiumVersion: (v: '1' | '2' | '3') => void;
  persistSettings: (partial?: Partial<SettingsPayload>) => Promise<void>;
  scanAdb: () => Promise<string[]>;
  selectNode: (id?: string, bounds?: string) => void;
  setPhase: (p: State['uiPhase']) => void;
  saveGemini: (key?: string, model?: string) => Promise<void>;
};

const StoreContext = createContext<Ctx | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const pickService = () => {
    if (!window.groundview) throw new Error('Bridge unavailable');
    return state.platform === 'android' ? window.groundview.adb : window.groundview.ios;
  };

  const setPhase = (p: State['uiPhase']) => dispatch({ type: 'phase', phase: p });

  const selectNode = (id?: string, bounds?: string) => {
    dispatch({ type: 'selectNode', id, bounds });
    if (!id || !state.tree) return;
    const flat: UiNode[] = [];
    const walk = (n: UiNode) => {
      flat.push(n);
      n.children?.forEach(walk);
    };
    state.tree.forEach(walk);
    const node = flat.find((n) => n.id === id);
    if (!node) return;
    const sample = {
      cls: node.cls,
      text: node.text,
      id: node.resourceId,
      desc: node.contentDesc,
      packageName: node.packageName,
      index: node.index,
      bounds: node.bounds,
      clickable: node.clickable,
      enabled: node.enabled,
      focusable: node.focusable,
      checkable: node.checkable,
      checked: node.checked,
      selected: node.selected,
      scrollable: node.scrollable,
      longClickable: node.longClickable,
      parentResourceId: node.parentResourceId,
      parentClass: node.parentClass,
      isListItem: node.isListItem,
      uniqueText: node.uniqueText,
      uniqueDesc: node.uniqueDesc
    };
    const locs = generateLocators([sample], state.platform);
    dispatch({ type: 'locators', locators: locs });
  };

  const persistSettings = async (partial?: Partial<SettingsPayload>) => {
    if (!window.groundview?.settings) return;
    try {
      const payload: SettingsPayload = {
        adbPath: partial?.adbPath ?? state.adbPath,
        platform: partial?.platform ?? state.platform,
        preferredLang: partial?.preferredLang ?? state.preferredLang,
        appiumVersion: partial?.appiumVersion ?? state.appiumVersion,
        // geminiApiKey: DO NOT save here - managed by backend encryption
        geminiModel: partial?.geminiModel ?? state.geminiModel
      };
      await window.groundview.settings.save(payload);
    } catch (e) {
      dispatch({ type: 'log', message: `[warn] settings save failed: ${String(e)}` });
    }
  };

  const loadDevices = React.useCallback(async () => {
    dispatch({ type: 'status', message: 'Loading devices...' });
    dispatch({ type: 'log', message: '[info] Loading devices' });
    const svc = pickService();
    const devices = (await svc.listDevices()) as DeviceInfo[];
    dispatch({ type: 'setDevices', devices });
    dispatch({ type: 'status', message: `Found ${devices.length} device(s)` });
    dispatch({ type: 'log', message: `[info] Found ${devices.length} device(s)` });
    if (devices.length > 0) {
      dispatch({ type: 'phase', phase: 'devices' });
    }
  }, [state.platform]);

  const selectDevice = (id: string) => {
    dispatch({ type: 'selectDevice', id });
    dispatch({ type: 'phase', phase: 'devices' });
  };
const setPlatform = (p: Platform) => {
  dispatch({ type: 'setPlatform', platform: p });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('platform', p);
  }
  persistSettings({ platform: p });
};
  const setPreferredLang = (lang: 'python' | 'java') => {
    dispatch({ type: 'lang', lang });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('preferredLang', lang);
    }
    persistSettings({ preferredLang: lang });
  };
  const setAppiumVersion = (v: '1' | '2' | '3') => {
    dispatch({ type: 'version', version: v });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('appiumVersion', v);
    }
    persistSettings({ appiumVersion: v });
  };

  const saveGemini = async (key?: string, model?: string) => {
    dispatch({ type: 'gemini', key, model });
    // Only save model to local settings, API key is managed by backend
    if (model) {
      await persistSettings({ geminiModel: model });
    }
  };

  const capture = async () => {
    if (!state.selectedDevice) {
      dispatch({ type: 'status', message: 'Select a device first' });
      dispatch({ type: 'log', message: '[warn] capture called without device' });
      return;
    }
    dispatch({ type: 'capturing', value: true });
    if (state.uiPhase !== 'analyze') {
      dispatch({ type: 'phase', phase: 'devices' });
    }
    const svc = pickService();
    dispatch({ type: 'status', message: 'Capturing screen...' });
    dispatch({ type: 'log', message: `[info] Capturing from ${state.selectedDevice.id}` });
    const res = (await svc.capture(state.selectedDevice.id)) as CaptureResult;
    if (res.error) {
      dispatch({ type: 'status', message: `Capture failed: ${res.error}` });
      dispatch({ type: 'log', message: `[error] Capture failed: ${res.error}` });
      if (window.groundview?.log) {
        await window.groundview.log.write(`[capture-error] ${res.error}`);
      }
      dispatch({ type: 'capture', result: res });
      dispatch({ type: 'phase', phase: 'devices' });
    } else {
      const compSize = res.xmlStats?.compressedBytes;
      const uncompSize = res.xmlStats?.uncompressedBytes;
      const sizeInfo =
        compSize || uncompSize
          ? ` (compressed: ${compSize ?? 0}B, uncompressed: ${uncompSize ?? 0}B, picked: ${res.xmlVariant || 'n/a'})`
          : '';
      const effectiveXml = res.xmlPath || res.xmlPathUncompressed || res.xmlPathCompressed;
      dispatch({
        type: 'status',
        message: `Captured -> screenshot: ${res.screenshotPath}, xml: ${effectiveXml || 'n/a'}${sizeInfo}`
      });
      dispatch({ type: 'capture', result: res });
      dispatch({
        type: 'log',
        message: `[info] Captured screenshot=${res.screenshotPath} xml=${effectiveXml || 'n/a'}${sizeInfo}`
      });
      if (window.groundview?.log) {
        await window.groundview.log.write(
          `[capture-ok] screenshot=${res.screenshotPath} xml=${effectiveXml || 'n/a'}`
        );
      }
      if (effectiveXml) {
        await loadXml(effectiveXml, res.screenshotPath);
      }
      dispatch({ type: 'phase', phase: 'analyze' });
    }
    dispatch({ type: 'capturing', value: false });
  };

  const checkHealth = async () => {
    const svc = pickService();
    const res = (await svc.health()) as HealthStatus;
    dispatch({ type: 'health', health: res });
    dispatch({ type: 'status', message: res.ok ? 'Bridge OK' : `Bridge error: ${res.details}` });
    dispatch({
      type: 'log',
      message: `[info] Health: ${res.ok ? 'ok' : 'error'} ${res.details || ''}`
    });
  };

  const setAdbPath = async (p: string) => {
    if (!window.groundview?.adb) throw new Error('Bridge unavailable');
    await window.groundview.adb.setPath(p);
    dispatch({ type: 'adbPath', path: p });
    dispatch({ type: 'status', message: `ADB path set: ${p}` });
    dispatch({ type: 'log', message: `[info] ADB path set: ${p}` });
    dispatch({ type: 'phase', phase: 'devices' });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('adbPath', p);
    }
    persistSettings({ adbPath: p });
    // 바로 버전 정보를 가져와 표시
    await checkHealth();
  };

  const loadXml = async (p: string, shotPath?: string) => {
    if (!window.groundview?.fs) return;
    const res = await window.groundview.fs.readText(p);
    if (res.ok && res.data) {
      dispatch({ type: 'xml', xml: res.data });
      dispatch({ type: 'xmlSummary', summary: summarizeXml(res.data) });
      const tree = prepareTree(buildTree(res.data)).map((n) => ({
        ...n,
        screenshotPath: shotPath || state.lastCapture?.screenshotPath
      }));
      dispatch({ type: 'tree', tree });
      dispatch({
        type: 'locators',
        locators: generateLocators(summarizeXml(res.data).samples, state.platform)
      });
      dispatch({ type: 'log', message: `[info] XML loaded (${res.data.length} chars)` });
    } else {
      dispatch({ type: 'status', message: `XML read failed: ${res.error}` });
      dispatch({ type: 'log', message: `[error] XML read failed: ${res.error}` });
    }
  };

  const buildTreeFromXml = (xml: string, shotPath?: string) => {
    const tree = prepareTree(buildTree(xml)).map((n) => ({
      ...n,
      screenshotPath: shotPath || state.lastCapture?.screenshotPath
    }));
    dispatch({ type: 'tree', tree });
    dispatch({ type: 'xmlSummary', summary: summarizeXml(xml) });
    dispatch({ type: 'locators', locators: generateLocators(summarizeXml(xml).samples, state.platform) });
  };

  const scanAdb = async () => {
    try {
      if (!window.groundview?.adb?.scan) {
        dispatch({ type: 'status', message: 'ADB scan not available' });
        return [];
      }
      const paths = await window.groundview.adb.scan();
      if (paths.length > 0) {
        dispatch({ type: 'status', message: `Found ${paths.length} ADB candidate(s)` });
      } else {
        dispatch({ type: 'status', message: 'No ADB found. Download platform-tools.' });
      }
      return paths;
    } catch (e) {
      dispatch({ type: 'status', message: `ADB scan failed: ${String(e)}` });
      return [];
    }
  };

  const loadDump = async () => {
    if (state.saving || state.capturing) return;
    if (!window.groundview?.dump?.pick) return;
    dispatch({ type: 'saving', value: true }); // reuse flag to block reentry
    const res = await window.groundview.dump.pick();
    dispatch({ type: 'saving', value: false });
    if (!res.ok || !res.data) {
      dispatch({ type: 'status', message: res?.error || '덤프 불러오기 실패' });
      return;
    }
    const { metadata, xml, screenshotPath, xmlPath } = res.data;
    dispatch({ type: 'selectNode', id: undefined, bounds: undefined });
    if (metadata?.deviceId) dispatch({ type: 'status', message: `Loaded dump from ${metadata.deviceId}` });
    dispatch({
      type: 'meta',
      payload: {
        deviceId: metadata?.deviceId,
        screenSize: metadata?.screenSize,
        timestamp: metadata?.timestamp || metadata?.captureTimestamp,
        elementCount: metadata?.elementCount
      }
    });
    dispatch({
      type: 'capture',
      result: {
        screenshotPath,
        xmlPath
      } as CaptureResult
    });
    dispatch({ type: 'xml', xml });
    dispatch({ type: 'xmlSummary', summary: summarizeXml(xml || '') });
    const tree = prepareTree(buildTree(xml || '')).map((n) => ({
      ...n,
      screenshotPath: screenshotPath || state.lastCapture?.screenshotPath
    }));
    dispatch({ type: 'tree', tree });
    const locs = generateLocators(summarizeXml(xml || '').samples, state.platform);
    dispatch({ type: 'locators', locators: locs });
    dispatch({ type: 'phase', phase: 'analyze' });
    dispatch({
      type: 'status',
      message: `Loaded dump (${metadata?.elementCount || tree.length} nodes)`
    });
    dispatch({
      type: 'log',
      message: `[info] dump loaded from ${metadata?.deviceId || 'unknown'}`
    });
  };

  const exportZip = async () => {
    if (!window.groundview?.dump?.export) {
      dispatch({ type: 'status', message: 'ZIP export not available' });
      return;
    }
    if (!state.lastCapture?.xmlPath || !state.lastCapture?.screenshotPath) {
      dispatch({ type: 'status', message: 'Capture first to export ZIP' });
      return;
    }
    dispatch({ type: 'saving', value: true });
    const meta = {
      deviceId: state.selectedDevice?.id,
      timestamp: new Date().toISOString(),
      screenSize: state.metaScreenSize,
      elementCount: state.xmlSummary?.count,
      captureTimestamp: new Date().toISOString()
    };
    const res = await window.groundview.dump.export({
      xmlPath: state.lastCapture.xmlPath,
      screenshotPath: state.lastCapture.screenshotPath,
      metadata: meta,
      deviceId: state.selectedDevice?.id
    });
    if (res.ok) {
      dispatch({ type: 'status', message: `ZIP saved: ${res.path}` });
      dispatch({ type: 'log', message: `[info] zip saved at ${res.path}` });
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`ZIP file saved successfully!\nFile: ${res.path}`);
      }
    } else {
      dispatch({ type: 'status', message: `ZIP export failed: ${res.error}` });
      dispatch({ type: 'log', message: `[error] zip export failed: ${res.error}` });
    }
    dispatch({ type: 'saving', value: false });
  };
  return (
    <StoreContext.Provider
      value={{
        state,
        loadDevices,
        selectDevice,
        setPlatform,
        capture,
        checkHealth,
        setAdbPath,
        loadXml,
        buildTreeFromXml,
        setPreferredLang,
        log: (msg: string) => dispatch({ type: 'log', message: msg }),
        setAppiumVersion,
        persistSettings,
        scanAdb,
        exportZip,
        loadDump,
        selectNode,
        setPhase,
        saveGemini
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useAppStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
};

function summarizeXml(xml: string): XmlSummary {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const samples: XmlNodeSample[] = [];
    let count = 0;
    const toBool = (v: string | null) => v === 'true';
    const listLike = (el?: Element | null) => {
      if (!el) return false;
      const cls = el.getAttribute('class') || '';
      const rid = el.getAttribute('resource-id') || '';
      return /RecyclerView|ListView|ScrollView|Collection/i.test(cls) || /list|recycler/i.test(rid);
    };
    const isCandidate = (el: Element) => {
      const cls = el.getAttribute('class');
      const rid = el.getAttribute('resource-id');
      const desc = el.getAttribute('content-desc');
      const text = el.getAttribute('text');
      return !!(cls || rid || desc || text);
    };
    const walk = (el: Element, parent?: Element) => {
      if (isCandidate(el)) {
        count += 1;
        if (samples.length < 400) {
          samples.push({
            cls: el.getAttribute('class') || undefined,
            text: el.getAttribute('text') || undefined,
            id: el.getAttribute('resource-id') || undefined,
            desc: el.getAttribute('content-desc') || undefined,
            bounds: el.getAttribute('bounds') || undefined,
            packageName: el.getAttribute('package') || undefined,
            index: el.getAttribute('index') ? Number(el.getAttribute('index')) : undefined,
            clickable: toBool(el.getAttribute('clickable')),
            enabled: toBool(el.getAttribute('enabled')),
            focusable: toBool(el.getAttribute('focusable')),
            checkable: toBool(el.getAttribute('checkable')),
            checked: toBool(el.getAttribute('checked')),
            selected: toBool(el.getAttribute('selected')),
            scrollable: toBool(el.getAttribute('scrollable')),
            longClickable: toBool(el.getAttribute('long-clickable')),
            parentResourceId: parent?.getAttribute('resource-id') || undefined,
            parentClass: parent?.getAttribute('class') || undefined,
            isListItem: listLike(parent)
          });
        }
      }
      Array.from(el.children).forEach((c) => walk(c as Element, el));
    };
    walk(doc.documentElement);
    return { count, samples };
  } catch (e) {
    // Fallback to regex if DOMParser fails
    const nodeRegex = /<([a-zA-Z0-9_.:-]+)([^>]*)>/g;
    const nodes: XmlNodeSample[] = [];
    let count = 0;
    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(xml)) !== null) {
      const snippet = match[0];
      const cls = attr(snippet, 'class');
      const text = attr(snippet, 'text');
      const id = attr(snippet, 'resource-id');
      const desc = attr(snippet, 'content-desc');
      const bounds = attr(snippet, 'bounds');
      if (cls || id || desc || text) {
        count += 1;
        if (nodes.length < 400) {
          nodes.push({ cls, text, id, desc, bounds });
        }
      }
    }
    return { count, samples: nodes };
  }
}

function attr(snippet: string, name: string): string | undefined {
  const m = snippet.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

export type UiNode = {
  id: string;
  cls?: string;
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  packageName?: string;
  index?: number;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  checked?: boolean;
  checkable?: boolean;
  selected?: boolean;
  scrollable?: boolean;
  longClickable?: boolean;
  bounds?: string;
  children: UiNode[];
  parentResourceId?: string;
  parentClass?: string;
  isListItem?: boolean;
  uniqueText?: boolean;
  uniqueDesc?: boolean;
  screenshotPath?: string;
};

function buildTree(xml: string): UiNode[] {
  const toBounds = (b?: string) => {
    if (!b) return null;
    const m = b.match(/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/);
    if (!m) return null;
    return {
      x1: Number(m[1]),
      y1: Number(m[2]),
      x2: Number(m[3]),
      y2: Number(m[4])
    };
  };
  const isMeaningful = (n: UiNode) =>
    !!(
      n.resourceId ||
      n.contentDesc ||
      n.text ||
      n.clickable ||
      n.focusable ||
      n.checkable ||
      n.scrollable ||
      n.longClickable
    );

  const trimMeaninglessRoot = (nodes: UiNode[]): UiNode[] => {
    let current = nodes;
    const sameBounds = (parent: UiNode, children: UiNode[]) =>
      parent.bounds && children.length > 0 && children.every((c) => c.bounds === parent.bounds);
    while (
      current.length === 1 &&
      !isMeaningful(current[0]) &&
      current[0].children &&
      current[0].children.length > 0 &&
      sameBounds(current[0], current[0].children)
    ) {
      current = current[0].children;
    }
    return current;
  };

  const compressChains = (nodes: UiNode[]): UiNode[] => {
    const isMeaningful = (n: UiNode) =>
      !!(
        n.resourceId ||
        n.contentDesc ||
        n.text ||
        n.clickable ||
        n.focusable ||
        n.checkable ||
        n.scrollable ||
        n.longClickable
      );
    const sameBounds = (a?: string, b?: string) => !!a && !!b && a === b;
    const mergeFlags = (parent: UiNode, child: UiNode) => {
      parent.resourceId = parent.resourceId || child.resourceId;
      parent.contentDesc = parent.contentDesc || child.contentDesc;
      parent.text = parent.text || child.text;
      parent.clickable = parent.clickable || child.clickable;
      parent.enabled = parent.enabled || child.enabled;
      parent.focusable = parent.focusable || child.focusable;
      parent.checkable = parent.checkable || child.checkable;
      parent.checked = parent.checked || child.checked;
      parent.scrollable = parent.scrollable || child.scrollable;
      parent.longClickable = parent.longClickable || child.longClickable;
      parent.bounds = parent.bounds || child.bounds;
      parent.packageName = parent.packageName || child.packageName;
    };
    const compressNode = (n: UiNode): UiNode => {
      n.children = (n.children || []).map(compressNode);
      while (
        n.children &&
        n.children.length === 1 &&
        !isMeaningful(n) &&
        sameBounds(n.bounds, n.children[0].bounds)
      ) {
        const child = n.children[0];
        n.cls = n.cls && child.cls ? `${n.cls} > ${child.cls}` : n.cls || child.cls;
        mergeFlags(n, child);
        n.children = child.children || [];
      }
      return n;
    };
    return nodes.map(compressNode);
  };

  const filterMeaninglessLarge = (nodes: UiNode[], screenArea: number): UiNode[] => {
    if (!screenArea) return nodes;
    const dropAndFlatten = (arr: UiNode[]): UiNode[] => {
      const out: UiNode[] = [];
      arr.forEach((n) => {
        const b = toBounds(n.bounds);
        const area = b ? (b.x2 - b.x1) * (b.y2 - b.y1) : 0;
        const ratio = screenArea > 0 ? area / screenArea : 0;
        const children = dropAndFlatten(n.children || []);
        const meaningful = isMeaningful(n);
        if (!meaningful && ratio > 0.9 && children.length) {
          out.push(...children);
        } else {
          out.push({ ...n, children });
        }
      });
      return out;
    };
    return dropAndFlatten(nodes);
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const nodes: UiNode[] = [];
    const root = doc.documentElement;
    const toBool = (v: string | null) => v === 'true';
    const isListLike = (el?: Element | null) => {
      if (!el) return false;
      const cls = (el.getAttribute('class') || '').toLowerCase();
      const rid = (el.getAttribute('resource-id') || '').toLowerCase();
      return /recyclerview|listview|scrollview|collection|recycler/.test(cls + ' ' + rid);
    };
    const walk = (el: Element, idx: number, parent?: Element): UiNode => {
      const id = `${el.getAttribute('resource-id') || ''}-${idx}-${Math.random()
        .toString(16)
        .slice(2, 6)}`;
      const xmlIndex = el.getAttribute('index');
      const node: UiNode = {
        id,
        cls: el.getAttribute('class') || undefined,
        text: el.getAttribute('text') || undefined,
        resourceId: el.getAttribute('resource-id') || undefined,
        contentDesc: el.getAttribute('content-desc') || undefined,
        packageName: el.getAttribute('package') || undefined,
        index: xmlIndex !== null ? Number(xmlIndex) : idx,
        clickable: toBool(el.getAttribute('clickable')),
        enabled: toBool(el.getAttribute('enabled')),
        focusable: toBool(el.getAttribute('focusable')),
        checked: toBool(el.getAttribute('checked')),
        checkable: toBool(el.getAttribute('checkable')),
        selected: toBool(el.getAttribute('selected')),
        scrollable: toBool(el.getAttribute('scrollable')),
        longClickable: toBool(el.getAttribute('long-clickable')),
        bounds: el.getAttribute('bounds') || undefined,
        parentResourceId: parent?.getAttribute('resource-id') || undefined,
        parentClass: parent?.getAttribute('class') || undefined,
        isListItem: isListLike(parent),
        children: []
      };
      const childEls = Array.from(el.children).slice(0, 200);
      node.children = childEls.map((c, i) => walk(c, i, el));
      return node;
    };
    const rootChildren = Array.from(root.children).slice(0, 100);
    rootChildren.forEach((c, i) => nodes.push(walk(c, i, root)));
    const compressed = compressChains(nodes);
    // Keep all nodes for rendering/overlay; filtering of meaningless large containers is handled in the Tree view only
    // to avoid dropping legitimate children.
    return trimMeaninglessRoot(compressed);
  } catch (e) {
    console.error('Failed to parse XML', e);
    return [];
  }
}

function prepareTree(nodes: UiNode[]): UiNode[] {
  const trim = (v?: string | null) => (v ? v.trim() : undefined);
  const visit = (n: UiNode): UiNode => {
    const cls = trim(n.cls) || trim(n.resourceId) || trim(n.text) || '(node)';
    const text = trim(n.text);
    const rid = trim(n.resourceId);
    const desc = trim(n.contentDesc);
    const bounds = trim(n.bounds);
    return {
      ...n,
      cls,
      text,
      resourceId: rid,
      contentDesc: desc,
      bounds,
      parentResourceId: n.parentResourceId,
      parentClass: n.parentClass,
      children: (n.children || []).map(visit)
    };
  };
  const trimmed = nodes.map(visit);
  markUniqueness(trimmed);
  return trimmed;
}

function markUniqueness(nodes: UiNode[]) {
  const walk = (children: UiNode[]) => {
    const textCounts = new Map<string, number>();
    const descCounts = new Map<string, number>();
    children.forEach((c) => {
      if (c.text) textCounts.set(c.text, (textCounts.get(c.text) || 0) + 1);
      if (c.contentDesc) descCounts.set(c.contentDesc, (descCounts.get(c.contentDesc) || 0) + 1);
    });
    children.forEach((c) => {
      c.uniqueText = !!c.text && (textCounts.get(c.text) || 0) === 1;
      c.uniqueDesc = !!c.contentDesc && (descCounts.get(c.contentDesc) || 0) === 1;
      if (c.children && c.children.length) walk(c.children);
    });
  };
  walk(nodes);
  // Global uniqueness (for lists where siblings share same text)
  const globalText = new Map<string, number>();
  const globalDesc = new Map<string, number>();
  const collect = (arr: UiNode[]) => {
    arr.forEach((n) => {
      if (n.text) globalText.set(n.text, (globalText.get(n.text) || 0) + 1);
      if (n.contentDesc) globalDesc.set(n.contentDesc, (globalDesc.get(n.contentDesc) || 0) + 1);
      if (n.children?.length) collect(n.children);
    });
  };
  collect(nodes);
  const applyGlobal = (arr: UiNode[]) => {
    arr.forEach((n) => {
      if (n.text && (globalText.get(n.text) || 0) === 1) n.uniqueText = true;
      if (n.contentDesc && (globalDesc.get(n.contentDesc) || 0) === 1) n.uniqueDesc = true;
      if (n.children?.length) applyGlobal(n.children);
    });
  };
  applyGlobal(nodes);
}
