"use client"

import Link from 'next/link'
import StatusBadge from './StatusBadge'

interface Project {
  id: string
  title: string
  subtitle?: string
  genre?: string
  status: string
  wordTarget: number
  wordCurrent: number
  _count?: { chapters: number }
}

export default function BookCard({ book }: { book: Project }) {
  const totalWords = book.wordCurrent || 0
  const target = book.wordTarget || 50000
  const pct = Math.min(100, Math.round((totalWords / target) * 100))

  return (
    <Link
      href={`/editor/${book.id}`}
      className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl transition-all hover:-translate-y-1 group block"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
              {book.title}
            </h3>
            {book.subtitle && (
              <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">{book.subtitle}</p>
            )}
          </div>
          <StatusBadge status={book.status} />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
          {book.genre && <span className="uppercase tracking-wider">{book.genre}</span>}
          <span>{book._count?.chapters ?? 0} chapters</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-slate-600">
            <span>{totalWords.toLocaleString()} words</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">Goal: {target.toLocaleString()} words</p>
        </div>
      </div>
    </Link>
  )
}
