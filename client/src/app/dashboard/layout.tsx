"use client"

import { ReactNode } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/authStore'
import { useRouter } from 'next/navigation'

interface DashboardLayoutProps {
    children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const { user, logout } = useAuthStore()
    const router = useRouter()

    const handleLogout = () => {
        logout()
        router.push('/')
    }

    return (
        <div className="flex h-screen bg-slate-50">
            {/* Sidebar */}
            <div className="w-64 bg-slate-900 text-white flex flex-col">
                <div className="p-6">
                    <Link href="/dashboard" className="text-2xl font-bold tracking-tighter">
                        Inkframe
                    </Link>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    <Link href="/dashboard" className="block px-4 py-2 rounded-md hover:bg-slate-800 transition-colors">
                        Projects
                    </Link>
                    <Link href="/dashboard/new" className="block px-4 py-2 rounded-md hover:bg-slate-800 transition-colors text-blue-400">
                        + New Book
                    </Link>
                    <Link href="/dashboard/resources" className="block px-4 py-2 rounded-md hover:bg-slate-800 transition-colors">
                        Global Resources
                    </Link>
                </nav>

                <div className="p-4 border-t border-slate-800 mt-auto">
                    <div className="px-4 py-2 text-sm text-slate-400">
                        {user?.email}
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm rounded-md hover:bg-red-900/20 text-red-400 transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center justify-between px-8">
                    <h2 className="text-lg font-semibold text-slate-800">Dashboard</h2>
                    <div className="flex items-center space-x-4">
                        <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full uppercase tracking-wider">
                            {user?.plan || 'Starter'}
                        </span>
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
