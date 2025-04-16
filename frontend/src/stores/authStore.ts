import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  
  login: (token: string, user: User) => void;
  logout: () => void;
  checkAuth: () => void; // Add this method
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      checkAuth: () => {
        // This can be empty since persist middleware already restores the state
        // Or you can add token validation logic here if needed
        const state = get();
        if (state.token) {
          // You could validate the token here if needed
          set({ isAuthenticated: true });
        }
      }
    }),
    { name: 'auth-storage' }
  )
);