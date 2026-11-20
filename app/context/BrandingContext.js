'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ═══ 8 Pre-built Theme Palettes with Light & Dark Variants ═══
const THEME_PALETTES = {
  violet: {
    id: 'violet',
    label: 'Violet',
    emoji: '💜',
    primary: '#6366F1',
    primaryDark: '#4F46E5',
    primaryLight: '#A5B4FC',
    cardGradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    cardSolid: '#6366F1',
    dockBg: '#141417',
    accentSurface: '#F0EFFE',
    accentBorder: 'rgba(99, 102, 241, 0.2)',
    badgeBg: '#F0EFFE',
    badgeText: '#4F46E5',
    darkAccentSurface: 'rgba(99, 102, 241, 0.18)',
    darkAccentBorder: 'rgba(99, 102, 241, 0.35)',
    darkBadgeBg: 'rgba(99, 102, 241, 0.22)',
    darkBadgeText: '#C4B5FD',
  },
  gold: {
    id: 'gold',
    label: 'Gold',
    emoji: '🥇',
    primary: '#D4A017',
    primaryDark: '#B8880F',
    primaryLight: '#F0D060',
    cardGradient: 'linear-gradient(135deg, #E6B422 0%, #C4960F 100%)',
    cardSolid: '#D4A017',
    dockBg: '#1A1506',
    accentSurface: '#FDF6E3',
    accentBorder: 'rgba(212, 160, 23, 0.2)',
    badgeBg: '#FDF6E3',
    badgeText: '#B8880F',
    darkAccentSurface: 'rgba(212, 160, 23, 0.18)',
    darkAccentBorder: 'rgba(212, 160, 23, 0.35)',
    darkBadgeBg: 'rgba(212, 160, 23, 0.22)',
    darkBadgeText: '#FDE68A',
  },
  bronze: {
    id: 'bronze',
    label: 'Bronze',
    emoji: '🥉',
    primary: '#CD7F32',
    primaryDark: '#A66828',
    primaryLight: '#E0A060',
    cardGradient: 'linear-gradient(135deg, #D4893D 0%, #B06C28 100%)',
    cardSolid: '#CD7F32',
    dockBg: '#1A1108',
    accentSurface: '#FDF0E2',
    accentBorder: 'rgba(205, 127, 50, 0.2)',
    badgeBg: '#FDF0E2',
    badgeText: '#A66828',
    darkAccentSurface: 'rgba(205, 127, 50, 0.18)',
    darkAccentBorder: 'rgba(205, 127, 50, 0.35)',
    darkBadgeBg: 'rgba(205, 127, 50, 0.22)',
    darkBadgeText: '#FDBA74',
  },
  royalblue: {
    id: 'royalblue',
    label: 'Royal Blue',
    emoji: '👑',
    primary: '#0088FF',
    primaryDark: '#062B66',
    primaryLight: '#60A5FA',
    cardGradient: 'linear-gradient(135deg, #062B66 0%, #035EC8 55%, #0088FF 100%)',
    cardSolid: '#0088FF',
    dockBg: '#062B66',
    accentSurface: '#EFF6FF',
    accentBorder: 'rgba(0, 136, 255, 0.22)',
    badgeBg: '#E6F2FF',
    badgeText: '#035EC8',
    darkAccentSurface: 'rgba(0, 136, 255, 0.18)',
    darkAccentBorder: 'rgba(0, 136, 255, 0.35)',
    darkBadgeBg: 'rgba(0, 136, 255, 0.22)',
    darkBadgeText: '#93C5FD',
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    emoji: '💚',
    primary: '#059669',
    primaryDark: '#047857',
    primaryLight: '#34D399',
    cardGradient: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
    cardSolid: '#059669',
    dockBg: '#021A12',
    accentSurface: '#ECFDF5',
    accentBorder: 'rgba(5, 150, 105, 0.2)',
    badgeBg: '#ECFDF5',
    badgeText: '#047857',
    darkAccentSurface: 'rgba(16, 185, 129, 0.18)',
    darkAccentBorder: 'rgba(16, 185, 129, 0.35)',
    darkBadgeBg: 'rgba(16, 185, 129, 0.22)',
    darkBadgeText: '#6EE7B7',
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    emoji: '🌹',
    primary: '#E11D48',
    primaryDark: '#BE123C',
    primaryLight: '#FB7185',
    cardGradient: 'linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)',
    cardSolid: '#E11D48',
    dockBg: '#1A0810',
    accentSurface: '#FFF1F2',
    accentBorder: 'rgba(225, 29, 72, 0.2)',
    badgeBg: '#FFF1F2',
    badgeText: '#BE123C',
    darkAccentSurface: 'rgba(244, 63, 94, 0.18)',
    darkAccentBorder: 'rgba(244, 63, 94, 0.35)',
    darkBadgeBg: 'rgba(244, 63, 94, 0.22)',
    darkBadgeText: '#FDA4AF',
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    emoji: '🪨',
    primary: '#475569',
    primaryDark: '#334155',
    primaryLight: '#94A3B8',
    cardGradient: 'linear-gradient(135deg, #64748B 0%, #334155 100%)',
    cardSolid: '#475569',
    dockBg: '#0F172A',
    accentSurface: '#F1F5F9',
    accentBorder: 'rgba(71, 85, 105, 0.2)',
    badgeBg: '#F1F5F9',
    badgeText: '#334155',
    darkAccentSurface: 'rgba(100, 116, 139, 0.2)',
    darkAccentBorder: 'rgba(100, 116, 139, 0.35)',
    darkBadgeBg: 'rgba(100, 116, 139, 0.25)',
    darkBadgeText: '#CBD5E1',
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson',
    emoji: '🔴',
    primary: '#DC2626',
    primaryDark: '#B91C1C',
    primaryLight: '#F87171',
    cardGradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    cardSolid: '#DC2626',
    dockBg: '#1A0808',
    accentSurface: '#FEF2F2',
    accentBorder: 'rgba(220, 38, 38, 0.2)',
    badgeBg: '#FEF2F2',
    badgeText: '#B91C1C',
    darkAccentSurface: 'rgba(239, 68, 68, 0.18)',
    darkAccentBorder: 'rgba(239, 68, 68, 0.35)',
    darkBadgeBg: 'rgba(239, 68, 68, 0.22)',
    darkBadgeText: '#FCA5A5',
  },
};

