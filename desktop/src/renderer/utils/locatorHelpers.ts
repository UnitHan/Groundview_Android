export const buildEasyLocator = (node: any, platform: 'android' | 'ios') => {
  try {
    const safeNode = node || {};
    if (platform === 'ios') {
      const pred = safeNode.text
        ? `label == "${safeNode.text}"`
        : safeNode.contentDesc
        ? `name == "${safeNode.contentDesc}"`
        : 'label CONTAINS "__"';
      const python = `el = driver.find_element(\n    by=AppiumBy.IOS_PREDICATE,\n    value='${pred}'\n)\nel.click()`;
      const java = `var el = driver.findElement(\n    AppiumBy.iOSNsPredicateString("${pred.replace(/"/g, '\\"')}")\n);\nel.click();`;
      return { python, java, note: 'iOS predicate 기반', label: pred };
    }
    let selector = '';
    let note = '';
    if (safeNode.resourceId) {
      selector = `new UiSelector().resourceId("${safeNode.resourceId}")`;
      note = 'resource-id 기반';
    } else if (safeNode.contentDesc) {
      selector = `new UiSelector().description("${safeNode.contentDesc}")`;
      note = 'content-desc 기반';
    } else if (safeNode.text) {
      selector = `new UiSelector().textContains("${safeNode.text}")`;
      note = '텍스트 기반';
    } else {
      const inst = typeof safeNode.index === 'number' ? safeNode.index : 0;
      selector = `new UiSelector().className("${safeNode.cls || 'android.view.View'}").instance(${inst})`;
      note = 'class + instance';
    }
    const python = `el = driver.find_element(\n    by=AppiumBy.ANDROID_UIAUTOMATOR,\n    value='${selector}'\n)\nel.click()`;
    const java = `var el = driver.findElement(\n    AppiumBy.androidUIAutomator("${selector.replace(/"/g, '\\"')}")\n);\nel.click();`;
    return { python, java, note, label: selector };
  } catch (e) {
    return { python: '# error', java: '// error', note: 'fallback', label: 'error' };
  }
};

export const copyToClipboard = async (txt: string) => {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    /* ignore */
  }
};

export const formatParagraphs = (text?: string): string[] => {
  if (!text) return [];
  // 줄바꿈 우선, 없으면 마침표 기준으로 짧은 문단으로 분리
  const byNewline = text.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const base = byNewline.length > 0 ? byNewline : text.split(/(?<=\.)\s+/).map((t) => t.trim()).filter(Boolean);
  return base.slice(0, 3); // 너무 길면 3개 문단까지만 표시
};

export const parseBounds = (b?: string) => {
  if (!b) return null;
  const m = b.match(/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/);
  if (!m) return null;
  return { x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) };
};
