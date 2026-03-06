"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import Link from 'next/link'

export default function NewProjectPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [formData, setFormData] = useState({
        title: '',
        niche: '',
        genre: 'nonfiction',
        wordTarget: 50000
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const { data } = await api.post('/api/projects', formData)
            router.push(`/dashboard/project/${data.id}`)
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create project')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center space-x-2 text-sm text-slate-500">
                <Link href="/dashboard" className="hover:text-blue-600">Projects</Link>
                <span>/</span>
                <span className="text-slate-900 font-medium">New Book</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-sm space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Start a New Book</h1>
                    <p className="text-slate-500 mt-2">Specify the initial details. You can refine these with AI later.</p>
                </div>

                {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Project Title</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            placeholder="e.g. The Future of Zero-Knowledge Proofs"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Niche / Topic</label>
                        <textarea
                            required
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[100px]"
                            placeholder="Explain briefly what this book is about..."
                            value={formData.niche}
                            onChange={e => setFormData({ ...formData, niche: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Genre</label>
                            <select
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                                value={formData.genre}
                                onChange={e => setFormData({ ...formData, genre: e.target.value })}
                            >
                                <option value="nonfiction">Non-Fiction</option>
                                <option value="technical">Technical Guide</option>
                                <option value="memoir">Memoir / Biography</option>
                                <option value="business">Business / Marketing</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Target Word Count</label>
                            <input
                                type="number"
                                required
                                step="5000"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.wordTarget}
                                onChange={e => setFormData({ ...formData, wordTarget: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Initializing Project...' : 'Begin Planning Session'}
                    </button>
                </form>
            </div>
        </div>
    )
}
