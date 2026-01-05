export type LocatorSuggestion = {
  strategy: string;
  value: string;
  codePython: string;
  codeJava: string;
  score: number;
  tier: 'recommended' | 'alternative' | 'fallback';
  risks?: string[];
  notes?: string[];
};

export type LocatorNode = {
  cls?: string;
  text?: string;
  id?: string;
  desc?: string;
  packageName?: string;
  index?: number;
  bounds?: string;
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
  uniqueText?: boolean;
  uniqueDesc?: boolean;
};

type ScoreFeature = {
  usesId?: boolean;
  usesDesc?: boolean;
  usesTextExact?: boolean;
  usesTextContains?: boolean;
  dynamicText?: boolean;
  usesClass?: boolean;
  usesPackage?: boolean;
  usesBooleans?: boolean;
  usesParent?: boolean;
  usesListContext?: boolean;
  usesXPath?: boolean;
  usesIndex?: boolean;
  usesBounds?: boolean;
  uniqueText?: boolean;
  uniqueDesc?: boolean;
};

export function generateLocators(
  samples: LocatorNode[],
  platform: 'android' | 'ios'
): LocatorSuggestion[] {
  const out: LocatorSuggestion[] = [];
  for (const s of samples) {
    if (platform === 'android') {
      out.push(...androidLocators(s));
    } else {
      out.push(...iosLocators(s));
    }
  }
  const seen = new Set<string>();
  const unique = out.filter((o) => {
    const k = `${o.strategy}-${o.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.sort((a, b) => b.score - a.score).slice(0, 15);
}

function androidLocators(s: LocatorNode): LocatorSuggestion[] {
  const res: LocatorSuggestion[] = [];
  const clean = normalizeNode(s);
  const dynamicText = isDynamicText(clean.text);

  if (clean.id) {
    res.push(
      makeSuggestion({
        strategy: 'id',
        value: clean.id,
        features: { usesId: true, uniqueText: clean.uniqueText, uniqueDesc: clean.uniqueDesc },
        python: buildPython('id', clean.id),
        java: buildJava('id', clean.id),
        notes: ['resource-id']
      })
    );
  }

  if (clean.desc) {
    res.push(
      makeSuggestion({
        strategy: 'accessibility id',
        value: clean.desc,
        features: { usesDesc: true, uniqueDesc: clean.uniqueDesc, uniqueText: clean.uniqueText },
        python: buildPython('accessibility', clean.desc),
        java: buildJava('accessibility', clean.desc),
        notes: ['content-desc']
      })
    );
  }

  const uiSelectorBase = buildUiSelector(clean, { includeText: !dynamicText, includeDesc: true });
  if (uiSelectorBase.selector) {
    res.push(
      makeSuggestion({
        strategy: 'uiautomator',
        value: uiSelectorBase.selector,
        features: { ...uiSelectorBase.features, uniqueText: clean.uniqueText, uniqueDesc: clean.uniqueDesc },
        python: buildPython('uiautomator', uiSelectorBase.selector),
        java: buildJava('uiautomator', uiSelectorBase.selector),
        notes: uiSelectorBase.notes
      })
    );
  }

  // Text contains variant for dynamic text
  if (clean.text && dynamicText) {
    const containsSelector = buildUiSelector(clean, { includeText: false, textContains: clean.text });
    if (containsSelector.selector) {
      res.push(
        makeSuggestion({
          strategy: 'uiautomator',
          value: containsSelector.selector,
          features: { ...containsSelector.features, dynamicText: true, uniqueText: clean.uniqueText },
          python: buildPython('uiautomator', containsSelector.selector),
          java: buildJava('uiautomator', containsSelector.selector),
          notes: containsSelector.notes
        })
      );
    }
  }

  // Parent-aware selector
  const parentSelector = buildParentAwareSelector(clean, dynamicText);
  if (parentSelector.selector) {
    res.push(
      makeSuggestion({
        strategy: 'uiautomator-child',
        value: parentSelector.selector,
        features: { ...parentSelector.features, uniqueText: clean.uniqueText, uniqueDesc: clean.uniqueDesc },
        python: buildPython('uiautomator', parentSelector.selector),
        java: buildJava('uiautomator', parentSelector.selector),
        notes: parentSelector.notes
      })
    );
  }

  // XPath (graded)
  const xpathCandidates = buildXPath(clean, dynamicText);
  xpathCandidates.forEach((x) =>
    res.push(
      makeSuggestion({
        strategy: 'xpath',
        value: x.value,
        features: { ...x.features, uniqueText: clean.uniqueText, uniqueDesc: clean.uniqueDesc },
        python: buildPython('xpath', x.value),
        java: buildJava('xpath', x.value),
        notes: x.notes
      })
    )
  );

  // Bounds fallback
  if (clean.bounds) {
    res.push(
      makeSuggestion({
        strategy: 'bounds-fallback',
        value: clean.bounds,
        features: { usesBounds: true },
        python: `# fallback_bounds\n# bounds: ${clean.bounds}`,
        java: `// fallback_bounds\n// bounds: ${clean.bounds}`,
        notes: ['bounds-based (fragile)']
      })
    );
  }

  return res;
}

