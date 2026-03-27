"use client"

import StatusBadge from './StatusBadge'

interface ExportRecord {
  id: string
  format: string
  status: string
  createdAt: string
  s3Key?: string
}

interface Props {
  exports: ExportRecord[]
  onDownload: (id: string) => void
}

export default function ExportHistory({ exports, onDownload }: Props) {
  if (exports.length === 0) {
    return <p className="text-slate-400 text-sm">No exports yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="pb-2 font-medium">Format</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Created</th>
            <th className="pb-2 font-medium">Download</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {exports.map(e => (
            <tr key={e.id}>
              <td className="py-3 font-medium text-slate-800">{e.format}</td>
              <td className="py-3"><StatusBadge status={e.status} /></td>
              <td className="py-3 text-slate-500">{new Date(e.createdAt).toLocaleDateString()}</td>
              <td className="py-3">
                {e.status === 'DONE' && e.s3Key ? (
                  <button
                    onClick={() => onDownload(e.id)}
                    className="text-blue-600 hover:underline font-medium"
                  >Download</button>
                ) : <span className="text-slate-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
