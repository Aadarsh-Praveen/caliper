"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Calendar, FlaskConical, Star, Clock } from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";
import type { DisplayCardProps } from "@/components/ui/display-cards";

const cards: DisplayCardProps[] = [
  {
    icon: <Calendar size={15} className="text-[#B8923A]" />,
    stat: "3",
    label: "Years in development",
    qualifier: "Est. 2021",
  },
  {
    icon: <FlaskConical size={15} className="text-[#B8923A]" />,
    stat: "47",
    label: "Prototype iterations",
    qualifier: "Until perfect",
  },
  {
    icon: <Clock size={15} className="text-[#B8923A]" />,
    stat: "2M+",
    label: "Hours of testing",
    qualifier: "And counting",
  },
];

export default function StorySection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="story" ref={ref} className="bg-[#f7f3f1] py-28 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

          {/* Left — story text */}
          <motion.div
            initial={{ opacity: 0, x: -28 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7 }}
            className="flex flex-col gap-8"
          >
            {/* Header */}
            <div>
              <div className="w-12 h-px bg-[#B8923A] mb-4" />
              <span className="text-[#B8923A] text-[11px] font-semibold tracking-[0.22em] uppercase">
                Our Story
              </span>
              <h2
                className="font-display font-semibold text-[#111111] leading-tight mt-5"
                style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)" }}
              >
                Precision is not a feature.
                <br />
                <em className="font-light text-[#AAAAAA]">It&apos;s a philosophy.</em>
              </h2>
            </div>

            {/* Body copy */}
            <div className="flex flex-col gap-4 text-[#666666] text-[15px] leading-[1.8]">
              <p>
                We started Caliper because we were frustrated. Every premium headphone made you
                choose — between sound quality and comfort, between style and stamina, between
                softness and precision. We refused to accept that trade-off.
              </p>
              <p>
                We spent three years getting it right. 47 prototypes. Thousands of listening
                sessions. One obsessive question: what does precision actually feel like? The
                Arc Pro is our answer — exactness, confidence, and zero tolerance for
                approximation.
              </p>
            </div>

            {/* 98% satisfaction pill */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="inline-flex items-center gap-3 self-start bg-white border border-black/[0.07] rounded-full px-5 py-2.5 shadow-sm"
            >
              <Star size={14} className="text-[#B8923A] fill-[#B8923A]" />
              <span className="text-[#111111] font-semibold text-[13px]">98%</span>
              <span className="text-[#666666] text-[13px]">customer satisfaction</span>
            </motion.div>
          </motion.div>

          {/* Right — stacked DisplayCards */}
          <motion.div
            initial={{ opacity: 0, x: 28 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="flex items-center justify-center lg:justify-end"
          >
            {/* Extra padding so the skewed stack isn't clipped */}
            <div className="pt-10 pb-28 pr-10">
              <DisplayCards cards={cards} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
