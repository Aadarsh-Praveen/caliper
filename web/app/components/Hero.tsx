"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { TextEffect } from "@/components/ui/text-effect";
import type { Variants } from "framer-motion";
import { useCaliperVariant } from "@/lib/caliper/useCaliperVariant";
import { EXPERIMENTS } from "@/lib/caliper/experiments";
import { caliper } from "@/lib/caliper/sdk";

const heroVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.055 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 24, filter: "blur(14px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.55, ease: "easeOut" as const },
    },
  },
} satisfies { container: Variants; item: Variants };

export default function Hero() {
  const { variant } = useCaliperVariant(EXPERIMENTS.HERO_CTA);

  useEffect(() => {
    void caliper.track("hero_view");
  }, []);

  const handleCtaClick = () => {
    void caliper.track("hero_cta_click", { variant: "treatment" });
    document.querySelector("#buy")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      id="products"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Full-bleed background video */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          poster="/CALIPER.png"
          className="absolute inset-0 w-full h-full object-cover object-center"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.20) 50%, rgba(0,0,0,0.80) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <h1
          className="font-display font-semibold leading-none tracking-tight"
          style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)" }}
        >
          <TextEffect
            per="char"
            as="span"
            variants={heroVariants}
            delay={0.15}
            className="text-white"
          >
            {"Acoustic "}
          </TextEffect>
          <TextEffect
            per="char"
            as="span"
            variants={heroVariants}
            delay={0.65}
            className="text-[#E8C86A]"
          >
            Mastery
          </TextEffect>
        </h1>

        {/* Treatment: CTA button fades in after headline animation completes */}
        {variant === "treatment" && (
          <motion.button
            onClick={handleCtaClick}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.6 }}
            className="mt-8 px-7 py-3.5 bg-[#B8923A] text-white rounded-full text-[14px] font-semibold hover:bg-[#D4A84B] transition-colors shadow-lg"
            style={{ boxShadow: "0 8px 24px rgba(184,146,58,0.35)" }}
          >
            Shop Arc Pro — $349 →
          </motion.button>
        )}
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-40">
        <span
          className="text-white font-semibold uppercase tracking-[0.2em]"
          style={{ fontSize: "10px" }}
        >
          Scroll
        </span>
        <div className="w-px h-12 bg-gradient-to-b from-white to-transparent" />
      </div>
    </section>
  );
}
