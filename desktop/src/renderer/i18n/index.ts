import { useAppStore } from '../store';
import { ko } from './ko';
import { en } from './en';
import { Translation } from './types';

export type { Translation };

const translations: Record<'ko' | 'en', Translation> = { ko, en };

export function useT(): Translation {
  const { state } = useAppStore();
  return translations[state.uiLang ?? 'ko'];
}
