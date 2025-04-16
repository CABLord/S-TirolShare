import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  darkMode: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  toggleTheme: () => set((state: ThemeState) => ({ darkMode: !state.darkMode })),

    }),
    { name: 'theme-storage' }
  )
);
