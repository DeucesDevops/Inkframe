import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api'

interface AuthStore {
    user: any | null
    token: string | null
    login: (email: string, password: string) => Promise<void>
    logout: () => void
    signup: (email: string, password: string) => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            login: async (email, password) => {
                const { data } = await api.post('/api/auth/login', { email, password })
                localStorage.setItem('inkframe_token', data.token)
                set({ user: data.user, token: data.token })
            },
            logout: () => {
                localStorage.removeItem('inkframe_token')
                set({ user: null, token: null })
            },
            signup: async (email, password) => {
                const { data } = await api.post('/api/auth/signup', { email, password })
                localStorage.setItem('inkframe_token', data.token)
                set({ user: data.user, token: data.token })
            }
        }),
        { name: 'inkframe-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
    )
)
