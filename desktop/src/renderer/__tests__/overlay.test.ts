import { describe, it, expect } from 'vitest';
import { buildOverlayItems, parseBounds, flatNodes } from '../components/Overlay';
import type { UiNode } from '../store';

describe('Overlay helpers', () => {
  const makeNode = (overrides: Partial<UiNode> = {}): UiNode => ({
    id: overrides.id || Math.random().toString(16).slice(2),
    cls: overrides.cls || 'android.view.View',
    text: overrides.text,
    resourceId: overrides.resourceId,
    contentDesc: overrides.contentDesc,
    packageName: overrides.packageName,
    index: overrides.index,
    clickable: overrides.clickable,
    enabled: overrides.enabled,
    focusable: overrides.focusable,
    checked: overrides.checked,
    checkable: overrides.checkable,
    selected: overrides.selected,
    scrollable: overrides.scrollable,
    longClickable: overrides.longClickable,
    bounds: overrides.bounds || '[0,0][10,10]',
    children: overrides.children || [],
    parentResourceId: overrides.parentResourceId,
    parentClass: overrides.parentClass,
    isListItem: overrides.isListItem,
    uniqueText: overrides.uniqueText,
    uniqueDesc: overrides.uniqueDesc,
    screenshotPath: overrides.screenshotPath
  });

  it('parses bounds correctly', () => {
    expect(parseBounds('[1,2][3,4]')).toEqual({ x1: 1, y1: 2, x2: 3, y2: 4 });
    expect(parseBounds(undefined)).toBeNull();
  });

  it('flattens nested nodes', () => {
    const child = makeNode({ id: 'child' });
    const parent = makeNode({ id: 'parent', children: [child] });
    const flattened = flatNodes([parent]).map((n) => n.id);
    expect(flattened).toEqual(['parent', 'child']);
  });

  it('marks only selected node as selected and others as faded', () => {
    const n1 = makeNode({ id: 'n1', bounds: '[0,0][10,10]' });
    const n2 = makeNode({ id: 'n2', bounds: '[10,10][20,20]' });
    const items = buildOverlayItems([n1, n2], { w: 100, h: 100 }, 'n2');
    const selected = items.find((i) => (i as any).selected);
    const faded = items.filter((i) => (i as any).faded);
    expect(selected?.n.id).toBe('n2');
    expect(faded.map((f) => f.n.id)).toEqual(['n1']);
  });

  it('no selection -> no fading', () => {
    const n1 = makeNode({ id: 'n1' });
    const items = buildOverlayItems([n1], { w: 100, h: 100 });
    expect(items[0]).not.toHaveProperty('selected');
    expect(items[0]).not.toHaveProperty('faded');
  });
});
