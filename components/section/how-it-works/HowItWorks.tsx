import { ArrowRight, MessageSquare, ThumbsUp, Vote } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import SectionHeader from "@components/ui/SectionHeader";

const steps = [
  {
    number: 1,
    icon: MessageSquare,
    title: "Visit the Forums",
    description:
      "Submit or review new proposal discussions and stay updated on DAO grants. This is where ideas take shape before any vote.",
    href: "https://forum.arbitrum.foundation/",
    cta: "Open Forum",
  },
  {
    number: 2,
    icon: ThumbsUp,
    title: "Temp Check Voting",
    description:
      "Submit, review, or vote on Snapshot proposals to gauge the DAO's interest before they move to an onchain vote.",
    href: "https://snapshot.org/#/arbitrumfoundation.eth",
    cta: "View Snapshots",
  },
  {
    number: 3,
    icon: Vote,
    title: "Onchain Voting",
    description:
      "Cast your final, binding vote onchain. Constitutional proposals need 5% participation; non-constitutional need 3%.",
    href: "/proposals",
    cta: "Browse Proposals",
  },
];

function StepConnector() {
  return (
    <div className="hidden md:flex items-center justify-center">
      <ArrowRight className="h-6 w-6 text-arb-teal/50" />
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-label="How governance works"
      className="container pb-14 pt-20 sm:pb-20 sm:pt-32 lg:pb-32"
    >
      <SectionHeader
        sectionTitle="Participate in Arbitrum Governance"
        title="From Idea to Onchain Vote"
        description="Governance follows a structured path: community discussion, temperature check, then a final binding onchain vote."
      />

      <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isExternal = step.href.startsWith("http");
          return (
            <div key={step.title} className="contents">
              <div className="floating-card glow-border p-6 text-center md:text-left flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-arb-blue text-white font-bold text-sm shrink-0">
                    {step.number}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl glass-subtle backdrop-blur bg-arb-blue/20 dark:bg-arb-blue/25 shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <h3 className="font-bold text-lg tracking-tight mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">
                  {step.description}
                </p>
                {isExternal ? (
                  <a href={step.href} target="_blank" rel="noopener noreferrer">
                    <Button
                      variant="outline"
                      size="sm"
                      className="glass-subtle backdrop-blur"
                    >
                      {step.cta}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </a>
                ) : (
                  <Link href={step.href}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="glass-subtle backdrop-blur"
                    >
                      {step.cta}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
              {index < steps.length - 1 && <StepConnector />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
