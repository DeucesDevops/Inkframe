"use client"

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useSkillStream } from '@/hooks/useSkillStream'

export default function ProjectDetailPage() {
    const { id } = useParams()
    const [activeTab, setActiveTab] = useState('planning')

    const { data: project, isLoading, refetch } = useQuery({
        queryKey: ['project', id],
        queryFn: async () => {
            const { data } = await api.get(`/api/projects/${id}`)
            return data
        }
    })

    if (isLoading) return <div className="p-8">Loading project details...</div>
    if (!project) return <div className="p-8 text-red-500">Project not found.</div>

    const tabs = [
        { id: 'planning', label: 'Planning' },
        { id: 'resources', label: 'Resources' },
        { id: 'writing', label: 'Writing & Editor' },
        { id: 'quality', label: 'Quality Control' }
    ]

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{project.title}</h1>
                    <p className="text-slate-500 text-sm mt-1">{project.subtitle || 'Book In-Progress'}</p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded-md font-bold uppercase tracking-widest">
                        {project.status}
                    </span>
                    <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block" />
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-slate-400">Current Progress</span>
                        <span className="text-sm font-bold text-slate-900">{project.wordCurrent} / {project.wordTarget} Words</span>
                    </div>
                </div>
            </div>

            <div className="flex space-x-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl min-h-[500px] shadow-sm overflow-hidden">
                {activeTab === 'planning' && <PlanningTab project={project} />}
                {activeTab === 'resources' && <ResourcesTab project={project} refetch={refetch} />}
                {activeTab === 'writing' && <WritingTab project={project} />}
                {activeTab === 'quality' && <QualityTab project={project} />}
            </div>
        </div>
    )
}

function PlanningTab({ project }: { project: any }) {
    return (
        <div className="p-10 space-y-10">
            <div className="grid md:grid-cols-2 gap-10">
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-900">Project Context</h3>
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-slate-600 text-sm">
                            "{project.niche}"
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-900">AI Planning Skills</h3>
                    <div className="grid grid-cols-1 gap-4">
                        {['Market Analysis', 'Title Generator', 'Reader Persona', 'Author Persona', 'Outline Builder'].map(skill => (
                            <button
                                key={skill}
                                className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all group"
                            >
                                <div className="flex flex-col text-left">
                                    <span className="text-sm font-bold text-slate-900">{skill}</span>
                                    <span className="text-xs text-slate-500">Run this to refine your book context</span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                                    →
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ResourcesTab({ project, refetch }: { project: any, refetch: () => void }) {
    const [uploading, setUploading] = useState(false)
    const [files, setFiles] = useState<FileList | null>(null)

    const handleUpload = async () => {
        if (!files || files.length === 0) return
        setUploading(true)

        const formData = new FormData()
        formData.append('projectId', project.id)
        Array.from(files).forEach(file => formData.append('files', file))

        try {
            await api.post('/api/skills/resource-ingestion', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            alert('Files uploaded and queued for processing!')
            setFiles(null)
            refetch()
        } catch (err) {
            alert('Upload failed')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="p-10 space-y-8">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Ingested Resources</h3>
                <label className="bg-slate-900 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors text-sm font-bold shadow-md">
                    {uploading ? 'Uploading...' : 'Upload Files'}
                    <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => {
                            setFiles(e.target.files)
                            if (e.target.files?.length) handleUpload()
                        }}
                    />
                </label>
            </div>

            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <th className="px-6 py-4">Source File</th>
                            <th className="px-6 py-4">Themes Identified</th>
                            <th className="px-6 py-4 text-right">Added On</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                        {!project.resources || project.resources.length === 0 ? (
                            <tr className="text-slate-400">
                                <td colSpan={3} className="px-6 py-20 text-center italic">No resources yet. Take the first step by uploading research docs.</td>
                            </tr>
                        ) : (
                            project.resources.map((res: any) => (
                                <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-900">{res.source}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-xs font-bold uppercase">{res.theme || 'Unknown'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-slate-400 tabular-nums">{new Date(res.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function WritingTab({ project }: { project: any }) {
    const { output, streaming, done, stream } = useSkillStream()
    const [selectedChapter, setSelectedChapter] = useState(1)

    const handleDraft = () => {
        stream('/api/skills/chapter-writer', {
            projectId: project.id,
            chapterNumber: selectedChapter,
            sectionIndex: 0
        })
    }

    return (
        <div className="flex h-full min-h-[700px]">
            <div className="w-72 border-r border-slate-100 bg-slate-50/50 p-6 space-y-8 flex flex-col">
                <div className="space-y-4 flex-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Table of Contents</h4>
                    <div className="space-y-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedChapter(i + 1)}
                                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${selectedChapter === i + 1
                                        ? 'bg-white text-blue-600 shadow-sm border border-slate-100'
                                        : 'hover:bg-white/60 text-slate-500'
                                    }`}
                            >
                                <span>Chapter {i + 1}</span>
                                {selectedChapter === i + 1 && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>Chapter Completion</span>
                        <span>0%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full w-0 bg-blue-600" />
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-white">
                <div className="h-20 border-b border-slate-100 px-10 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">Currently Editing</span>
                        <span className="text-base font-bold text-slate-900 truncate max-w-[300px]">Chapter {selectedChapter}: [Refining Title]</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            disabled={streaming}
                            onClick={handleDraft}
                            className="px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center space-x-2"
                        >
                            {streaming ? (
                                <>
                                    <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>AI Weaver Working...</span>
                                </>
                            ) : (
                                <>
                                    <span>★</span>
                                    <span>Draft with AI Weaver</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex-1 p-16 overflow-y-auto selection:bg-blue-100 selection:text-blue-900">
                    <div className="max-w-2xl mx-auto space-y-8 font-serif leading-relaxed text-xl text-slate-800">
                        {output ? (
                            <div className="whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-700">{output}</div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center space-y-4 py-20 opacity-30 select-none">
                                <div className="text-5xl">✎</div>
                                <div className="text-sm font-medium italic tracking-wide">The page is waiting for your collaborative spark...</div>
                            </div>
                        )}
                        {done && (
                            <div className="flex justify-center pt-20 pb-10">
                                <div className="h-1 w-20 bg-slate-100 rounded-full" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function QualityTab({ project }: { project: any }) {
    return (
        <div className="p-10 space-y-10">
            <div className="flex flex-col space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Quality Assurance</h3>
                <p className="text-slate-500 text-sm">Run automated audits to ensure your book remains consistent and professional.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="p-8 border border-slate-100 bg-slate-50/50 rounded-3xl space-y-4">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold mb-6">
                            🛡️
                        </div>
                        <h4 className="font-bold text-slate-900">Core Consistency Audit</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">Cross-references all written chapters against your defined niche and persona to detect drifts in logic or tone.</p>
                        <button className="w-full py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-600 hover:text-indigo-600 transition-all">
                            Run Context Audit
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="p-8 border border-slate-100 bg-slate-50/50 rounded-3xl space-y-4">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl font-bold mb-6">
                            📦
                        </div>
                        <h4 className="font-bold text-slate-900">Production Export</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">Package your project into professional formats including HTML, Markdown, or PDF (via skill queue).</p>
                        <div className="grid grid-cols-2 gap-3 pt-4">
                            <button className="py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all">PDF Export</button>
                            <button className="py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">Markdown</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
