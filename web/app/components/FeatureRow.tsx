"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BatteryFull, Radio, Headphones, Zap } from "lucide-react";

export default function FeatureRow() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const base = {
    initial: { opacity: 0, y: 28 },
    animate: inView ? { opacity: 1, y: 0 } : {},
  };

  return (
    <section id="technology" ref={ref} className="bg-[#f7f3f1] py-28 px-6">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <div className="w-12 h-px bg-[#B8923A] mb-4" />
          <span className="text-[#B8923A] text-[11px] font-semibold tracking-[0.22em] uppercase">
            Engineering
          </span>
          <h2
            className="font-display font-semibold italic text-[#111111] leading-tight mt-5"
            style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)" }}
          >
            No compromises,<br />anywhere.
          </h2>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

          {/* Hero card — Battery (8 cols) */}
          <motion.div
            {...base}
            transition={{ duration: 0.6, delay: 0.1 }}
            whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
            className="group md:col-span-8 bg-white rounded-2xl p-10 md:p-14 flex flex-col justify-between relative overflow-hidden cursor-default border border-black/[0.06] hover:border-[#B8923A]/30 transition-colors duration-300"
            style={{ minHeight: "320px" }}
          >
            {/* Content */}
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-[#B8923A]/10 flex items-center justify-center mb-10">
                <BatteryFull size={24} className="text-[#B8923A]" />
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-display font-semibold text-[#111111] leading-none" style={{ fontSize: "clamp(3rem, 6vw, 4.5rem)" }}>
                  40
                </span>
                <span className="text-[#B8923A] font-bold text-[14px] uppercase tracking-widest">HRS</span>
              </div>
              <h3 className="text-[#111111] font-semibold text-[18px] mb-4">All-Day Battery</h3>
              <p className="text-[#666666] text-[14px] leading-relaxed max-w-md">
                Play from sunrise to past midnight on one charge. Precision-engineered power management ensures maximum efficiency with ANC active at 70% volume.
              </p>
            </div>
            {/* Atmospheric ghost icon */}
            <Zap
              size={260}
              className="absolute -right-8 -bottom-8 text-[#B8923A] opacity-[0.04] group-hover:opacity-[0.07] transition-opacity duration-700 pointer-events-none"
              strokeWidth={1}
            />
          </motion.div>

          {/* ANC card (4 cols) */}
          <motion.div
            {...base}
            transition={{ duration: 0.6, delay: 0.18 }}
            whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
            className="md:col-span-4 bg-white rounded-2xl p-10 flex flex-col cursor-default border border-black/[0.06] hover:border-[#B8923A]/30 transition-colors duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-[#B8923A]/10 flex items-center justify-center mb-8">
              <Radio size={20} className="text-[#B8923A]" />
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display font-semibold text-[#111111] leading-none" style={{ fontSize: "clamp(2.4rem, 4vw, 3.2rem)" }}>
                −35
              </span>
              <span className="text-[#B8923A] font-bold text-[13px] uppercase tracking-widest">dB</span>
            </div>
            <h3 className="text-[#111111] font-semibold text-[16px] mb-3">Adaptive ANC Pro</h3>
            <p className="text-[#666666] text-[13px] leading-relaxed">
              Four microphones continuously measure and cancel ambient noise in real time, creating an acoustic sanctuary.
            </p>
          </motion.div>

          {/* Hi-Res card (4 cols) */}
          <motion.div
            {...base}
            transition={{ duration: 0.6, delay: 0.26 }}
            whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
            className="md:col-span-4 bg-white rounded-2xl p-10 flex flex-col cursor-default border border-black/[0.06] hover:border-[#B8923A]/30 transition-colors duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-[#B8923A]/10 flex items-center justify-center mb-8">
              <Headphones size={20} className="text-[#B8923A]" />
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display font-semibold text-[#111111] leading-none" style={{ fontSize: "clamp(2.4rem, 4vw, 3.2rem)" }}>
                40K
              </span>
              <span className="text-[#B8923A] font-bold text-[13px] uppercase tracking-widest">Hz</span>
            </div>
            <h3 className="text-[#111111] font-semibold text-[16px] mb-3">Hi-Res Certified</h3>
            <p className="text-[#666666] text-[13px] leading-relaxed">
              Titanium-coated drivers reach 40,000 Hz — twice the range of standard headphones for surgical precision.
            </p>
          </motion.div>

          {/* Quick Charge card — horizontal (8 cols) */}
          <motion.div
            {...base}
            transition={{ duration: 0.6, delay: 0.34 }}
            whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
            className="md:col-span-8 bg-white rounded-2xl p-10 flex flex-col sm:flex-row sm:items-center gap-8 cursor-default border border-black/[0.06] hover:border-[#B8923A]/30 transition-colors duration-300"
          >
            <div className="w-20 h-20 rounded-full bg-[#B8923A]/10 flex items-center justify-center shrink-0">
              <Zap size={28} className="text-[#B8923A]" />
            </div>
            <div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-display font-semibold text-[#111111] leading-none" style={{ fontSize: "clamp(2.4rem, 4vw, 3.2rem)" }}>
                  5
                </span>
                <span className="text-[#B8923A] font-bold text-[13px] uppercase tracking-widest">MIN</span>
              </div>
              <h3 className="text-[#111111] font-semibold text-[16px] mb-3">Quick Charge</h3>
              <p className="text-[#666666] text-[13px] leading-relaxed max-w-sm">
                Five minutes of charging gives three hours of playback. Never lose your rhythm when the moment strikes.
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
