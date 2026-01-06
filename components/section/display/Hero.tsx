import { siteConfig } from "@config/site";
import Link from "next/link";

import { Icons } from "@components/Icons";

import { Button } from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-12 pt-8 md:pb-16 md:pt-12 lg:py-32">
      {/* Background gradient orbs for visual depth */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/4 h-[600px] w-[600px] rounded-full bg-violet-500/20 blur-[120px] dark:bg-violet-500/10 animate-pulse" />
        <div className="absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-fuchsia-500/15 blur-[100px] dark:bg-fuchsia-500/10 animate-pulse [animation-delay:1s]" />
      </div>

      <div className="container relative z-10 flex max-w-[64rem] flex-col items-center gap-8 text-center">
        {/* Badge/Tag */}
        <div className="glass-subtle inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-violet-700 dark:text-violet-300 animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />
          </span>
          Arbitrum DAO Governance
        </div>

        {/* Main heading with gradient text */}
        <h1 className="animate-fade-in-up font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl [animation-delay:100ms]">
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-violet-400 bg-[length:200%_auto] animate-gradient">
            Decentralized Voting
          </span>
          <br />
          <span className="text-foreground/90">Made Simple</span>
        </h1>

        {/* Description in glass card */}
        <div className="floating-card glow-border max-w-[42rem] p-6 animate-fade-in-up [animation-delay:200ms]">
          <p className="leading-relaxed text-muted-foreground sm:text-lg sm:leading-8">
            A robust, open-source platform for onchain voting. Tally Zero
            ensures accessibility and transparency, leveraging{" "}
            <span className="font-medium text-foreground">React</span> and{" "}
            <span className="font-medium text-foreground">IPFS</span> for true
            decentralization.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col items-center gap-4 sm:flex-row animate-fade-in-up [animation-delay:300ms]">
          <Link href="/explore">
            <Button size="lg" className="group relative overflow-hidden px-8">
              <span className="relative z-10 flex items-center">
                Start Voting
                <Icons.arrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
          </Link>
          <Link href={siteConfig.links.github} target="_blank" rel="noreferrer">
            <Button
              variant="outline"
              size="lg"
              className="glass-subtle group border-violet-200/50 hover:border-violet-300 dark:border-violet-800/50 dark:hover:border-violet-700 px-8"
            >
              <Icons.gitHub className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
              GitHub
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="glass rounded-2xl mt-4 flex flex-wrap justify-center gap-8 px-8 py-6 animate-fade-in-up [animation-delay:400ms]">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              100%
            </span>
            <span className="text-sm text-muted-foreground">Decentralized</span>
          </div>
          <div className="h-12 w-px bg-violet-500/20 dark:bg-violet-500/25" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              Open
            </span>
            <span className="text-sm text-muted-foreground">Source</span>
          </div>
          <div className="h-12 w-px bg-violet-500/20 dark:bg-violet-500/25" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              IPFS
            </span>
            <span className="text-sm text-muted-foreground">Hosted</span>
          </div>
        </div>
      </div>
    </section>
  );
}
