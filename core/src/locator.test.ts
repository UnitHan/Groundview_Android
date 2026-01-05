import { describe, it, expect } from 'vitest';
import { generateLocators } from './locator';

describe('locator generator', () => {
  it('deduplicates and sorts by score', () => {
    const locs = generateLocators(
      [
        { id: 'btn_ok', text: '확인', cls: 'android.widget.Button', clickable: true, enabled: true },
        { id: 'btn_ok' },
        { text: '짧' },
        { text: '길이긴텍스트' }
      ],
      'android'
    );
    expect(locs.filter((l) => l.value === 'btn_ok').length).toBe(1);
    expect(locs[0].value).toContain('btn_ok');
    expect(locs[0].tier).toBe('recommended');
  });

  it('uses predicate for ios text', () => {
    const locs = generateLocators([{ text: 'Next' }], 'ios');
    expect(locs[0].strategy).toBe('predicate');
    expect(locs[0].codeJava).toContain('iOSNsPredicateString');
  });
});
