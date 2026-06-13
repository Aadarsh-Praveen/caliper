"use client";

import * as React from "react";

export function Avatar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`relative flex shrink-0 overflow-hidden rounded-full ${className ?? ""}`}>
      {children}
    </span>
  );
}

export function AvatarImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = React.useState(false);
  if (errored) return null;
  return (
    <img
      src={src}
      alt={alt}
      className="aspect-square h-full w-full object-cover"
      onError={() => setErrored(true)}
    />
  );
}

export function AvatarFallback({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-[#B8923A]/20 text-[#B8923A] font-semibold text-sm">
      {children}
    </span>
  );
}
