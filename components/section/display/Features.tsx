import { FileText, Scale, Shield, Users, Vote, Wallet } from "lucide-react";
import Link from "next/link";

import SectionHeader from "@components/ui/SectionHeader";

const features = [
  {
    icon: Vote,
    title: "Proposals & Voting",
    description:
      "Submit and vote on Arbitrum Improvement Proposals. Constitutional changes require 5% participation; non-constitutional require 3%.",
    href: "/proposals",
  },
  {
    icon: Shield,
    title: "Security Council",
    description:
      "Elect the 12-member Security Council that safeguards the protocol. Two 6-member cohorts are replaced every six months.",
    href: "/elections",
  },
  {
    icon: Users,
    title: "Delegate System",
    description:
      "Delegate your $ARB voting power to trusted representatives or browse active delegates and their voting records.",
    href: "/delegates",
  },
  {
    icon: Wallet,
    title: "DAO Treasury",
    description:
      "The DAO controls all $ARB tokens held in governance contracts. Funding proposals allocate resources to grow the ecosystem.",
    href: "/proposals",
  },
  {
    icon: Scale,
    title: "Constitution",
    description:
      "The Arbitrum Constitution defines governance rules, proposal processes, and the seven community values the DAO upholds.",
    href: undefined,
  },
  {
    icon: FileText,
    title: "Transparency",
    description:
      "All governance actions happen onchain. The Security Council publishes transparency reports for every action taken.",
    href: "/timelock",
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="container space-y-8 py-8 md:py-12 lg:py-24"
    >
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <SectionHeader
          sectionTitle="How Arbitrum Governance works"
          title="Governance at a Glance"
          description="The Arbitrum DAO empowers $ARB token holders to shape the protocol through proposals, elections, and delegation — all onchain."
        />
      </div>
      <div className="mx-auto grid justify-center gap-6 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          const card = (
            <div
              key={feature.title}
              className="floating-card glow-border group relative overflow-hidden p-6"
            >
              <div className="flex h-[180px] flex-col justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl glass-subtle backdrop-blur bg-arb-blue/20 dark:bg-arb-blue/25 transition-colors duration-300 group-hover:bg-arb-blue/30">
                  <Icon className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold tracking-tight">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          );

          if (feature.href) {
            return (
              <Link key={feature.title} href={feature.href} className="block">
                {card}
              </Link>
            );
          }
          return card;
        })}
      </div>
    </section>
  );
}
