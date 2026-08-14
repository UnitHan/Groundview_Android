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

    // Android: 초보자 친화적 로케이터 선택
    let selector = '';
    let note = '';
    let stability = 'medium';
    let badge = '⚠️  주의 필요';
    let caution = '';

    const isDynamicId = (id: string) => /[-_][0-9a-f]{4,}|temp|tmp/i.test(id || '');

    // 🖱️ 승격: 선택 노드가 클릭 불가인데(예: Compose 텍스트 라벨) 클릭 가능한 상위 요소가 있으면
    // 실제 탭 대상인 상위 요소로 로케이터를 만든다. 상위가 고유 식별자가 없으면
    // "이 텍스트를 자식으로 갖는 클릭 가능 요소"로 잡는다.
    const anc = safeNode.clickableAncestor;
    const selfClickable = safeNode.clickable === true;
    const childKey = safeNode.contentDesc
      ? `description("${safeNode.contentDesc}")`
      : safeNode.text
      ? `text("${safeNode.text}")`
      : null;
    const promote =
      !selfClickable &&
      anc &&
      (anc.contentDesc || (anc.resourceId && !isDynamicId(anc.resourceId)) || childKey);

    if (promote) {
      if (anc.contentDesc) {
        selector = `new UiSelector().description("${anc.contentDesc}")`;
        note = '🖱️ 클릭 가능한 상위 요소 (content-desc)';
        stability = 'high';
        badge = '✅ 초보자 추천';
        caution = '선택한 텍스트는 클릭 불가 라벨 → 클릭 가능한 상위 요소로 자동 대체';
      } else if (anc.resourceId && !isDynamicId(anc.resourceId)) {
        selector = `new UiSelector().resourceId("${anc.resourceId}")`;
        note = '🖱️ 클릭 가능한 상위 요소 (resource-id)';
        stability = 'high';
        badge = '✅ 초보자 추천';
        caution = '선택한 텍스트는 클릭 불가 라벨 → 클릭 가능한 상위 요소로 자동 대체';
      } else {
        // 상위 요소에 고유 식별자 없음 → 자식 텍스트/desc 기준으로 클릭 가능 조상 지정
        selector = `new UiSelector().clickable(true).childSelector(new UiSelector().${childKey})`;
        note = '🖱️ 클릭 가능한 상위 요소 (자식 텍스트 기준)';
        stability = 'medium';
        badge = '⚠️  주의 필요';
        caution = '선택 노드는 클릭 불가 라벨 — 이 텍스트를 포함한 클릭 가능 상위 요소를 탭';
      }
    } else if (safeNode.contentDesc) {
      // 🥇 최우선: content-desc
      selector = `new UiSelector().description("${safeNode.contentDesc}")`;
      note = '🥇 content-desc (가장 안정적)';
      stability = 'high';
      badge = '✅ 초보자 추천';
    } else if (safeNode.resourceId) {
      // 🥈 두 번째: resource-id
      const hasNumbers = /[-_][0-9a-f]{4,}|temp|tmp/i.test(safeNode.resourceId);
      if (hasNumbers) {
        selector = `new UiSelector().resourceId("${safeNode.resourceId}")`;
        note = '⚠️  resource-id (동적 생성 가능)';
        stability = 'medium';
        badge = '⚠️  주의 필요';
        caution = 'ID에 숫자/해시 포함, 빌드마다 변할 수 있음';
      } else {
        selector = `new UiSelector().resourceId("${safeNode.resourceId}")`;
        note = '🥈 resource-id (안정적)';
        stability = 'high';
        badge = '✅ 초보자 추천';
      }
    } else if (safeNode.text) {
      // 🥉 세 번째: text
      const isDynamic = /[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]+건|[0-9]+개|\d+%/.test(safeNode.text);
      if (isDynamic) {
        selector = `new UiSelector().textContains("${safeNode.text.substring(0, 5)}")`;
        note = '⚠️  텍스트 일부 (동적 값 포함)';
        stability = 'medium';
        badge = '⚠️  주의 필요';
        caution = '텍스트에 날짜/숫자 포함, 값이 변하면 못 찾음';
      } else {
        selector = `new UiSelector().text("${safeNode.text}")`;
        note = '🥉 텍스트 (고정 문자열)';
        stability = 'medium';
        badge = '⚠️  주의 필요';
      }
    } else {
      // ❌ 최후: class + index
      const inst = typeof safeNode.index === 'number' ? safeNode.index : 0;
      selector = `new UiSelector().className("${safeNode.cls || 'android.view.View'}").instance(${inst})`;
      note = '❌ class + index (최후 수단)';
      stability = 'low';
      badge = '❌ 비추천';
      caution = '화면 순서 바뀌면 100% 깨짐. 개발팀에 content-desc 추가 요청 권장';
    }

    // Wait 유틸 함수 포함한 코드 생성
    const pythonWithUtil = `# Wait 유틸 함수
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def wait_element(driver, locator, timeout=10):
    """요소가 나타날 때까지 대기"""
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located(locator)
    )

# 로케이터: ${note}
locator = (AppiumBy.ANDROID_UIAUTOMATOR, '${selector}')
el = wait_element(driver, locator)
el.click()`;

    const javaWithUtil = `// 로케이터: ${note}
WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
WebElement el = wait.until(
    ExpectedConditions.presenceOfElementLocated(
        AppiumBy.androidUIAutomator("${selector.replace(/"/g, '\\"')}")
    )
);
el.click();`;

    return { 
      python: pythonWithUtil, 
      java: javaWithUtil, 
      note, 
      label: selector,
      stability,
      badge,
      caution
    };
  } catch (e) {
    return { 
      python: '# error', 
      java: '// error', 
      note: 'fallback', 
      label: 'error',
      stability: 'low',
      badge: '❌ 오류',
      caution: '로케이터 생성 실패'
    };
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
