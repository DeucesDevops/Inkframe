"use client"

import { useState } from 'react'
import api from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (book: { id: string }) => void
}

export default function BookModal({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [genre, setGenre] = useState('nonfiction')
  const [targetWords, setTargetWords] = useState(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/api/books', { title, subtitle, genre, targetWords })
      await qc.invalidateQueries({ queryKey: ['books'] })
      setTitle(''); setSubtitle(''); setGenre('nonfiction'); setTargetWords(50000)
      onCreated?.(data)
      onClose()
    } catch {
      setError('Failed to create book')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">New Book</h2>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={title} onChange={e => setTitle(e.target.value)} placeholder="My Amazing Book"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subtitle</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Optional subtitle"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={genre} onChange={e => setGenre(e.target.value)}
            >
              <option value="nonfiction">Non-Fiction</option>
              <option value="fiction">Fiction</option>
              <option value="self-help">Self-Help</option>
              <option value="business">Business</option>
              <option value="how-to">How-To</option>
              <option value="children">Children</option>
              <option value="thriller">Thriller</option>
              <option value="romance">Romance</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Word Count Goal</label>
            <input
              type="number" min={1000} max={500000} step={1000}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={targetWords} onChange={e => setTargetWords(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 rounded-lg py-2 font-medium hover:bg-slate-50"
            >Cancel</button>
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
            >{loading ? 'Creating...' : 'Create Book'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
