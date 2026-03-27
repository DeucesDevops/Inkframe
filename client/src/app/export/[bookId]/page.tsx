"use client"

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'
import ExportCard from '@/components/ExportCard'
import ExportHistory from '@/components/ExportHistory'

interface ExportRecord {
  id: string
  format: string
  status: string
  createdAt: string
  s3Key?: string
}

export default function ExportPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const [loading, setLoading] = useState<string | null>(null)

  const { data: exports = [], refetch } = useQuery<ExportRecord[]>({
    queryKey: ['exports', bookId],
    queryFn: async () => (await api.get(`/api/export/${bookId}`)).data,
    refetchInterval: (query) => {
      const data = query.state.data as ExportRecord[] | undefined
      const hasPending = data?.some(e => e.status === 'PENDING' || e.status === 'PROCESSING')
      return hasPending ? 5000 : false
    },
  })

  async function triggerExport(format: string) {
    setLoading(format)
    try {
      await api.post('/api/export', { bookId, format })
      await refetch()
    } finally {
      setLoading(null)
    }
  }

  async function handleDownload(id: string) {
    const { data } = await api.get(`/api/export/${id}/download`)
    window.open(data.url, '_blank')
  }

  async function triggerAudio(voice = '21m00Tcm4TlvDq8ikWAM') {
    setLoading('AUDIO')
    try {
      await api.post('/api/audio', { bookId, voice })
      await refetch()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center gap-4">
          <Link href={`/editor/${bookId}`} className="text-slate-400 hover:text-slate-700 transition-colors text-sm">
            ← Editor
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Export &amp; Download</h1>
            <p className="text-slate-500 mt-1">Generate your book in multiple formats for publishing</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ExportCard
            icon="📱"
            title="ePub"
            subtitle="KDP, Apple Books, Kobo"
            description="Standard eBook format for digital reading devices and apps."
            onExport={() => triggerExport('EPUB')}
            loading={loading === 'EPUB'}
          />
          <ExportCard
            icon="💻"
            title="PDF Digital"
            subtitle="Screen optimised"
            description="A4 format PDF, optimised for screen reading."
            onExport={() => triggerExport('PDF_DIGITAL')}
            loading={loading === 'PDF_DIGITAL'}
          />
          <ExportCard
            icon="🖨️"
            title="PDF Print"
            subtitle="KDP Print-on-Demand"
            description="6×9 inch print-ready PDF with KDP margins for IngramSpark / KDP POD."
            onExport={() => triggerExport('PDF_PRINT')}
            loading={loading === 'PDF_PRINT'}
          />
          <ExportCard
            icon="🎧"
            title="Audiobook"
            subtitle="ACX, Spotify, Findaway"
            description="MP3 audiobook generated with ElevenLabs AI voices."
            onExport={() => triggerAudio()}
            loading={loading === 'AUDIO'}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Export History</h2>
          <ExportHistory exports={exports} onDownload={handleDownload} />
        </div>
      </div>
    </div>
  )
}
