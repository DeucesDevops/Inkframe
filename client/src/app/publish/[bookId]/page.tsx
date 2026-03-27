"use client"

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'
import PublishChecklist from '@/components/PublishChecklist'

interface ChecklistData {
  checklist: { item: string; done: boolean }[]
  totalWords: number
  chapterCount: number
}

interface KdpMetadata {
  description: string
  keywords: string[]
  categories: { bisac: string; name: string; reason: string }[]
}

const PLATFORM_LINKS = [
  { name: 'KDP (Amazon)', url: 'https://kdp.amazon.com', icon: '📦' },
  { name: 'IngramSpark', url: 'https://www.ingramspark.com', icon: '🏭' },
  { name: 'ACX (Audible)', url: 'https://www.acx.com', icon: '🎙️' },
  { name: 'Findaway Voices', url: 'https://findawayvoices.com', icon: '🎧' },
  { name: 'Apple Books for Authors', url: 'https://authors.apple.com', icon: '🍎' },
]

export default function PublishPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const [synopsis, setSynopsis] = useState('')
  const [metadata, setMetadata] = useState<KdpMetadata | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const { data: checklist } = useQuery<ChecklistData>({
    queryKey: ['checklist', bookId],
    queryFn: async () => {
      const { data } = await api.post('/api/publish/checklist', { bookId })
      return data
    },
  })

  async function generateMetadata() {
    setGenerating(true)
    try {
      const { data } = await api.post('/api/publish/metadata', { bookId, synopsis })
      setMetadata(data)
    } finally {
      setGenerating(false)
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center gap-4">
          <Link href={`/editor/${bookId}`} className="text-slate-400 hover:text-slate-700 transition-colors text-sm">
            ← Editor
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Publish Assistant</h1>
            <p className="text-slate-500 mt-1">Generate metadata and check publishing readiness</p>
          </div>
        </div>

        {/* KDP Metadata Generator */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">KDP Metadata Generator</h2>
          <p className="text-slate-500 text-sm">
            Write a short synopsis, and Claude will generate Amazon-optimised metadata for you.
          </p>
          <textarea
            className="w-full border border-slate-300 rounded-xl p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 h-28 resize-none"
            placeholder="Describe your book in 2-3 sentences..."
            value={synopsis}
            onChange={e => setSynopsis(e.target.value)}
          />
          <button
            onClick={generateMetadata}
            disabled={generating}
            className="bg-blue-600 text-white rounded-lg py-2 px-6 font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >{generating ? 'Generating...' : 'Generate Metadata'}</button>

          {metadata && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">Book Description</h3>
                  <button
                    onClick={() => copy(metadata.description, 'desc')}
                    className="text-xs text-blue-600 hover:underline"
                  >{copied === 'desc' ? 'Copied!' : 'Copy'}</button>
                </div>
                <div
                  className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4 border border-slate-100 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: metadata.description }}
                />
              </div>

              {/* Keywords */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">Keywords (7)</h3>
                  <button
                    onClick={() => copy(metadata.keywords.join(', '), 'kw')}
                    className="text-xs text-blue-600 hover:underline"
                  >{copied === 'kw' ? 'Copied!' : 'Copy'}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {metadata.keywords.map((kw, i) => (
                    <span key={i} className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-2">BISAC Categories</h3>
                {metadata.categories.map((cat, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-2">
                    <p className="font-medium text-slate-800 text-sm">{cat.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{cat.bisac} — {cat.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Publishing Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Publishing Checklist</h2>
          {checklist ? (
            <PublishChecklist
              checklist={checklist.checklist}
              totalWords={checklist.totalWords}
              chapterCount={checklist.chapterCount}
            />
          ) : (
            <p className="text-slate-400 text-sm">Loading checklist...</p>
          )}
        </div>

        {/* Platform Links */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Publishing Platforms</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {PLATFORM_LINKS.map(link => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors group"
              >
                <span className="text-2xl">{link.icon}</span>
                <span className="font-medium text-slate-700 group-hover:text-blue-700 transition-colors">
                  {link.name}
                </span>
                <svg
                  className="w-4 h-4 text-slate-300 ml-auto group-hover:text-blue-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
