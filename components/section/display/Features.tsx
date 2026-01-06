import { Icons } from "@components/Icons";
import SectionHeader from "@components/ui/SectionHeader";

const features = [
  {
    icon: Icons.component,
    title: "Decentralized Voting",
    description: "Secure, transparent voting on blockchain proposals.",
  },
  {
    icon: Icons.wallet,
    title: "Wallet Integration",
    description: "Easy connection with digital wallets for authentication.",
  },
  {
    icon: Icons.wifi,
    title: "IPFS Deployment",
    description: "Hosted on IPFS for enhanced decentralization.",
  },
  {
    icon: Icons.liststart,
    title: "Proposal Browsing and Voting",
    description: "Browse and vote on proposals effortlessly.",
  },
  {
    icon: Icons.blend,
    title: "Cross-Chain Support",
    description: "Works across multiple blockchains for broad accessibility.",
  },
  {
    icon: Icons.packageopen,
    title: "Open Source",
    description: "Community-driven development and improvement.",
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
          sectionTitle="Take a look at the features"
          title="Features of Tally Zero"
          description="Tally Zero is a decentralized governance platform that offers a range of features to enable secure, transparent, and decentralized voting on blockchain proposals."
        />
      </div>
      <div className="mx-auto grid justify-center gap-6 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="floating-card glow-border group relative overflow-hidden p-6"
            >
              <div className="flex h-[180px] flex-col justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl glass-subtle bg-violet-500/20 dark:bg-violet-500/25 transition-colors duration-300 group-hover:bg-violet-500/30">
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
        })}
      </div>
      <div className="mx-auto text-center md:max-w-[58rem]">
        <p className="leading-normal text-muted-foreground sm:text-lg sm:leading-7">
          Tally Zero offers multi-chain support, IPFS deployment, and wallet
          integration.
        </p>
      </div>
    </section>
  );
}
