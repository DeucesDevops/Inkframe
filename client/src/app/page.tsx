import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-50">
      <header className="px-4 lg:px-6 h-14 flex items-center border-b border-slate-800">
        <Link className="flex items-center justify-center font-bold text-xl tracking-tighter" href="/">
          Inkframe
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/login">
            Login
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4 border px-3 py-1 rounded-md bg-white text-black hover:bg-slate-200" href="/signup">
            Get Started
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">
                  Write Your Book with AI, Not By AI.
                </h1>
                <p className="mx-auto max-w-[700px] text-slate-400 md:text-xl">
                  Inject your knowledge, define your voice, and collaborate with specialized AI agents to write professional-grade nonfiction books in weeks, not years.
                </p>
              </div>
              <div className="space-x-4">
                <Link className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow transition-colors hover:bg-slate-200" href="/signup">
                  Start Your Book
                </Link>
                <Link className="inline-flex h-9 items-center justify-center rounded-md border border-slate-800 bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-900 hover:text-white" href="#features">
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="w-full py-12 md:py-24 lg:py-32 border-t border-slate-800">
          <div className="container px-4 md:px-6">
            <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-2 border p-6 rounded-xl border-slate-800 bg-slate-900/50">
                <h3 className="text-xl font-bold">Resource Ingestion</h3>
                <p className="text-sm text-slate-400">
                  Upload your research, notes, and transcripts. Our AI chunks and indexes everything for perfect contextual writing.
                </p>
              </div>
              <div className="space-y-2 border p-6 rounded-xl border-slate-800 bg-slate-900/50">
                <h3 className="text-xl font-bold">Voice Calibration</h3>
                <p className="text-sm text-slate-400">
                  Define your unique authorial voice. We ensure the AI writes in your tone, style, and vocabulary.
                </p>
              </div>
              <div className="space-y-2 border p-6 rounded-xl border-slate-800 bg-slate-900/50">
                <h3 className="text-xl font-bold">Collaborative Editor</h3>
                <p className="text-sm text-slate-400">
                  A writing interface designed for collaboration. Summon agents for fact-checking, consistency, or creative brainstorming.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-slate-800">
        <p className="text-xs text-slate-400">© 2026 Inkframe Inc. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}
