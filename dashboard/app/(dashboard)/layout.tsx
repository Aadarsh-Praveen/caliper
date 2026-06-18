import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0E0E0E] text-[#F5F3EE]">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] shrink-0">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-[#F5F3EE]">
            Caliper
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[#888888]">
            <Link href="/experiments" className="hover:text-[#F5F3EE] transition-colors">
              Experiments
            </Link>
          </nav>
        </div>
        <span className="text-xs text-[#888888] border border-[#2A2A2A] px-2 py-1 rounded">
          demo workspace
        </span>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
