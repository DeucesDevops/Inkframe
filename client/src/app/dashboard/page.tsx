"use client"

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import BookCard from '@/components/BookCard'
import BookModal from '@/components/BookModal'

interface Book {
  id: string
  title: string
  subtitle?: string
  genre?: string
  status: string
  targetWords?: number
  _count: { chapters: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

  const { data: books = [], isLoading, error } = useQuery<Book[]>({
    queryKey: ['books'],
    queryFn: async () => (await api.get('/api/books')).data,
  })

  if (isLoading) return <div className="p-8 text-slate-500">Loading books...</div>
  if (error) return <div className="p-8 text-red-500">Error loading books. Please try again.</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your Books</h1>
          <p className="text-slate-500 mt-1">{books.length} book{books.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-sm"
        >+ New Book</button>
      </div>

      {books.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-20 flex flex-col items-center justify-center space-y-4">
          <div className="text-5xl">📚</div>
          <div className="text-slate-500 text-lg font-medium">No books yet</div>
          <button
            onClick={() => setShowModal(true)}
            className="text-blue-600 font-semibold hover:underline"
          >Start your first book today</button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {books.map(book => <BookCard key={book.id} book={book} />)}
        </div>
      )}

      <BookModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={book => router.push(`/editor/${book.id}`)}
      />
    </div>
  )
}
