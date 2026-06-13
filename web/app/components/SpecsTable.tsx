"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Warp } from "@paper-design/shaders-react";

const specs = [
  {
    category: "Acoustic Architecture",
    shader: {
      shape: "checks" as const,
      colors: ["hsl(38, 85%, 18%)", "hsl(45, 95%, 48%)", "hsl(32, 80%, 30%)", "hsl(50, 90%, 62%)"],
      proportion: 0.32, softness: 0.9, distortion: 0.14, swirl: 0.65,
      swirlIterations: 9, shapeScale: 0.09, speed: 0.5,
    },
    items: [
      { label: "Frequency Response", value: "4 – 40,000 Hz" },
      { label: "Harmonic Distortion", value: "< 0.05% THD" },
      { label: "Driver Unit",         value: "40mm Titanium" },
      { label: "Impedance",           value: "32 Ω" },
      { label: "Sensitivity",         value: "103 dB SPL/mW" },
    ],
  },
  {
    category: "Connectivity",
    shader: {
      shape: "stripes" as const,
      colors: ["hsl(38, 70%, 16%)", "hsl(44, 88%, 44%)", "hsl(255, 55%, 28%)", "hsl(46, 92%, 60%)"],
      proportion: 0.42, softness: 1.1, distortion: 0.20, swirl: 0.88,
      swirlIterations: 13, shapeScale: 0.11, speed: 0.55,
    },
    items: [
      { label: "Wireless Protocol", value: "Bluetooth 5.4" },
      { label: "Hi-Res Codecs",     value: "LDAC · aptX HD · AAC" },
      { label: "Latency",           value: "40 ms" },
      { label: "Multipoint",        value: "3-device simultaneous" },
      { label: "NFC",               value: "One-tap pairing" },
    ],
  },
  {
    category: "Endurance",
    shader: {
      shape: "checks" as const,
      colors: ["hsl(26, 88%, 20%)", "hsl(40, 100%, 52%)", "hsl(35, 82%, 36%)", "hsl(48, 94%, 66%)"],
      proportion: 0.38, softness: 0.85, distortion: 0.17, swirl: 0.72,
      swirlIterations: 10, shapeScale: 0.10, speed: 0.6,
    },
    items: [
      { label: "Total Playback",   value: "40 hours" },
      { label: "Rapid Recovery",   value: "5 min → 3 hours" },
      { label: "Standby Time",     value: "400 hours" },
      { label: "Charging",         value: "USB-C PD 3.0" },
      { label: "Full Charge",      value: "< 2 hours" },
    ],
  },
  {
    category: "Physical",
    shader: {
      shape: "stripes" as const,
      colors: ["hsl(36, 72%, 16%)", "hsl(42, 82%, 42%)", "hsl(30, 68%, 26%)", "hsl(50, 88%, 58%)"],
      proportion: 0.44, softness: 1.05, distortion: 0.18, swirl: 0.78,
      swirlIterations: 11, shapeScale: 0.12, speed: 0.45,
    },
    swatches: ["#111111", "#F0EDE8"],
    items: [
      { label: "Mass",               value: "248 g" },
      { label: "Ingress Protection", value: "IPX4" },
      { label: "Materials",          value: "Aerospace aluminum" },
      { label: "Ear Cushions",       value: "Protein leather" },
      { label: "Foldable",           value: "Flat & vertical" },
    ],
  },
];

export default function SpecsTable() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="relative bg-[#f0ede4] py-28 px-6 overflow-hidden" ref={ref}>
      {/* Subtle ambient glow */}
      <div
        className="absolute -right-24 top-1/3 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(184,146,58,0.10) 0%, transparent 70%)",
          filter: "blur(56px)",
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <div className="w-12 h-px bg-[#B8923A] mb-4" />
          <span className="text-[#B8923A] text-[11px] font-semibold tracking-[0.22em] uppercase">
            Specifications
          </span>
          <h2
            className="font-display font-semibold text-[#111111] leading-tight mt-5"
            style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)" }}
          >
            Every number
            <br />
            <em className="text-[#B8923A]">tells a story.</em>
          </h2>
        </motion.div>

        {/* Shader spec cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {specs.map((s, i) => (
            <motion.div
              key={s.category}
              initial={{ opacity: 0, y: 32 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              whileHover={{
                y: -10,
                transition: { duration: 0.25, ease: "easeOut" },
              }}
              className="group relative rounded-2xl overflow-hidden cursor-default min-h-[360px] flex flex-col"
            >
              {/* Warp shader background */}
              <div className="absolute inset-0">
                <Warp
                  style={{ width: "100%", height: "100%" }}
                  shape={s.shader.shape}
                  colors={s.shader.colors}
                  proportion={s.shader.proportion}
                  softness={s.shader.softness}
                  distortion={s.shader.distortion}
                  swirl={s.shader.swirl}
                  swirlIterations={s.shader.swirlIterations}
                  shapeScale={s.shader.shapeScale}
                  scale={1}
                  rotation={0}
                  speed={s.shader.speed}
                />
              </div>

              {/* Dark overlay — lifts slightly on hover */}
              <div className="absolute inset-0 bg-black/62 group-hover:bg-black/50 transition-colors duration-400" />

              {/* Gold top sweep on hover */}
              <div className="absolute top-0 left-0 h-[2px] w-0 group-hover:w-full bg-gradient-to-r from-[#B8923A] via-[#E8C86A] to-[#B8923A] transition-[width] duration-[420ms] ease-out" />

              {/* Card content */}
              <div className="relative z-10 p-6 flex flex-col gap-5 flex-1 border border-white/10 rounded-2xl group-hover:border-[#B8923A]/40 transition-colors duration-300">

                {/* Category */}
                <span className="text-[#E8C86A] text-[10px] font-bold tracking-[0.28em] uppercase">
                  {s.category}
                </span>

                {/* Spec rows */}
                <div className="flex flex-col gap-3.5 flex-1">
                  {s.items.map((item) => (
                    <div key={item.label} className="flex flex-col gap-0.5">
                      <span className="text-white/75 text-[12px] font-medium">{item.label}</span>
                      <span className="text-white text-[14px] font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Swatches (Physical card) */}
                {s.swatches && (
                  <div className="pt-3 border-t border-white/10">
                    <span className="text-white/75 text-[11px] font-medium block mb-2">Finishes</span>
                    <div className="flex gap-2">
                      {s.swatches.map((color, k) => (
                        <div
                          key={color}
                          className="w-5 h-5 rounded-full border border-white/20 transition-transform duration-200 group-hover:scale-125"
                          style={{ background: color, transitionDelay: `${k * 60}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Download link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.65 }}
          className="mt-10 text-center"
        >
          <a
            href="#"
            className="text-[#666666] hover:text-[#111111] text-[13px] font-medium border-b border-[#888888] hover:border-[#111111] pb-0.5 transition-colors"
          >
            Download detailed architecture &amp; engineering specs →
          </a>
        </motion.div>
      </div>
    </section>
  );
}
