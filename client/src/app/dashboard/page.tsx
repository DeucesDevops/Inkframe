"use client"

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import Link from 'next/link'

interface Project {
    id: string
    title: string
    subtitle: string
    status: string
    wordTarget: number
    wordCurrent: number
    updatedAt: string
    _count: { chapters: number }
}

export default function DashboardPage() {
    const { data: projects, isLoading, error } = useQuery<Project[]>({
        queryKey: ['projects'],
        queryFn: async () => {
            const { data } = await api.get('/api/projects')
            return data
        }
    })

    if (isLoading) return <div className="p-8">Loading projects...</div>
    if (error) return <div className="p-8 text-red-500">Error loading projects. Please try again.</div>

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your Projects</h1>
                <Link
                    href="/dashboard/new"
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-sm"
                >
                    Create New Book
                </Link>
            </div>

            {projects?.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-20 flex flex-col items-center justify-center space-y-4">
                    <div className="text-slate-400 text-lg">No projects found.</div>
                    <Link
                        href="/dashboard/new"
                        className="text-blue-600 font-semibold hover:underline"
                    >
                        Start your first book today
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {projects?.map((project) => (
                        <Link
                            key={project.id}
                            href={`/dashboard/project/${project.id}`}
                            className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl transition-all hover:-translate-y-1 group"
                        >
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                        {project.title}
                                    </h3>
                                    <p className="text-sm text-slate-500 line-clamp-1">{project.subtitle || 'No subtitle'}</p>
                                </div>

                                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-400">
                                    <span>{project._count.chapters} Chapters</span>
                                    <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-600">
                                        {project.status === 'intake' ? 'Planning' : project.status}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                        <span>Progress</span>
                                        <span>{Math.round((project.wordCurrent / project.wordTarget) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="bg-blue-600 h-full transition-all duration-500 ease-out"
                                            style={{ width: `${Math.min(100, (project.wordCurrent / project.wordTarget) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
