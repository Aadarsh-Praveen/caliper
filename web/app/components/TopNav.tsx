"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useCaliperVariant } from "@/lib/caliper/useCaliperVariant";
import { EXPERIMENTS } from "@/lib/caliper/experiments";
import { caliper } from "@/lib/caliper/sdk";

const links = [
  { label: "Products",   href: "#products"   },
  { label: "Technology", href: "#technology" },
  { label: "Story",      href: "#story"      },
  { label: "Support",    href: "#support"    },
];

/** Animated hamburger → X toggle */
function MenuToggle({ open, onToggle, light }: { open: boolean; onToggle: () => void; light: boolean }) {
  const color = light ? "#ffffff" : "#111111";
  return (
    <button
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors md:hidden"
      style={{ color }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <motion.line
          x1="3" y1="7" x2="19" y2="7"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          animate={open ? { x1: 4, y1: 4, x2: 18, y2: 18 } : { x1: 3, y1: 7, x2: 19, y2: 7 }}
          transition={{ duration: 0.25 }}
        />
        <motion.line
          x1="3" y1="11" x2="19" y2="11"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          animate={open ? { opacity: 0, x2: 11 } : { opacity: 1, x2: 19 }}
          transition={{ duration: 0.2 }}
        />
        <motion.line
          x1="3" y1="15" x2="19" y2="15"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          animate={open ? { x1: 4, y1: 18, x2: 18, y2: 4 } : { x1: 3, y1: 15, x2: 19, y2: 15 }}
          transition={{ duration: 0.25 }}
        />
      </svg>
    </button>
  );
}

export default function TopNav() {
  const [scrolled, setScrolled]   = useState(false);
  const [open, setOpen]           = useState(false);
  const [cartCount, setCartCount] = useState(0);

  const { variant: navVariant } = useCaliperVariant(EXPERIMENTS.NAV_LAYOUT);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("caliper:add-to-cart", () => setCartCount((n) => n + 1));

    // Track page view once on mount
    void caliper.track("page_view", { path: window.location.pathname });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  };

  const handleBuyNow = () => {
    void caliper.track("nav_cta_click", { location: "top_nav" });
    scrollTo("#buy");
  };

  const light = !scrolled;

  // nav_layout_test:
  // Control   → cart icon hidden when empty
  // Treatment → cart icon always visible (current behavior)
  const showCartIcon = navVariant === "treatment" || cartCount > 0;

  return (
    <>
      {/* ── Nav bar ── */}
      <motion.nav
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#F5F3EE]/92 backdrop-blur-xl border-b border-black/[0.07] py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">

          {/* Logo */}
          <a
            href="/"
            className={`font-display font-semibold text-xl tracking-[0.18em] uppercase transition-colors duration-300 ${
              light ? "text-white" : "text-[#111111]"
            }`}
          >
            Caliper
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.href)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium tracking-wide transition-all duration-200 ${
                  light
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-[#555555] hover:text-[#111111] hover:bg-black/[0.05]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Cart — visibility controlled by nav_layout_test */}
            {showCartIcon && (
              <button
                aria-label="Cart"
                className={`relative p-2 rounded-lg transition-colors duration-200 ${
                  light
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-[#555555] hover:text-[#111111] hover:bg-black/[0.05]"
                }`}
              >
                <ShoppingBag size={18} />
                {cartCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#B8923A] rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            )}

            {/* Buy Now — desktop */}
            <button
              onClick={handleBuyNow}
              className={`hidden md:inline-flex items-center text-[13px] font-semibold px-5 py-2.5 rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-95 ${
                light
                  ? "bg-white text-[#111111] hover:bg-white/90"
                  : "bg-[#111111] text-[#F5F3EE] hover:bg-[#333333]"
              }`}
            >
              Buy Now
            </button>

            {/* Hamburger — mobile */}
            <MenuToggle open={open} onToggle={() => setOpen(!open)} light={light} />
          </div>
        </div>
      </motion.nav>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            />

            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-[#F5F3EE] flex flex-col md:hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 h-[64px] border-b border-black/[0.06]">
                <span className="font-display font-semibold text-[#111111] text-lg tracking-[0.18em] uppercase">
                  Caliper
                </span>
                <MenuToggle open={open} onToggle={() => setOpen(false)} light={false} />
              </div>

              <nav className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-1">
                {links.map((l, i) => (
                  <motion.button
                    key={l.label}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + i * 0.05, duration: 0.28 }}
                    onClick={() => scrollTo(l.href)}
                    className="text-left w-full px-4 py-3 rounded-xl text-[#333333] hover:text-[#111111] hover:bg-black/[0.05] font-medium text-[15px] transition-colors"
                  >
                    {l.label}
                  </motion.button>
                ))}
              </nav>

              <div className="px-4 pb-8 pt-4 border-t border-black/[0.06]">
                <button
                  onClick={handleBuyNow}
                  className="w-full bg-[#111111] text-[#F5F3EE] font-semibold py-3.5 rounded-2xl text-[14px] hover:bg-[#333333] transition-colors active:scale-[0.98]"
                >
                  Buy Now — $349
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
