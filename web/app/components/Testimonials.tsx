"use client";

import { AnimatedTestimonials } from "@/components/blocks/animated-testimonials";

const testimonials = [
  {
    id: 1,
    name: "Sarah Kim",
    role: "Music Producer",
    company: "Los Angeles",
    content:
      "The first pair I haven't had to EQ. The titanium drivers just get out of the way and let the music through. The ANC is genuinely magical — I use them in the studio for focus sessions. Best headphones I've owned in 15 years.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    id: 2,
    name: "Marcus Teo",
    role: "Software Engineer",
    company: "Singapore",
    content:
      "Battery still hits 38+ hours after six months. Bluetooth multipoint is flawless — switches between my laptop, phone, and iPad constantly and just follows me. Build quality feels like it'll outlast three phone generations.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: 3,
    name: "Priya Mehta",
    role: "UX Designer",
    company: "London",
    content:
      "Comfortable for 8-hour sessions. I'm picky about how things look and feel. These are stunning. Protein leather breaks in perfectly and the clamping force is just right. Caliper clearly spent time on the ergonomics.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/68.jpg",
  },
];

export default function Testimonials() {
  return (
    <AnimatedTestimonials
      title="Heard from real ears."
      subtitle="4.9 stars across 2,847 verified reviews from audiophiles, producers, and everyday listeners."
      badgeText="Verified Reviews"
      testimonials={testimonials}
      autoRotateInterval={6000}
      trustedCompanies={["Spotify", "Apple Music", "Tidal", "TIDAL", "Amazon Music"]}
      trustedCompaniesTitle="Loved by listeners on every platform"
    />
  );
}
