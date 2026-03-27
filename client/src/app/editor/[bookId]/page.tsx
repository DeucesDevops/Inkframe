"use client"

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import WordCounter from '@/components/Editor/WordCounter'

interface Project {
  id: string
  title: string
  subtitle?: string
  genre?: string
  status: string
  wordTarget: number
  wordCurrent: number
}

interface Chapter {
  id: string
  projectId: string
  chapterNumber: number
  title: string
  status: string
  draftText?: string
  approvedText?: string
  wordCount: number
  confidenceScore?: number
  flags?: string[]
}

type AITab = 'outline' | 'continue' | 'rewrite' | 'summarize'

function useAutoSave(
  projectId: string,
  chapterNum: number | null,
  title: string,
  content: string,
  delay = 30000
) {
  const saved = useRef({ title, content })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (chapterNum === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      if (saved.current.title === title && saved.current.content === content) return
      await api.patch(`/api/projects/${projectId}/chapters/${chapterNum}`, { title, draftText: content })
      saved.current = { title, content }
    }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [projectId, chapterNum, title, content, delay])
}

export default function EditorPage() {
  const { bookId: projectId } = useParams<{ bookId: string }>()

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get(`/api/projects/${projectId}`)).data,
  })

  const { data: chapters = [], refetch: refetchChapters } = useQuery<Chapter[]>({
    queryKey: ['chapters', projectId],
    queryFn: async () => (await api.get(`/api/projects/${projectId}/chapters`)).data,
  })

  const [selectedNum, setSelectedNum] = useState<number | null>(null)
  const [chapterTitle, setChapterTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiTab, setAiTab] = useState<AITab>('continue')
  const [aiOutput, setAiOutput] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)

  const selected = chapters.find(c => c.chapterNumber === selectedNum)

  // Auto-select the first chapter on initial load
  useEffect(() => {
    if (chapters.length > 0 && selectedNum === null) {
      const first = chapters[0]
      setSelectedNum(first.chapterNumber)
      setChapterTitle(first.title)
      setContent(first.draftText || '')
    }
  }, [chapters, selectedNum])

  // Sync editor fields when selected chapter changes
  useEffect(() => {
    if (selected) {
      setChapterTitle(selected.title)
      setContent(selected.draftText || '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.chapterNumber])

  useAutoSave(projectId, selectedNum, chapterTitle, content)

  async function saveNow() {
    if (selectedNum === null) return
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/chapters/${selectedNum}`, { title: chapterTitle, draftText: content })
      await refetchChapters()
    } finally {
      setSaving(false)
    }
  }

  async function addChapter() {
    // Current backend doesn't have a POST /api/projects/:id/chapters
    // but we can update project context. For now, let's assume chapter 1-N exists.
    alert('Please use the Outline Generator to create chapters first.')
  }

  async function deleteChapter(num: number) {
    alert('Chapter deletion is currently handled via the outline manager.')
  }

  async function streamAI() {
    if (selectedNum === null || aiStreaming) return
    setAiStreaming(true)
    setAiOutput('')

    let endpoint = ''
    let body: Record<string, any> = {}

    if (aiTab === 'continue') {
      endpoint = '/api/skills/chapter-writer'
      body = { projectId, chapterNumber: selectedNum, sectionIndex: 0 }
    } else {
      // Fallback to old AI routes for other tabs until they are migrated to skills
      if (aiTab === 'outline') endpoint = '/api/ai/outline'
      else if (aiTab === 'rewrite') endpoint = '/api/ai/rewrite'
      else endpoint = '/api/ai/summarize'
      body = { title: project?.title, existingContent: content, selectedText: content, chapterTitle }
    }

    try {
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
            if (payload === '[DONE]' || payload.includes('"done":true')) break
            try {
              const { text: chunk } = JSON.parse(payload)
              if (chunk) setAiOutput(prev => prev + chunk)
            } catch { /* skip malformed SSE frames */ }
          }
        }
      }
      // Refresh chapters to get the persisted draft
      await refetchChapters()
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
          <h1 className="text-lg font-bold text-slate-900 truncate">{project?.title}</h1>
          <p className="text-xs text-slate-400">{totalWords.toLocaleString()} total words</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {project?.status && <StatusBadge status={project.status} />}
          <Link
            href={`/export/${projectId}`}
            className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-slate-800 transition-colors"
          >Export</Link>
          <Link
            href={`/publish/${projectId}`}
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
                  selectedNum === ch.chapterNumber
                    ? 'bg-blue-50 border-l-2 border-blue-600'
                    : 'hover:bg-slate-50 border-l-2 border-transparent'
                }`}
                onClick={() => {
                  saveNow()
                  setSelectedNum(ch.chapterNumber)
                  setChapterTitle(ch.title)
                  setContent(ch.draftText || '')
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selectedNum === ch.chapterNumber ? 'text-blue-700' : 'text-slate-700'}`}>
                    {ch.title}
                  </p>
                  <p className="text-xs text-slate-400">{ch.wordCount} words</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteChapter(ch.chapterNumber) }}
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
          {selectedNum !== null ? (
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
                <WordCounter content={content} target={project?.wordTarget} />
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
              disabled={aiStreaming || selectedNum === null}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{aiStreaming ? 'Generating...' : `Generate ${aiTab}`}</button>
            {aiOutput && !aiStreaming && (
              <button
                onClick={insertAiOutput}
                className="w-full border border-blue-200 text-blue-600 rounded-lg py-2 text-sm font-medium hover:bg-blue-50 transition-colors"
              >Insert into Editor</button>
            )}
            
            {selected?.confidenceScore && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase">AI Confidence</span>
                  <span className={`text-xs font-bold ${selected.confidenceScore > 0.8 ? 'text-green-600' : 'text-amber-600'}`}>
                    {(selected.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                {selected.flags && selected.flags.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Flags:</p>
                    {selected.flags.map((flag, i) => (
                      <p key={i} className="text-xs text-slate-600 flex gap-2">
                        <span className="text-amber-500">⚠</span> {flag}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