const DEFAULT_BRANDING = {
  app_name: 'MyCollectiveSub',
  logo_url: '',
  theme: 'royalblue',
  app_url: '',
};

const BrandingContext = createContext({
  appName: DEFAULT_BRANDING.app_name,
  logoUrl: DEFAULT_BRANDING.logo_url,
  appUrl: DEFAULT_BRANDING.app_url,
  theme: THEME_PALETTES.royalblue,
  themeId: 'royalblue',
  palettes: THEME_PALETTES,
  setTheme: () => {},
  mode: 'light',
  isDark: false,
  setMode: () => {},
  toggleMode: () => {},
  loaded: false,
});

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loaded, setLoaded] = useState(false);
  const [mode, setModeState] = useState('light'); // 'light' | 'dark' - default light
  const [isDark, setIsDark] = useState(false);

  const currentTheme = THEME_PALETTES[branding.theme] || THEME_PALETTES.royalblue;

  // Read saved mode preference from localStorage - default to light
  useEffect(() => {
    try {
      const saved = localStorage.getItem('asuk_theme_mode');
      if (saved === 'dark') {
        setModeState('dark');
      } else {
        setModeState('light');
        localStorage.setItem('asuk_theme_mode', 'light');
      }
    } catch {}
  }, []);

  // Detect and resolve dark vs light mode - default light
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const darkActive = mode === 'dark';
    setIsDark(darkActive);

    const root = document.documentElement;
    if (darkActive) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [mode]);

  // Apply theme CSS variables to :root
  const applyTheme = useCallback((palette, darkActive) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    root.style.setProperty('--primary', palette.primary);
    root.style.setProperty('--primary-dark', palette.primaryDark);
    root.style.setProperty('--primary-light', palette.primaryLight);
    root.style.setProperty('--card-gradient', palette.cardGradient);
    root.style.setProperty('--card-solid', palette.cardSolid);
    root.style.setProperty('--dock-bg', palette.dockBg);

    if (darkActive) {
      root.style.setProperty('--accent-surface', palette.darkAccentSurface || 'rgba(255,255,255,0.08)');
      root.style.setProperty('--accent-border', palette.darkAccentBorder || 'rgba(255,255,255,0.15)');
      root.style.setProperty('--badge-bg', palette.darkBadgeBg || 'rgba(255,255,255,0.12)');
      root.style.setProperty('--badge-text', palette.darkBadgeText || palette.primaryLight);
    } else {
      root.style.setProperty('--accent-surface', palette.accentSurface);
      root.style.setProperty('--accent-border', palette.accentBorder);
      root.style.setProperty('--badge-bg', palette.badgeBg);
      root.style.setProperty('--badge-text', palette.badgeText);
    }
  }, []);

  // Fetch branding from public API
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/settings/public');
        if (res.ok) {
          const data = await res.json();
          if (data.branding) {
            setBranding(prev => ({
              ...prev,
              app_name: data.branding.app_name || prev.app_name,
              logo_url: data.branding.logo_url || prev.logo_url,
              theme: data.branding.theme || prev.theme,
              app_url: data.branding.app_url || prev.app_url || '',
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching branding:', err);
      } finally {
        setLoaded(true);
      }
    };

    fetchBranding();
  }, []);

  // Apply theme whenever branding or dark state changes
  useEffect(() => {
    applyTheme(currentTheme, isDark);
  }, [currentTheme, isDark, applyTheme]);

  // Update document title
  useEffect(() => {
    if (typeof document !== 'undefined' && branding.app_name) {
      document.title = `${branding.app_name} — Wi-Fi Pass & Wallet`;
    }
  }, [branding.app_name]);

  const setTheme = useCallback((themeId) => {
    if (THEME_PALETTES[themeId]) {
      setBranding(prev => ({ ...prev, theme: themeId }));
    }
  }, []);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem('asuk_theme_mode', newMode);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return (
    <BrandingContext.Provider
      value={{
        appName: branding.app_name,
        logoUrl: branding.logo_url,
        appUrl: branding.app_url,
        theme: currentTheme,
        themeId: branding.theme,
        palettes: THEME_PALETTES,
        setTheme,
        mode,
        isDark,
        setMode,
        toggleMode,
        loaded,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
export { THEME_PALETTES };
