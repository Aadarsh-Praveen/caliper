"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShaderAnimation } from "./ShaderAnimation";

const HINT_DELAY_MS = 1200; // when "tap to enter" hint appears
const FADE_MS = 850;        // fade-out duration

export default function PageIntro() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (!visible) return;
    setVisible(false);
    timerRef.current = setTimeout(() => setMounted(false), FADE_MS + 100);
  }, [visible]);

  useEffect(() => {
    setMounted(true);

    const hintTimer = setTimeout(() => setShowHint(true), HINT_DELAY_MS);

    return () => {
      clearTimeout(hintTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: "easeInOut" }}
          onClick={dismiss}
          className="fixed inset-0 z-[200] overflow-hidden cursor-pointer select-none"
        >
          {/* Shader fills the screen */}
          <ShaderAnimation />

          {/* Dark vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.62) 100%)",
            }}
          />

          {/* Brand wordmark */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
            <motion.span
              initial={{ opacity: 0, letterSpacing: "0.35em", y: 10 }}
              animate={{ opacity: 1, letterSpacing: "0.22em", y: 0 }}
              transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
              className="font-display font-semibold text-white uppercase leading-none"
              style={{ fontSize: "clamp(3.5rem, 10vw, 9rem)" }}
            >
              CALIPER
            </motion.span>

            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.55, y: 0 }}
              transition={{ duration: 0.7, delay: 0.65, ease: "easeOut" }}
              className="text-white text-[13px] font-medium tracking-[0.30em] uppercase"
            >
              Sound, precisely measured.
            </motion.span>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.85, ease: "easeOut" }}
              className="h-px w-24 bg-gradient-to-r from-transparent via-[#E8C86A] to-transparent origin-center"
            />
          </div>

          {/* Tap-to-enter hint — pulses in at the bottom */}
          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute bottom-12 inset-x-0 flex flex-col items-center gap-3 pointer-events-none"
              >
                {/* Animated chevron */}
                <motion.div
                  animate={{ y: [0, 5, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-px h-8 bg-gradient-to-b from-transparent to-white/40" />
                  <svg width="12" height="7" viewBox="0 0 12 7" fill="none">
                    <path d="M1 1l5 5 5-5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>

                <span className="text-white/35 text-[11px] font-medium tracking-[0.28em] uppercase">
                  Tap anywhere to enter
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
