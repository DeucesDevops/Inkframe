"use client"

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  WRITING: 'bg-blue-100 text-blue-700',
  EDITING: 'bg-yellow-100 text-yellow-700',
  READY: 'bg-green-100 text-green-700',
  PUBLISHED: 'bg-purple-100 text-purple-700',
  PENDING: 'bg-slate-100 text-slate-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  COMPLETE: 'bg-green-100 text-green-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
