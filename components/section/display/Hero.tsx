import { ArrowRight, MessageSquare, ThumbsUp, Vote } from "lucide-react";
import Link from "next/link";

const flowSteps = [
  {
    icon: MessageSquare,
    title: "Forum",
    href: "https://forum.arbitrum.foundation/",
  },
  {
    icon: ThumbsUp,
    title: "Temp Check",
    href: "https://snapshot.org/#/arbitrumfoundation.eth",
  },
  { icon: Vote, title: "Onchain Vote", href: "/proposals" },
];

const stats = [
  { value: "$ARB", label: "Token-Governed" },
  { value: "12", label: "Council Members" },
  { value: "2 Chains", label: "One & Nova" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-6 pt-6 md:pb-8 md:pt-8">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/4 h-[600px] w-[600px] rounded-full bg-arb-blue/20 blur-[120px] dark:bg-arb-blue/10 animate-pulse" />
        <div className="absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-arb-teal/15 blur-[100px] dark:bg-arb-teal/10 animate-pulse [animation-delay:1s]" />
      </div>

      <div className="container relative z-10 flex max-w-[68rem] flex-col items-center gap-4 text-center sm:gap-5">
        {/* Main heading */}
        <h1 className="animate-fade-in-up font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-6xl [animation-delay:100ms]">
          <span className="bg-gradient-to-r from-arb-blue via-arb-teal to-arb-blue bg-clip-text text-transparent dark:from-arb-teal dark:via-arb-blue dark:to-arb-teal bg-[length:200%_auto] animate-gradient">
            Empowering Arbitrum
          </span>
        </h1>

        {/* Description — distills the ecosystem overview, treasury, constitution and transparency */}
        <p className="max-w-[50rem] leading-relaxed text-muted-foreground sm:text-lg animate-fade-in-up [animation-delay:150ms]">
          The ArbitrumDAO governs the ecosystem through onchain token-holder
          voting, delegate representation, and Security Council elections. The
          DAO controls the $ARB treasury and upholds the seven values of its
          Constitution, with every action recorded transparently onchain.
        </p>

        {/* Governance flow + stats */}
        <div className="grid w-full gap-3 md:grid-cols-2 animate-fade-in-up [animation-delay:250ms]">
          {/* From idea to onchain vote */}
          <div className="glass rounded-2xl flex flex-col gap-3 px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-arb-blue dark:text-arb-teal">
              From idea to onchain vote
            </span>
            <div className="flex items-center justify-between gap-1">
              {flowSteps.map(({ icon: Icon, title, href }, index) => {
                const isExternal = href.startsWith("http");
                const label = (
                  <span className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-arb-blue dark:hover:text-arb-teal">
                    <Icon className="h-4 w-4 text-primary" />
                    {title}
                  </span>
                );
                return (
                  <div key={title} className="flex items-center gap-1">
                    {isExternal ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    ) : (
                      <Link href={href}>{label}</Link>
                    )}
                    {index < flowSteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 shrink-0 text-arb-teal/50" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="glass rounded-2xl flex flex-wrap items-center justify-center gap-6 px-5 py-4 sm:gap-8">
            {stats.map(({ value, label }, index) => (
              <div key={label} className="flex items-center gap-6 sm:gap-8">
                {index > 0 && (
                  <div className="h-10 w-px bg-arb-blue/20 dark:bg-arb-blue/25" />
                )}
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-arb-blue dark:text-arb-teal">
                    {value}
                  </span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