function iosLocators(s: LocatorNode): LocatorSuggestion[] {
  const res: LocatorSuggestion[] = [];
  const clean = normalizeNode(s);
  if (clean.id) {
    res.push(
      makeSuggestion({
        strategy: 'accessibility id',
        value: clean.id,
        features: { usesId: true, uniqueText: clean.uniqueText, uniqueDesc: clean.uniqueDesc },
        python: buildPython('accessibility', clean.id, 'ios'),
        java: buildJava('accessibility', clean.id, 'ios')
      })
    );
  }
  if (clean.desc) {
    res.push(
      makeSuggestion({
        strategy: 'accessibility id',
        value: clean.desc,
        features: { usesDesc: true, uniqueDesc: clean.uniqueDesc, uniqueText: clean.uniqueText },
        python: buildPython('accessibility', clean.desc, 'ios'),
        java: buildJava('accessibility', clean.desc, 'ios')
      })
    );
  }
  if (clean.text) {
    const pred = `label CONTAINS "${clean.text}" OR name CONTAINS "${clean.text}"`;
    res.push(
      makeSuggestion({
        strategy: 'predicate',
        value: pred,
        features: { usesTextContains: true },
        python: buildPython('predicate', pred, 'ios'),
        java: buildJava('predicate', pred, 'ios')
      })
    );
  }
  if (clean.cls) {
    const chain = `**/${clean.cls}`;
    res.push(
      makeSuggestion({
        strategy: 'class chain',
        value: chain,
        features: { usesClass: true },
        python: buildPython('class chain', chain, 'ios'),
        java: buildJava('class chain', chain, 'ios')
      })
    );
  }
  return res;
}

function normalizeNode(s: LocatorNode): LocatorNode {
  return {
    cls: s.cls?.trim(),
    text: s.text?.trim(),
    id: s.id?.trim(),
    desc: s.desc?.trim(),
    packageName: s.packageName?.trim(),
    index: typeof s.index === 'number' ? s.index : undefined,
    bounds: s.bounds?.trim(),
    clickable: s.clickable,
    enabled: s.enabled,
    focusable: s.focusable,
    checkable: s.checkable,
    checked: s.checked,
    selected: s.selected,
    scrollable: s.scrollable,
    longClickable: s.longClickable,
    parentResourceId: s.parentResourceId?.trim(),
    parentClass: s.parentClass?.trim(),
    isListItem: s.isListItem,
    uniqueText: s.uniqueText,
    uniqueDesc: s.uniqueDesc
  };
}

function buildUiSelector(
  s: LocatorNode,
  opts: { includeText?: boolean; includeDesc?: boolean; textContains?: string }
): { selector?: string; features: ScoreFeature; notes: string[] } {
  const parts: string[] = ['new UiSelector()'];
  const features: ScoreFeature = {};
  const notes: string[] = [];

  if (s.cls) {
    parts.push(`.className("${s.cls}")`);
    features.usesClass = true;
  }
  if (s.packageName) {
    parts.push(`.packageName("${s.packageName}")`);
    features.usesPackage = true;
  }
  const boolFilters: string[] = [];
  if (s.clickable === true) boolFilters.push('.clickable(true)');
  if (s.enabled === true) boolFilters.push('.enabled(true)');
  if (s.focusable === true) boolFilters.push('.focusable(true)');
  if (boolFilters.length) {
    parts.push(...boolFilters.slice(0, 3));
    features.usesBooleans = true;
  }
  if (opts.includeText && s.text) {
    parts.push(`.text("${s.text}")`);
    features.usesTextExact = true;
  } else if (opts.textContains && s.text) {
    parts.push(`.textContains("${escapeQuotes(opts.textContains)}")`);
    features.usesTextContains = true;
    features.dynamicText = true;
  }
  if (opts.includeDesc && s.desc) {
    parts.push(`.description("${s.desc}")`);
    features.usesDesc = true;
  }
  if (s.id) {
    parts.push(`.resourceId("${s.id}")`);
    features.usesId = true;
  }
  if (s.index !== undefined) {
    parts.push(`.index(${s.index})`);
    features.usesIndex = true;
    notes.push('index used');
  }
  const hasMeaningful = parts.length > 1;
  return { selector: hasMeaningful ? parts.join('') : undefined, features, notes };
}

