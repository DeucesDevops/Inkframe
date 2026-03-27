"use client"

interface ChecklistItem {
  item: string
  done: boolean
}

interface Props {
  checklist: ChecklistItem[]
  totalWords: number
  chapterCount: number
}

export default function PublishChecklist({ checklist, totalWords, chapterCount }: Props) {
  const doneCount = checklist.filter(c => c.done).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-sm font-semibold text-slate-700">
          {doneCount}/{checklist.length} complete
        </div>
        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-green-500 h-full rounded-full transition-all"
            style={{ width: `${Math.round((doneCount / checklist.length) * 100)}%` }}
          />
        </div>
      </div>
      {checklist.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-green-500' : 'bg-slate-200'}`}>
            {item.done && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className={`text-sm ${item.done ? 'text-slate-700' : 'text-slate-400'}`}>{item.item}</span>
        </div>
      ))}
      <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500">
        <span className="font-medium text-slate-700">{totalWords.toLocaleString()}</span> words across{' '}
        <span className="font-medium text-slate-700">{chapterCount}</span> chapters
      </div>
    </div>
  )
}
