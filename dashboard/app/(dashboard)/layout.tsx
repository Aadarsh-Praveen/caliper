"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, FlaskConical, BarChart2, Settings } from "lucide-react";

const NAV = [
  { label: "Dashboard",   href: "/dashboard",   icon: LayoutGrid,   disabled: false },
  { label: "Experiments", href: "/experiments", icon: FlaskConical, disabled: false },
  { label: "Metrics",     href: "/metrics",     icon: BarChart2,    disabled: false },
  { label: "Settings",    href: "/settings",    icon: Settings,     disabled: false },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]">

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col h-screen fixed left-0 top-0 w-64 bg-white border-r border-[#c2c6d6] py-6 px-4 z-50">
        {/* Branding */}
        <div className="flex items-center gap-3 mb-12 px-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#0b1c30] tracking-widest leading-tight">CALIPER</h2>
            <p className="text-[10px] uppercase tracking-widest text-[#0058be] font-bold">Analytics Engine</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ label, href, icon: Icon, disabled }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            if (disabled) {
              return (
                <div
                  key={label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#c2c6d6] cursor-not-allowed"
                  title="Coming soon"
                >
                  <Icon size={20} strokeWidth={1.5} />
                  {label}
                  <span className="ml-auto text-[10px] uppercase tracking-wider">soon</span>
                </div>
              );
            }
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                  active
                    ? "bg-[#0058be]/[0.08] text-[#0058be] font-semibold"
                    : "text-[#424754] hover:bg-[#eff4ff] hover:text-[#0058be]"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Top bar */}
      <header className="flex items-center px-8 sticky top-0 z-40 backdrop-blur-xl bg-[#f8f9ff]/80 w-full h-16 border-b border-[#c2c6d6] md:pl-[calc(256px+32px)]">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#727785] font-medium">Projects</span>
          <span className="text-[#c2c6d6] mx-1">/</span>
          <span className="text-[#0b1c30] font-semibold">Experimentation Suite</span>
        </div>
      </header>

      {/* Content */}
      <main className="md:ml-64 p-8 min-h-[calc(100vh-64px)]">
        {children}
      </main>
    </div>
  );
}
