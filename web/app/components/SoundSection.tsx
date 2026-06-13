"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Radio, Headphones, SlidersHorizontal } from "lucide-react";

const features = [
  {
    icon: Radio,
    title: "LDAC Streaming",
    desc: "Lossless 990 kbps transmission for studio-grade wireless fidelity.",
  },
  {
    icon: Headphones,
    title: "Spatial Audio",
    desc: "Head-tracked 360° soundfield with dynamic movement.",
  },
  {
    icon: SlidersHorizontal,
    title: "Custom EQ",
    desc: "5-band parametric EQ in the Caliper iOS and Android app.",
  },
];

const bands = [
  { label: "Sub-Bass", color: "#B8923A" },
  { label: "Bass",     color: "#E8C86A" },
  { label: "Mids",     color: "#6f48b2" },
  { label: "Presence", color: "#60a5fa" },
  { label: "Air",      color: "#34d399" },
];

export default function SoundSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="sound" ref={ref} className="py-28 px-6 bg-[#F5F3EE] overflow-hidden">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <span className="text-[#B8923A] text-[11px] font-semibold tracking-[0.22em] uppercase block mb-5">
            The Science of Sound
          </span>
          <h2
            className="font-display font-semibold text-[#111111] leading-tight mb-7"
            style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)" }}
          >
            Every frequency,
            <br />
            <em className="font-light text-[#AAAAAA]">faithfully reproduced.</em>
          </h2>
          <p className="text-[#666666] text-[15px] leading-relaxed">
            The 40mm titanium-coated driver covers 4 Hz to 40,000 Hz — ten times what the human
            ear can detect. We engineered past the audible range so everything within it is as
            clean and accurate as the original recording.
          </p>
        </motion.div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch mb-14">

          {/* Graph card */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="xl:col-span-8 bg-[#f7f3f1] p-8 md:p-12 rounded-3xl border border-black/[0.07] relative overflow-hidden"
          >
            {/* Live badge */}
            <div className="absolute top-8 right-8 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[#888888] text-[10px] font-semibold tracking-[0.18em] uppercase">
                Live Analysis: Arc Pro
              </span>
            </div>

            {/* Card header */}
            <div className="mb-10">
              <span className="text-[#B8923A] text-[10px] font-bold tracking-[0.22em] uppercase block mb-3">
                Acoustic Response Curve
              </span>
              <h3 className="font-display font-semibold text-[#111111] text-[1.5rem] leading-snug">
                4Hz — 40kHz Laboratory Profile
              </h3>
            </div>

            {/* SVG frequency graph */}
            <div className="relative mb-8" style={{ aspectRatio: "16/7" }}>
              <svg
                viewBox="0 0 1000 400"
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id="graph-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#B8923A" />
                    <stop offset="25%"  stopColor="#E8C86A" />
                    <stop offset="50%"  stopColor="#6f48b2" />
                    <stop offset="75%"  stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>

                {/* Grid */}
                <g opacity="0.10">
                  {[100, 200, 300].map((y) => (
                    <line key={y} x1="0" x2="1000" y1={y} y2={y}
                      stroke="#484740" strokeDasharray="4 4" />
                  ))}
                  {[200, 400, 600, 800].map((x) => (
                    <line key={x} x1={x} x2={x} y1="0" y2="400"
                      stroke="#484740" />
                  ))}
                </g>

                {/* Animated response curve */}
                <motion.path
                  d="M0,350 Q100,340 200,200 T400,180 T600,210 T800,150 T1000,100"
                  fill="none"
                  stroke="url(#graph-gradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={inView ? { pathLength: 1, opacity: 1 } : {}}
                  transition={{ duration: 1.8, delay: 0.4, ease: "easeOut" as const }}
                />
              </svg>

              {/* Frequency axis labels */}
              <div className="absolute bottom-0 left-0 w-full flex justify-between text-[9px] text-[#888888] font-semibold tracking-wider pt-3 border-t border-black/[0.06]">
                {["20Hz", "200Hz", "2kHz", "20kHz", "40kHz"].map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>

            {/* Band legend */}
            <div className="grid grid-cols-5 gap-2">
              {bands.map((b) => (
                <div key={b.label} className="text-center">
                  <div className="h-1 w-full rounded-full mb-2" style={{ background: b.color }} />
                  <span className="text-[8px] text-[#888888] font-bold tracking-wider uppercase">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Feature cards */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: 24 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.55, delay: 0.25 + i * 0.12 }}
                className="group flex-1 bg-white p-6 rounded-2xl border border-black/[0.07] hover:border-[#B8923A]/40 hover:shadow-md transition-all flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-[#B8923A]/10 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
                  <f.icon size={18} className="text-[#B8923A]" />
                </div>
                <div>
                  <h4 className="text-[#111111] font-semibold text-[15px] mb-1">{f.title}</h4>
                  <p className="text-[#666666] text-[13px] leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="flex justify-center"
        >
          <button
            onClick={() => document.querySelector("#technology")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-[#111111] text-[#F5F3EE] px-10 py-4 rounded-full text-[13px] font-semibold tracking-wide transition-all hover:scale-105 active:scale-95 hover:bg-[#333333]"
          >
            Explore Audio Technology
          </button>
        </motion.div>

      </div>
    </section>
  );
}