function buildParentAwareSelector(
  s: LocatorNode,
  dynamicText: boolean
): { selector?: string; features: ScoreFeature; notes: string[] } {
  if (!s.parentResourceId && !s.parentClass) return { features: {}, notes: [] };
  const baseChild = buildUiSelector(s, { includeText: !dynamicText, includeDesc: true, textContains: dynamicText ? s.text : undefined });
  if (!baseChild.selector) return { features: {}, notes: [] };
  const parent = s.parentResourceId
    ? `new UiSelector().resourceId("${s.parentResourceId}")`
    : `new UiSelector().className("${s.parentClass}")`;
  const selector = `${parent}.childSelector(${baseChild.selector})`;
  return {
    selector,
    features: {
      ...baseChild.features,
      usesParent: true,
      usesListContext: s.isListItem,
      dynamicText: dynamicText && !!s.text
    },
    notes: [
      ...(baseChild.notes || []),
      s.parentResourceId ? `parent id: ${s.parentResourceId}` : `parent class: ${s.parentClass}`,
      s.isListItem ? 'list item context' : ''
    ].filter(Boolean)
  };
}

function buildXPath(
  s: LocatorNode,
  dynamicText: boolean
): { value: string; features: ScoreFeature; notes: string[] }[] {
  const res: { value: string; features: ScoreFeature; notes: string[] }[] = [];
  const attrs: string[] = [];
  const notes: string[] = [];
  const features: ScoreFeature = { usesXPath: true };
  if (s.id) {
    attrs.push(`@resource-id="${s.id}"`);
    features.usesId = true;
  }
  if (s.desc) {
    attrs.push(`@content-desc="${s.desc}"`);
    features.usesDesc = true;
  }
  if (s.cls) {
    attrs.push(`@class="${s.cls}"`);
    features.usesClass = true;
  }
  if (s.text && !dynamicText) {
    attrs.push(`@text="${s.text}"`);
    features.usesTextExact = true;
  } else if (s.text) {
    attrs.push(`contains(@text,"${escapeQuotes(s.text)}")`);
    features.usesTextContains = true;
    features.dynamicText = true;
    notes.push('text may change (contains used)');
  }
  if (s.packageName) {
    attrs.push(`@package="${s.packageName}"`);
    features.usesPackage = true;
  }
  let value = '//*';
  if (attrs.length) {
    value = `//*[${
      attrs.length === 1 ? attrs[0] : attrs.map((a) => `(${a})`).join(' and ')
    }]`;
  }
  res.push({ value, features: { ...features }, notes });

  if (s.parentResourceId && s.cls) {
    const scoped = `//*[@resource-id="${s.parentResourceId}"]//*[@class="${s.cls}"]`;
    res.push({
      value: scoped,
      features: { ...features, usesParent: true },
      notes: ['scoped by parent id']
    });
  }
  if (s.index !== undefined) {
    const indexed = `${value}[${s.index + 1}]`;
    res.push({
      value: indexed,
      features: { ...features, usesIndex: true },
      notes: ['index fallback in XPath']
    });
  }
  return res;
}

function buildPython(strategy: string, value: string, platform: 'android' | 'ios' = 'android'): string {
  const locatorCall = pythonLocator(strategy, value);
  const wait = `from appium.webdriver.common.appiumby import AppiumBy\nfrom selenium.webdriver.support.ui import WebDriverWait\nfrom selenium.webdriver.support import expected_conditions as EC\n\nlocator = ${locatorCall}\nel = WebDriverWait(driver, 10).until(EC.presence_of_element_located(locator))`;
  return wait;
}

function buildJava(strategy: string, value: string, platform: 'android' | 'ios' = 'android'): string {
  const locatorCall = javaLocator(strategy, value);
  const wait =
    'WebDriverWait wait = new WebDriverWait(driver, java.time.Duration.ofSeconds(10));\n' +
    `WebElement el = wait.until(org.openqa.selenium.support.ui.ExpectedConditions.presenceOfElementLocated(${locatorCall}));`;
  return wait;
}

