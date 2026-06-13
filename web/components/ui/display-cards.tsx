"use client";

import { cn } from "@/lib/utils";
import React from "react";

export interface DisplayCardProps {
  className?: string;
  icon?: React.ReactNode;
  stat: string;
  label: string;
  qualifier: string;
}

function DisplayCard({
  className,
  icon,
  stat,
  label,
  qualifier,
}: DisplayCardProps) {
  return (
    <div
      className={cn(
        // base
        "relative flex h-36 w-[20rem] -skew-y-[8deg] select-none flex-col justify-between",
        "rounded-2xl border border-[#B8923A]/20 bg-white/90 backdrop-blur-sm",
        "px-5 py-4 transition-all duration-500",
        // right-side fade so the stack overlap looks clean
        "after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-48",
        "after:bg-gradient-to-l after:from-[#f7f3f1] after:to-transparent after:content-['']",
        // hover
        "hover:border-[#B8923A]/50 hover:shadow-lg hover:shadow-[#B8923A]/08",
        "[&>*]:flex [&>*]:items-center [&>*]:gap-2",
        className
      )}
    >
      {/* Icon + stat number */}
      <div>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#B8923A]/12">
          {icon}
        </span>
        <span className="font-display font-semibold text-[#111111] text-3xl leading-none">
          {stat}
        </span>
      </div>

      {/* Label */}
      <p className="text-[#333333] text-[15px] font-medium whitespace-nowrap">{label}</p>

      {/* Qualifier */}
      <p className="text-[#888888] text-[12px]">{qualifier}</p>
    </div>
  );
}

interface DisplayCardsProps {
  cards: DisplayCardProps[];
}

export default function DisplayCards({ cards }: DisplayCardsProps) {
  const stackClasses = [
    // back — greyed out, overlay
    "hover:-translate-y-10 grayscale-[100%] hover:grayscale-0 before:absolute before:inset-0 before:rounded-2xl before:bg-[#f7f3f1]/55 before:content-[''] before:transition-opacity before:duration-500 hover:before:opacity-0",
    // middle — greyed out, overlay
    "translate-x-14 translate-y-9 hover:-translate-y-1 grayscale-[100%] hover:grayscale-0 before:absolute before:inset-0 before:rounded-2xl before:bg-[#f7f3f1]/55 before:content-[''] before:transition-opacity before:duration-500 hover:before:opacity-0",
    // front — fully visible
    "translate-x-28 translate-y-[4.5rem] hover:translate-y-10",
  ];

  return (
    <div className="grid [grid-template-areas:'stack'] place-items-center">
      {cards.slice(0, 3).map((card, i) => (
        <DisplayCard
          key={i}
          {...card}
          className={cn("[grid-area:stack]", stackClasses[i])}
        />
      ))}
    </div>
  );
}
