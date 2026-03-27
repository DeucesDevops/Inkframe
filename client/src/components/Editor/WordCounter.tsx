"use client"

export default function WordCounter({ content, target }: { content: string; target?: number }) {
  const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length
  const pct = target ? Math.min(100, Math.round((words / target) * 100)) : null

  return (
    <div className="flex items-center gap-3 text-xs text-slate-400 select-none">
      <span><span className="font-semibold text-slate-600">{words.toLocaleString()}</span> words</span>
      {pct !== null && (
        <span className="text-slate-300">/ {target?.toLocaleString()} goal ({pct}%)</span>
      )}
    </div>
  )
}
