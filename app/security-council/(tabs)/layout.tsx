import { SecurityCouncilTabs } from "@components/navigation/SecurityCouncilTabs";

interface SecurityCouncilLayoutProps {
  children: React.ReactNode;
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

        <SecurityCouncilTabs />

        {children}
      </div>
    </div>
  );
}
