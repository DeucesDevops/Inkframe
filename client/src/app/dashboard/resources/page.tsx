"use client"

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useState } from 'react'

export default function GlobalResourcesPage() {
    const [uploading, setUploading] = useState(false)

    const { data: projects, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const { data } = await api.get('/api/projects')
            return data
        }
    })

    if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Global Resources</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Overview of all ingested research across your projects.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Your Projects</h2>
                    <span className="text-xs text-slate-400">{projects?.length || 0} projects</span>
                </div>

                {!projects || projects.length === 0 ? (
                    <div className="px-8 py-20 text-center">
                        <div className="text-4xl mb-4">📁</div>
                        <p className="text-slate-500 text-sm italic">No projects yet. Create your first book to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {projects.map((project: any) => (
                            <div key={project.id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div>
                                    <p className="font-bold text-slate-900 text-sm">{project.title}</p>
                                    <p className="text-xs text-slate-400 mt-0.5 capitalize">{project.status}</p>
                                </div>
                                <div className="flex items-center space-x-6 text-xs text-slate-500">
                                    <div className="text-right">
                                        <div className="font-bold text-slate-700">{project._count?.chapters || 0}</div>
                                        <div className="text-slate-400">Chapters</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-slate-700">{project.wordCurrent?.toLocaleString() || 0}</div>
                                        <div className="text-slate-400">Words</div>
                                    </div>
                                    <a
                                        href={`/dashboard/project/${project.id}`}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                                    >
                                        Open →
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 space-y-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Quick Tips</h2>
                <div className="grid md:grid-cols-3 gap-4">
                    {[
                        { icon: '📄', title: 'Upload Research', desc: 'Go to a project → Resources tab to ingest PDFs, notes, and articles.' },
                        { icon: '🤖', title: 'Run AI Skills', desc: 'Use the Planning tab to run Market Analysis, Outline Builder, and more.' },
                        { icon: '✍️', title: 'Draft Chapters', desc: 'Switch to Writing & Editor to generate chapter drafts with AI Weaver.' },
                    ].map((tip) => (
                        <div key={tip.title} className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="text-2xl mb-3">{tip.icon}</div>
                            <h3 className="font-bold text-slate-800 text-sm mb-1">{tip.title}</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">{tip.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
