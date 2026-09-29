'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Sun, Moon, Monitor, Type, Palette, Settings2, Check } from 'lucide-react';
import { useUserPreferences, ACCENT_COLORS, type ThemeMode, type FontFamily, type FontSize, type Density } from '@/lib/preferences';

export function ThemeToggle() {
  const prefs = useUserPreferences();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;
  const themeIcon = prefs.theme === 'dark' ? <Moon className="h-4 w-4" /> : prefs.theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => prefs.setTheme(prefs.theme === 'dark' ? 'light' : 'dark')} title={`Theme: ${prefs.theme}`}>
        {themeIcon}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Settings2 className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-slate-500">Theme Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={prefs.theme} onValueChange={(v) => prefs.setTheme(v as ThemeMode)}>
            <DropdownMenuRadioItem value="dark"><Moon className="h-3 w-3 mr-2" /> Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light"><Sun className="h-3 w-3 mr-2" /> Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><Monitor className="h-3 w-3 mr-2" /> System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-slate-500 flex items-center gap-1"><Type className="h-3 w-3" /> Font Family</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={prefs.fontFamily} onValueChange={(v) => prefs.setFontFamily(v as FontFamily)}>
            <DropdownMenuRadioItem value="sans">Sans-serif (Inter)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="serif">Serif (Lora)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="mono">Monospace</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-slate-500">Font Size</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={prefs.fontSize} onValueChange={(v) => prefs.setFontSize(v as FontSize)}>
            <DropdownMenuRadioItem value="sm">Small (13px)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="base">Default (14px)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="lg">Large (15px)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="xl">Extra Large (16px)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-slate-500">Density</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={prefs.density} onValueChange={(v) => prefs.setDensity(v as Density)}>
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="spacious">Spacious</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-slate-500">Accent Color</DropdownMenuLabel>
          <div className="grid grid-cols-7 gap-1 p-2">
            {ACCENT_COLORS.map((c) => (
              <button key={c.value} onClick={() => prefs.setAccentColor(c.value)} className="h-6 w-6 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110" style={{ background: c.value, borderColor: prefs.accentColor === c.value ? '#fff' : 'transparent' }} title={c.name}>
                {prefs.accentColor === c.value && <Check className="h-3 w-3 text-white" />}
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}