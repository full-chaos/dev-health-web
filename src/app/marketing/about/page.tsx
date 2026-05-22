import type { Metadata } from "next";
import { NoSurveillanceContract } from "@/components/NoSurveillanceContract";

export const metadata: Metadata = {
  title: "About — Full Chaos Dev Health",
  description:
    "Full Chaos Dev Health is an open-source analytics platform for team operating modes, investment patterns, and developer health without surveillance.",
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-24">
      <div className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-8 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.45)] sm:p-12">
        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">About Dev Health</p>
        <h1 className="mt-4 font-(--font-display) text-4xl leading-tight sm:text-5xl">
          Engineering intelligence that refuses surveillance mechanics.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-(--ink-muted) sm:text-lg">
          Full Chaos Dev Health shows where human effort is invested and where system pressure is
          rising. It is built for learning, coaching, and operating-mode awareness, not ranking
          people.
        </p>
        <div className="mt-10">
          <NoSurveillanceContract />
        </div>
      </div>
    </section>
  );
}
