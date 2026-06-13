"use client";

const cols = {
  Product:  ["Arc Pro", "Arc Standard", "Arc Mini", "Accessories"],
  Support:  ["Setup Guide", "Warranty", "Contact", "FAQ"],
  Company:  ["Our Story", "Careers", "Press", "Investors"],
  Legal:    ["Privacy", "Terms", "Cookies", "Sitemap"],
};

export default function Footer() {
  return (
    <footer id="support" className="w-full bg-[#0C0C0C] border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-10">

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-y-14 gap-x-6 mb-20">

          {/* Brand column */}
          <div className="lg:col-span-4">
            <div className="font-display font-semibold text-2xl tracking-[0.18em] uppercase text-white mb-6">
              CALIPER
            </div>
            <p className="text-white/50 text-[14px] leading-relaxed max-w-xs">
              Sound, precisely measured. Built for those who refuse to compromise.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(cols).map(([group, items]) => (
            <div key={group} className="lg:col-span-2">
              <p className="text-[#E8C86A] text-[10px] font-bold tracking-[0.22em] uppercase mb-7">
                {group}
              </p>
              <ul className="flex flex-col gap-4">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-white/40 hover:text-white text-[13px] transition-colors duration-200"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/20 text-[12px]">
            © {new Date().getFullYear()} Caliper Audio, Inc. All rights reserved.
          </p>
          <div className="flex gap-8">
            {["Twitter", "Instagram", "YouTube"].map((s) => (
              <a
                key={s}
                href="#"
                className="text-white/40 hover:text-white text-[12px] transition-colors duration-200"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
