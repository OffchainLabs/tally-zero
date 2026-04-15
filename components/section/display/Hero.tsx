import Link from "next/link";

import { Icons } from "@components/Icons";

import { Button } from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-12 pt-8 md:pb-16 md:pt-12 lg:py-32">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/4 h-[600px] w-[600px] rounded-full bg-arb-blue/20 blur-[120px] dark:bg-arb-blue/10 animate-pulse" />
        <div className="absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-arb-teal/15 blur-[100px] dark:bg-arb-teal/10 animate-pulse [animation-delay:1s]" />
      </div>

      <div className="container relative z-10 flex max-w-[64rem] flex-col items-center gap-8 text-center">
        {/* Badge */}
        <div className="glass-subtle inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-arb-blue dark:text-arb-teal animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-arb-blue opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-arb-blue dark:bg-arb-teal" />
          </span>
          Arbitrum DAO Governance
        </div>

        {/* Main heading */}
        <h1 className="animate-fade-in-up font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl [animation-delay:100ms]">
          <span className="bg-gradient-to-r from-arb-blue via-arb-teal to-arb-blue bg-clip-text text-transparent dark:from-arb-teal dark:via-arb-blue dark:to-arb-teal bg-[length:200%_auto] animate-gradient">
            Empowering Arbitrum
          </span>
          <br />
          <span className="text-foreground/90">Contributors</span>
        </h1>

        {/* Description */}
        <div className="floating-card glow-border max-w-[42rem] p-6 animate-fade-in-up [animation-delay:200ms]">
          <p className="leading-relaxed text-muted-foreground sm:text-lg sm:leading-8">
            The Arbitrum DAO governs the Arbitrum ecosystem through token-holder
            voting, delegate representation, and Security Council elections.
            Participate in proposals, elect council members, and shape the
            future of Arbitrum.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col items-center gap-4 sm:flex-row animate-fade-in-up [animation-delay:300ms]">
          <Link href="/proposals">
            <Button size="lg" className="group relative overflow-hidden px-8">
              <span className="relative z-10 flex items-center">
                Explore Proposals
                <Icons.arrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
          </Link>
          <Link href="/elections">
            <Button
              variant="outline"
              size="lg"
              className="glass-subtle group border-arb-blue/30 hover:border-arb-blue/50 dark:border-arb-blue/30 dark:hover:border-arb-teal/40 px-8"
            >
              <Icons.shield className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
              Security Council Elections
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="glass rounded-2xl mt-4 flex flex-wrap justify-center gap-8 px-8 py-6 animate-fade-in-up [animation-delay:400ms]">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-arb-blue dark:text-arb-teal">
              $ARB
            </span>
            <span className="text-sm text-muted-foreground">
              Token-Governed
            </span>
          </div>
          <div className="h-12 w-px bg-arb-blue/20 dark:bg-arb-blue/25" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-arb-blue dark:text-arb-teal">
              12
            </span>
            <span className="text-sm text-muted-foreground">
              Council Members
            </span>
          </div>
          <div className="h-12 w-px bg-arb-blue/20 dark:bg-arb-blue/25" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-arb-blue dark:text-arb-teal">
              2 Chains
            </span>
            <span className="text-sm text-muted-foreground">
              One &amp; Nova
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
