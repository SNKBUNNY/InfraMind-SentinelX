'use client';
import { useEffect } from 'react';
import { useUserPreferences, applyThemeToDOM } from '@/lib/preferences';

export function ThemeInitializer() {
  const prefs = useUserPreferences();
  useEffect(() => { applyThemeToDOM(prefs); }, [prefs.theme, prefs.fontFamily, prefs.fontSize, prefs.density, prefs.accentColor, prefs.reducedMotion]);
  useEffect(() => {
    if (prefs.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeToDOM(useUserPreferences.getState());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [prefs.theme]);
  return null;
}