// User Preferences — theme, fonts, density, accent color, behavior toggles
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type Density = 'compact' | 'comfortable' | 'spacious';

interface UserPreferences {
  theme: ThemeMode;
  fontFamily: FontFamily;
  fontSize: FontSize;
  density: Density;
  reducedMotion: boolean;
  accentColor: string;
  sidebarCollapsed: boolean;
  showHelpTooltips: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  setTheme: (t: ThemeMode) => void;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: FontSize) => void;
  setDensity: (d: Density) => void;
  setReducedMotion: (r: boolean) => void;
  setAccentColor: (c: string) => void;
  setSidebarCollapsed: (c: boolean) => void;
  setShowHelpTooltips: (s: boolean) => void;
  setAutoRefresh: (a: boolean) => void;
  setRefreshInterval: (i: number) => void;
}

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  sans: "'Inter', 'Geist Sans', system-ui, sans-serif",
  serif: "'Lora', 'Georgia', serif",
  mono: "'Geist Mono', 'JetBrains Mono', monospace",
};

const FONT_SIZE_MAP: Record<FontSize, string> = {
  sm: '13px', base: '14px', lg: '15px', xl: '16px',
};

const DENSITY_MAP: Record<Density, { padding: string; gap: string; cardPadding: string }> = {
  compact: { padding: '0.5rem', gap: '0.5rem', cardPadding: '0.625rem' },
  comfortable: { padding: '0.75rem', gap: '0.75rem', cardPadding: '1rem' },
  spacious: { padding: '1rem', gap: '1rem', cardPadding: '1.25rem' },
};

export const ACCENT_COLORS = [
  { name: 'emerald', value: '#10b981' },
  { name: 'cyan', value: '#06b6d4' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'purple', value: '#a855f7' },
  { name: 'pink', value: '#ec4899' },
  { name: 'orange', value: '#f97316' },
  { name: 'red', value: '#ef4444' },
];

export function hexToRgb(hex: string): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return '16, 185, 129';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

export function applyThemeToDOM(prefs: Partial<UserPreferences>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = prefs.theme || 'dark';
  if (mode === 'system') {
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  } else {
    root.classList.toggle('dark', mode === 'dark');
  }
  const ff = prefs.fontFamily || 'sans';
  root.style.setProperty('--app-font-family', FONT_FAMILY_MAP[ff]);
  const fs = prefs.fontSize || 'base';
  root.style.setProperty('--app-font-size', FONT_SIZE_MAP[fs]);
  const dens = prefs.density || 'comfortable';
  const d = DENSITY_MAP[dens];
  root.style.setProperty('--app-density-padding', d.padding);
  root.style.setProperty('--app-density-gap', d.gap);
  root.style.setProperty('--app-density-card', d.cardPadding);
  const accent = prefs.accentColor || '#10b981';
  const rgb = hexToRgb(accent);
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-accent-rgb', rgb);
  root.style.setProperty('--app-accent-bg', `rgba(${rgb}, 0.15)`);
  root.style.setProperty('--app-accent-border', `rgba(${rgb}, 0.3)`);
  root.style.setProperty('--app-accent-text', accent);
  root.style.setProperty('--app-motion', prefs.reducedMotion ? 'none' : 'normal');
}

export const useUserPreferences = create<UserPreferences>()(
  persist(
    (set) => ({
      theme: 'dark', fontFamily: 'sans', fontSize: 'base', density: 'comfortable',
      reducedMotion: false, accentColor: '#10b981', sidebarCollapsed: false,
      showHelpTooltips: true, autoRefresh: true, refreshInterval: 2000,
      setTheme: (t) => { set({ theme: t }); applyThemeToDOM(useUserPreferences.getState()); },
      setFontFamily: (f) => { set({ fontFamily: f }); applyThemeToDOM(useUserPreferences.getState()); },
      setFontSize: (s) => { set({ fontSize: s }); applyThemeToDOM(useUserPreferences.getState()); },
      setDensity: (d) => { set({ density: d }); applyThemeToDOM(useUserPreferences.getState()); },
      setReducedMotion: (r) => { set({ reducedMotion: r }); applyThemeToDOM(useUserPreferences.getState()); },
      setAccentColor: (c) => { set({ accentColor: c }); applyThemeToDOM(useUserPreferences.getState()); },
      setSidebarCollapsed: (sc) => set({ sidebarCollapsed: sc }),
      setShowHelpTooltips: (s) => set({ showHelpTooltips: s }),
      setAutoRefresh: (a) => set({ autoRefresh: a }),
      setRefreshInterval: (i) => set({ refreshInterval: i }),
    }),
    {
      name: 'inframind-sentinelx-prefs',
      onRehydrateStorage: () => (state) => {
        if (state) setTimeout(() => applyThemeToDOM(state), 0);
      },
    },
  ),
);