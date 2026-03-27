"use client"

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import WordCounter from '@/components/Editor/WordCounter'

interface Book {
  id: string
  title: string
  subtitle?: string
  genre?: string
  status: string
  targetWords?: number
}

interface Chapter {
  id: string
  title: string
  content: string
  order: number
  wordCount: number
  status: string
}

type AITab = 'outline' | 'continue' | 'rewrite' | 'summarize'

function useAutoSave(
  bookId: string,
  chapterId: string | null,
  title: string,
  content: string,
  delay = 30000
) {
  const saved = useRef({ title, content })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!chapterId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      if (saved.current.title === title && saved.current.content === content) return
      await api.patch(`/api/books/${bookId}/chapters/${chapterId}`, { title, content })
      saved.current = { title, content }
    }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [bookId, chapterId, title, content, delay])
}

export default function EditorPage() {
  const { bookId } = useParams<{ bookId: string }>()

  const { data: book } = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: async () => (await api.get(`/api/books/${bookId}`)).data,
  })

  const { data: chapters = [], refetch: refetchChapters } = useQuery<Chapter[]>({
    queryKey: ['chapters', bookId],
    queryFn: async () => (await api.get(`/api/books/${bookId}/chapters`)).data,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiTab, setAiTab] = useState<AITab>('continue')
  const [aiOutput, setAiOutput] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)

  const selected = chapters.find(c => c.id === selectedId)

  // Auto-select the first chapter on initial load
  useEffect(() => {
    if (chapters.length > 0 && !selectedId) {
      const first = chapters[0]
      setSelectedId(first.id)
      setChapterTitle(first.title)
      setContent(first.content)
    }
  }, [chapters, selectedId])

  // Sync editor fields when selected chapter changes
  useEffect(() => {
    if (selected) {
      setChapterTitle(selected.title)
      setContent(selected.content)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  useAutoSave(bookId, selectedId, chapterTitle, content)

  async function saveNow() {
    if (!selectedId) return
    setSaving(true)
    try {
      await api.patch(`/api/books/${bookId}/chapters/${selectedId}`, { title: chapterTitle, content })
      await refetchChapters()
    } finally {
      setSaving(false)
    }
  }

  async function addChapter() {
    const { data } = await api.post(`/api/books/${bookId}/chapters`, {
      title: `Chapter ${chapters.length + 1}`,
      content: '',
    })
    await refetchChapters()
    setSelectedId(data.id)
    setChapterTitle(data.title)
    setContent('')
  }

  async function deleteChapter(id: string) {
    if (!confirm('Delete this chapter?')) return
    await api.delete(`/api/books/${bookId}/chapters/${id}`)
    await refetchChapters()
    if (selectedId === id) {
      setSelectedId(null)
      setChapterTitle('')
      setContent('')
    }
  }

  async function streamAI() {
    if (!selectedId || aiStreaming) return
    setAiStreaming(true)
    setAiOutput('')

    let endpoint = ''
    let body: Record<string, string> = {}

    if (aiTab === 'outline') {
      endpoint = '/api/ai/outline'
      body = { title: book?.title || '', genre: book?.genre || '' }
    } else if (aiTab === 'continue') {
      endpoint = '/api/ai/continue'
      body = { chapterTitle, existingContent: content }
    } else if (aiTab === 'rewrite') {
      endpoint = '/api/ai/rewrite'
      body = { selectedText: content }
    } else {
      endpoint = '/api/ai/summarize'
      body = { content, chapterTitle }
    }

    try {
      // Read token directly from localStorage key used by api.ts / authStore
      const token = localStorage.getItem('inkframe_token')

      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      if (!resp.body) return

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const { text: chunk } = JSON.parse(payload)
              setAiOutput(prev => prev + chunk)
            } catch { /* skip malformed SSE frames */ }
          }
        }
      }
    } finally {
      setAiStreaming(false)
    }
  }

  function insertAiOutput() {
    setContent(prev => prev + '\n\n' + aiOutput)
    setAiOutput('')
  }

  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0)

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 transition-colors text-sm">
          ← Dashboard
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{book?.title}</h1>
          <p className="text-xs text-slate-400">{totalWords.toLocaleString()} total words</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {book?.status && <StatusBadge status={book.status} />}
          <Link
            href={`/export/${bookId}`}
            className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-slate-800 transition-colors"
          >Export</Link>
          <Link
            href={`/publish/${bookId}`}
            className="text-sm border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >Publish</Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chapter List */}
        <div className="w-60 bg-white border-r border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Chapters</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {chapters.map(ch => (
              <div
                key={ch.id}
                className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer group transition-colors ${
                  selectedId === ch.id
                    ? 'bg-blue-50 border-l-2 border-blue-600'
                    : 'hover:bg-slate-50 border-l-2 border-transparent'
                }`}
                onClick={() => {
                  saveNow()
                  setSelectedId(ch.id)
                  setChapterTitle(ch.title)
                  setContent(ch.content)
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selectedId === ch.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {ch.title}
                  </p>
                  <p className="text-xs text-slate-400">{ch.wordCount} words</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteChapter(ch.id) }}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all text-xl leading-none"
                  aria-label="Delete chapter"
                >×</button>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={addChapter}
              className="w-full text-sm text-slate-500 hover:text-blue-600 font-medium py-2 border border-dashed border-slate-300 rounded-lg hover:border-blue-400 transition-colors"
            >+ Add Chapter</button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedId ? (
            <>
              <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center gap-4 flex-shrink-0">
                <input
                  className="flex-1 text-2xl font-bold text-slate-900 focus:outline-none bg-transparent"
                  value={chapterTitle}
                  onChange={e => setChapterTitle(e.target.value)}
                  placeholder="Chapter Title"
                />
                <button
                  onClick={saveNow}
                  disabled={saving}
                  className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors disabled:opacity-50"
                >{saving ? 'Saving...' : 'Save'}</button>
              </div>
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <textarea
                  className="w-full h-full min-h-96 resize-none text-slate-800 text-base leading-relaxed focus:outline-none bg-transparent font-serif"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Start writing your chapter here..."
                />
              </div>
              <div className="bg-white border-t border-slate-100 px-8 py-2 flex-shrink-0">
                <WordCounter content={content} target={book?.targetWords} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              Select a chapter or create one to start writing
            </div>
          )}
        </div>

        {/* AI Panel */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">AI Assistant</h2>
            <div className="flex gap-1">
              {(['outline', 'continue', 'rewrite', 'summarize'] as AITab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAiTab(tab)}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors capitalize ${
                    aiTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{tab}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {aiOutput ? (
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiOutput}</div>
            ) : (
              <p className="text-sm text-slate-400">
                {aiTab === 'outline' && 'Generate a full chapter outline for your book.'}
                {aiTab === 'continue' && 'AI will continue writing from where you left off.'}
                {aiTab === 'rewrite' && 'AI will rewrite your current chapter content.'}
                {aiTab === 'summarize' && 'AI will summarize the current chapter.'}
              </p>
            )}
            {aiStreaming && (
              <span className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          <div className="p-4 border-t border-slate-100 space-y-2 flex-shrink-0">
            <button
              onClick={streamAI}
              disabled={aiStreaming || !selectedId}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{aiStreaming ? 'Generating...' : `Generate ${aiTab}`}</button>
            {aiOutput && !aiStreaming && (
              <button
                onClick={insertAiOutput}
                className="w-full border border-blue-200 text-blue-600 rounded-lg py-2 text-sm font-medium hover:bg-blue-50 transition-colors"
              >Insert into Editor</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
