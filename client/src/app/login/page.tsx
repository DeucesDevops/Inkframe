"use client"

import { useState } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { login } = useAuthStore()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await login(email, password)
            router.push('/dashboard')
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
            <div className="max-w-md w-full space-y-8 bg-slate-900 p-10 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="text-center">
                    <Link href="/" className="text-3xl font-bold tracking-tighter text-white">Inkframe</Link>
                    <h2 className="mt-6 text-xl font-bold text-white">Welcome back</h2>
                    <p className="mt-2 text-sm text-slate-400">Log in to continue your writing journey</p>
                </div>

                {error && <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-200 text-xs rounded-xl text-center">{error}</div>}

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                            <input
                                type="email"
                                required
                                className="mt-1 block w-full px-4 py-3 bg-slate-800 border-transparent rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all sm:text-sm shadow-inner"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Password</label>
                            <input
                                type="password"
                                required
                                className="mt-1 block w-full px-4 py-3 bg-slate-800 border-transparent rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all sm:text-sm shadow-inner"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-black bg-white hover:bg-slate-200 focus:outline-none transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Logging in...' : 'Enter Dashboard'}
                    </button>
                </form>

                <p className="text-center text-xs text-slate-500">
                    Don't have an account? <Link href="/signup" className="text-blue-400 font-bold hover:underline">Sign up</Link>
                </p>
            </div>
        </div>
    )
}
