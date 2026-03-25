import { Globe, Heart, Laptop, Leaf, Scale, Shield, Users } from "lucide-react";

const values = [
  {
    icon: Globe,
    title: "Ethereum-Aligned",
    description:
      "Arbitrum exists as part of the Ethereum ecosystem, contributing to its growth and security.",
  },
  {
    icon: Leaf,
    title: "Sustainable",
    description:
      "Governance prioritizes long-term ecosystem health over short-term gains.",
  },
  {
    icon: Shield,
    title: "Secure",
    description:
      "Protocol safety is paramount. Arbitrum One settles on Ethereum for the strongest security guarantees.",
  },
  {
    icon: Heart,
    title: "Socially Inclusive",
    description:
      "The DAO welcomes diverse participation from all backgrounds and perspectives.",
  },
  {
    icon: Laptop,
    title: "Technically Inclusive",
    description:
      "Governance is designed so ordinary individuals can participate fully and meaningfully.",
  },
  {
    icon: Users,
    title: "User-Focused",
    description:
      "The ecosystem is managed for the benefit of its users, not insiders.",
  },
  {
    icon: Scale,
    title: "Neutral & Open",
    description:
      "The DAO avoids favoritism, fostering innovation through healthy competition.",
  },
];

export default function DaoValues() {
  return (
    <section
      id="values"
      className="relative overflow-hidden py-12 md:py-16 lg:py-24"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-arb-blue/15 blur-[100px] dark:bg-arb-blue/8" />
      </div>

      <div className="container relative z-10">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="text-base font-semibold leading-7 text-arb-blue dark:text-arb-teal tracking-wide">
            From the Arbitrum Constitution
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-arb-blue via-arb-teal to-arb-blue bg-clip-text text-transparent dark:from-arb-teal dark:via-arb-blue dark:to-arb-teal bg-[length:200%_auto] animate-gradient">
              Community Values
            </span>
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            The Arbitrum DAO is guided by seven core values enshrined in its
            Constitution. Every proposal and governance action should uphold
            these principles.
          </p>
        </div>

        <div className="mx-auto max-w-5xl grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <div
                key={value.title}
                className="glass rounded-xl p-5 space-y-3 transition-all duration-300 hover:scale-[1.02] flex flex-col"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl glass-subtle bg-arb-blue/20 dark:bg-arb-blue/25">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold tracking-tight text-sm">
                  {value.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
