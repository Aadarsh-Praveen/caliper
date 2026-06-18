import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0E0E0E] text-[#F5F3EE]">
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#2A2A2A]">
        <span className="text-xl font-semibold tracking-tight">Caliper</span>
        <nav className="flex items-center gap-6 text-sm text-[#888888]">
          <Link href="/experiments" className="hover:text-[#F5F3EE] transition-colors">
            Dashboard
          </Link>
          <Link
            href="#"
            className="bg-[#B8923A] text-[#0E0E0E] font-medium px-4 py-1.5 rounded hover:bg-[#a07d32] transition-colors"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-8">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-[#B8923A] mb-4 font-medium">
            B2B Experimentation Platform
          </p>
          <h1 className="text-5xl font-bold leading-tight tracking-tight mb-6">
            Statistical rigor
            <br />
            <span className="text-[#B8923A]">without the price tag.</span>
          </h1>
          <p className="text-[#888888] text-lg leading-relaxed mb-10">
            Run A/B experiments with confidence. Caliper gives you two-proportion z-tests,
            sticky bucketing, live p-values, and SRM detection — all in one lightweight
            platform built for teams that care about getting it right.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/experiments"
              className="bg-[#B8923A] text-[#0E0E0E] font-semibold px-6 py-3 rounded hover:bg-[#a07d32] transition-colors"
            >
              Try the demo
            </Link>
            <Link
              href="#"
              className="border border-[#2A2A2A] text-[#F5F3EE] font-medium px-6 py-3 rounded hover:border-[#888888] transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-12 mt-4">
          {[
            { label: "Sticky bucketing", value: "cyrb53" },
            { label: "Statistical test", value: "z-test" },
            { label: "CI level", value: "95%" },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-[#B8923A]">{value}</div>
              <div className="text-xs text-[#888888] mt-1 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="flex items-center justify-between px-8 py-5 border-t border-[#2A2A2A] text-xs text-[#888888]">
        <span>Built for AWS H0 Hackathon</span>
        <a
          href="https://github.com"
          className="hover:text-[#F5F3EE] transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