function pythonLocator(strategy: string, value: string): string {
  switch (strategy) {
    case 'id':
      return `(AppiumBy.ID, "${escapeQuotes(value)}")`;
    case 'accessibility':
      return `(AppiumBy.ACCESSIBILITY_ID, "${escapeQuotes(value)}")`;
    case 'uiautomator':
    case 'uiautomator-child':
      return `(AppiumBy.ANDROID_UIAUTOMATOR, '${escapeQuotes(value)}')`;
    case 'predicate':
      return `(AppiumBy.IOS_PREDICATE, "${escapeQuotes(value)}")`;
    case 'class chain':
      return `(AppiumBy.IOS_CLASS_CHAIN, "${escapeQuotes(value)}")`;
    default:
      return `(AppiumBy.XPATH, "${escapeQuotes(value)}")`;
  }
}

function javaLocator(strategy: string, value: string): string {
  switch (strategy) {
    case 'id':
      return `AppiumBy.id("${escapeQuotes(value)}")`;
    case 'accessibility':
      return `AppiumBy.accessibilityId("${escapeQuotes(value)}")`;
    case 'uiautomator':
    case 'uiautomator-child':
      return `AppiumBy.androidUIAutomator("${escapeQuotes(value)}")`;
    case 'predicate':
      return `AppiumBy.iOSNsPredicateString("${escapeQuotes(value)}")`;
    case 'class chain':
      return `AppiumBy.iOSClassChain("${escapeQuotes(value)}")`;
    default:
      return `AppiumBy.xpath("${escapeQuotes(value)}")`;
  }
}

function makeSuggestion(input: {
  strategy: string;
  value: string;
  features: ScoreFeature;
  python: string;
  java: string;
  notes?: string[];
}): LocatorSuggestion {
  const { score, tier, risks } = evaluateScore(input.features);
  return {
    strategy: input.strategy,
    value: input.value,
    codePython: input.python,
    codeJava: input.java,
    score,
    tier,
    risks,
    notes: input.notes?.filter(Boolean)
  };
}

function evaluateScore(features: ScoreFeature): { score: number; tier: LocatorSuggestion['tier']; risks: string[] } {
  let score = 0;
  const risks: string[] = [];
  
  // Primary identifiers (high reliability)
  if (features.usesId) score += 60;
  if (features.usesDesc) score += 60;
  
  // Text-based locators (improved scoring)
  if (features.usesTextExact) {
    // 정확한 텍스트 매칭은 높은 점수
    if (features.uniqueText) {
      score += 50; // 고유 텍스트는 ID/Desc 수준
    } else {
      score += 35; // 일반 텍스트도 충분히 신뢰할 수 있음
    }
  }
  if (features.usesTextContains) {
    // textContains는 약간 낮게
    score += features.uniqueText ? 30 : 20;
  }
  
  // Uniqueness bonuses (이미 위에서 처리했으므로 중복 방지)
  if (features.uniqueDesc && !features.usesTextExact && !features.usesTextContains) {
    score += 15;
  }
  
  // Supporting attributes
  if (features.usesClass) score += 10;
  if (features.usesPackage) score += 8;
  if (features.usesBooleans) score += 5;
  if (features.usesParent) score += 8;
  if (features.usesListContext) score += 6;
  
  // XPath penalty (but less severe)
  if (features.usesXPath) score -= features.usesDesc || features.usesId ? 12 : 15;
  
  // Fragile indicators
  if (features.usesIndex) {
    score -= 15;
    risks.push('index used (fragile when layout changes)');
  }
  if (features.usesBounds) {
    score -= 30;
    risks.push('bounds based (resolution/scroll sensitive)');
  }
  if (features.dynamicText) {
    score -= 12;
    risks.push('text may change (dynamic content)');
  }
  
  // Clamp score
  if (score > 100) score = 100;
  if (score < 10) score = 10;

  const tier: LocatorSuggestion['tier'] =
    score >= 80 ? 'recommended' : score >= 60 ? 'alternative' : 'fallback';
  const filteredRisks =
    tier === 'recommended' ? risks.filter((r) => !r.startsWith('index used')) : risks;
  return { score, tier, risks: filteredRisks };
}

function isDynamicText(text?: string): boolean {
  if (!text) return false;
  const dynamicPatterns = [
    /^[0-9.,:]+$/,
    /^[0-9]{1,2}[:시hH][0-9]{1,2}/,
    /[%\d]+\s?(개|원|건|회|분|초|일)/,
    /^[A-Za-z0-9_-]+$/,
    /[0-9]{4}-[0-9]{2}-[0-9]{2}/
  ];
  return dynamicPatterns.some((re) => re.test(text)) || text.length > 40;
}

function escapeQuotes(v: string): string {
  return v.replace(/"/g, '\\"').replace(/'/g, "\\'");
}
