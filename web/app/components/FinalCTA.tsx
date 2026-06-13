"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { Check, ArrowRight, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { useCaliperVariant } from "@/lib/caliper/useCaliperVariant";
import { EXPERIMENTS } from "@/lib/caliper/experiments";
import { caliper } from "@/lib/caliper/sdk";

const colors = [
  {
    name: "Midnight Black",
    bg: "#111111",
    ring: "#444444",
    image: "/CALIPER.png",
  },
  {
    name: "Matte White",
    bg: "#F0EDE8",
    ring: "#CCCCCC",
    image: "/White Caliper.png",
  },
];

const guarantees = [
  { icon: Truck,        text: "Free worldwide shipping" },
  { icon: RotateCcw,   text: "30-day free returns" },
  { icon: ShieldCheck, text: "2-year warranty" },
];

export default function FinalCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [selectedColor, setSelectedColor] = useState(0);
  const [added, setAdded] = useState(false);

  const { variant } = useCaliperVariant(EXPERIMENTS.BUY_BUTTON);

  // Track when buy section comes into view
  useEffect(() => {
    if (inView) {
      void caliper.track("buy_section_view");
    }
  }, [inView]);

  const activeColor = colors[selectedColor];

  const handleAdd = () => {
    setAdded(true);
    window.dispatchEvent(new Event("caliper:add-to-cart"));
    void caliper.track("add_to_cart", { variant: variant ?? "control", color: activeColor.name });
    setTimeout(() => setAdded(false), 2400);
  };

  const handleColorSelect = (colorName: string, index: number) => {
    setSelectedColor(index);
    void caliper.track("color_select", { color: colorName });
  };

  const isTreatment = variant === "treatment";

  return (
    <section id="buy" ref={ref} className="bg-[#0E0E0E] py-32 px-6 overflow-hidden relative">
      {/* Gold glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, rgba(184,146,58,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <h2
            className="font-display font-semibold italic text-[#F5F3EE] leading-tight mb-4"
            style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)" }}
          >
            Experience sound<br />
            <span className="text-gold-shimmer not-italic">differently.</span>
          </h2>
          <p className="text-[#AAAAAA] text-[16px]">
            Caliper Arc Pro — starting at $349
          </p>
        </motion.div>

        {/* Two-column purchase layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-4xl mx-auto items-center">

          {/* Product image */}
          <motion.div
            initial={{ opacity: 0, x: -32 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.75 }}
            className="relative flex justify-center"
          >
            <div className="relative w-[320px] h-[320px]">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(184,146,58,0.18) 0%, transparent 70%)",
                  filter: "blur(32px)",
                }}
              />
              <motion.div
                key={activeColor.image}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0"
              >
                <Image
                  src={activeColor.image}
                  alt={`Caliper Arc Pro — ${activeColor.name}`}
                  fill
                  className="object-contain drop-shadow-2xl product-float"
                  sizes="320px"
                />
              </motion.div>
            </div>
          </motion.div>

          {/* Purchase card */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.1 }}
            className="bg-[#1A1A1A] border border-white/[0.08] rounded-3xl p-7 flex flex-col gap-6"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display font-semibold italic text-[#F5F3EE] text-2xl">
                  Arc Pro
                </h3>
                <p className="text-[#AAAAAA] text-[13px] mt-0.5">
                  Wireless Over-Ear Headphones
                </p>
              </div>

              {/* Price — treatment shows strikethrough anchor */}
              <div className="text-right">
                {isTreatment ? (
                  <div className="flex items-baseline gap-2 justify-end">
                    <span className="font-display font-semibold text-3xl text-[#F5F3EE] leading-none">
                      $349
                    </span>
                    <span className="text-[#888888] line-through text-lg">$399</span>
                  </div>
                ) : (
                  <div className="font-display font-semibold text-3xl text-[#F5F3EE] leading-none">
                    $349
                  </div>
                )}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#999999] mb-3">
                Color — {activeColor.name}
              </p>
              <div className="flex gap-3">
                {colors.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => handleColorSelect(c.name, i)}
                    title={c.name}
                    className="w-8 h-8 rounded-full transition-all duration-200 hover:scale-110"
                    style={{
                      background: c.bg,
                      border: `2px solid ${selectedColor === i ? "#B8923A" : c.ring}`,
                      outline: selectedColor === i ? "2px solid rgba(184,146,58,0.35)" : "none",
                      outlineOffset: "3px",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Add to Cart / Buy Now button */}
            <motion.button
              onClick={handleAdd}
              whileTap={{ scale: 0.97 }}
              className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-[14px] transition-all duration-300 ${
                added
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                  : isTreatment
                  ? "bg-[#111111] text-white hover:bg-[#333333] shadow-lg shadow-black/40"
                  : "bg-[#B8923A] text-white hover:bg-[#D4A84B] shadow-lg shadow-[#B8923A]/25"
              }`}
            >
              {added ? (
                <><Check size={16} /> Added to Cart</>
              ) : isTreatment ? (
                <>Buy Now <ArrowRight size={15} /></>
              ) : (
                <>Add to Cart <ArrowRight size={15} /></>
              )}
            </motion.button>

            {/* Guarantees */}
            <div className="flex flex-col gap-2.5 pt-1 border-t border-white/[0.06]">
              {guarantees.map((g) => (
                <div key={g.text} className="flex items-center gap-2.5">
                  <g.icon size={13} className="text-[#B8923A] shrink-0" />
                  <span className="text-[#AAAAAA] text-[12px]">{g.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
