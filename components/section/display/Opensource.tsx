import { siteConfig } from "@config/site";
import Link from "next/link";

import { Icons } from "@components/Icons";

import { Button } from "@/components/ui/Button";

export default function Opensource() {
  return (
    <section
      id="open-source"
      className="relative overflow-hidden py-12 md:py-16 lg:py-24"
    >
      {/* Background gradient orb for visual depth */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 blur-[100px] dark:bg-violet-500/8" />
      </div>

      <div className="container relative z-10">
        <div className="mx-auto max-w-[48rem]">
          <div className="floating-card glow-border p-8 md:p-12 text-center">
            {/* Badge */}
            <div className="glass-subtle inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-violet-700 dark:text-violet-300 mb-6">
              <Icons.gitHub className="h-4 w-4" />
              Open Source
            </div>

            {/* Title */}
            <h2 className="font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl mb-4">
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-violet-400 bg-[length:200%_auto] animate-gradient">
                Proudly Open Source
              </span>
            </h2>

            {/* Description */}
            <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-[32rem] mx-auto">
              Tally Zero is built in the open. We believe in transparency and
              community-driven development. Our entire codebase is available for
              anyone to explore, contribute, and build upon.
            </p>

            {/* CTA Button */}
            <Link
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="lg" className="group relative overflow-hidden px-8">
                <span className="relative z-10 flex items-center">
                  <Icons.gitHub className="mr-2 h-5 w-5 transition-transform group-hover:scale-110" />
                  View on GitHub
                  <Icons.arrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </Link>

            {/* Features list */}
            <div className="mt-10 flex flex-wrap justify-center gap-6 md:gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-subtle bg-violet-500/20 dark:bg-violet-500/25">
                  <Icons.code className="h-4 w-4 text-primary" />
                </div>
                <span>MIT Licensed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-subtle bg-violet-500/20 dark:bg-violet-500/25">
                  <Icons.users className="h-4 w-4 text-primary" />
                </div>
                <span>Community Driven</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-subtle bg-violet-500/20 dark:bg-violet-500/25">
                  <Icons.shield className="h-4 w-4 text-primary" />
                </div>
                <span>Security Audited</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
