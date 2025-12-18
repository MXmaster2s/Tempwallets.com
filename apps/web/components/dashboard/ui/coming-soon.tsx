import Link from "next/link";
import {
  Sparkles,
  CalendarClock,
  Rocket,
  ArrowLeftCircle,
} from "lucide-react";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";

interface ComingSoonProps {
  title: string;
  description?: string;
  highlights?: string[];
  ctaHref?: string;
  ctaLabel?: string;
}

export function ComingSoonSection({
  title,
  description = "We're polishing the experience and will roll it out shortly.",
  highlights = [
    "Realtime insights",
    "Security-first controls",
    "Tailored recommendations",
  ],
  ctaHref = "/",
  ctaLabel = "Back to dashboard",
}: ComingSoonProps) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-4xl border-white/10 bg-black/70 text-white shadow-2xl backdrop-blur">
        <CardContent className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              <Sparkles className="h-4 w-4 text-white" />
              Coming soon
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                {title}
              </h1>
              <p className="text-base text-white/70 sm:text-lg">{description}</p>
            </div>
            <ul className="space-y-3 text-sm text-white/80">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Rocket className="h-4 w-4 text-white/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-4 gap-2 rounded-full px-6 py-5 text-base font-semibold">
              <Link href={ctaHref}>
                <ArrowLeftCircle className="h-5 w-5" />
                {ctaLabel}
              </Link>
            </Button>
          </div>
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/0 to-white/10 p-10 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <div className="relative flex flex-col items-center gap-4">
              <CalendarClock className="h-16 w-16 text-white/70" />
              <p className="text-lg font-medium text-white">
                Launching shortly
              </p>
              <p className="text-sm text-white/70">
                Enable notifications in your profile to know the moment it
                goes live.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
