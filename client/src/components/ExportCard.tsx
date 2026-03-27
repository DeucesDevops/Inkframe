"use client"

interface Props {
  icon: string
  title: string
  subtitle: string
  description: string
  onExport: () => void
  loading?: boolean
}

export default function ExportCard({ icon, title, subtitle, description, onExport, loading }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4">
      <div className="text-4xl">{icon}</div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
        <p className="text-sm font-medium text-blue-600">{subtitle}</p>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <button
        onClick={onExport}
        disabled={loading}
        className="mt-auto bg-slate-900 text-white rounded-lg py-2 px-4 font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Queued...' : title.includes('Audio') ? 'Generate' : 'Export'}
      </button>
    </div>
  )
}
