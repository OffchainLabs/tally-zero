import { Badge } from "@/components/ui/Badge";
import { SecurityCouncilTabs } from "@components/navigation/SecurityCouncilTabs";
import { ExternalLink } from "lucide-react";

interface SecurityCouncilLayoutProps {
  children: React.ReactNode;
}

const KEY_ROTATION_FORUM_URL =
  "https://forum.arbitrum.foundation/t/key-rotation-july-2026/31081";

function KeyRotationBanner() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs md:col-span-2">
      <Badge className="shrink-0">New</Badge>
      <span className="text-muted-foreground">
        Key rotation (July 2026): the Security Council approved replacing Elad
        (Certora) with Tigran (Certora) and John Morrow (Gauntlet) with Patrick
        Collins (Cyfrin).
      </span>
      <a
        href={KEY_ROTATION_FORUM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
      >
        Forum announcement
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function SecurityCouncilLayout({
  children,
}: SecurityCouncilLayoutProps) {
  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Security Council
        </h1>

        <KeyRotationBanner />
        <SecurityCouncilTabs />

        {children}
      </div>
    </div>
  );
}
