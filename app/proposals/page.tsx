import { ProposalsView } from "@/components/container/ProposalsView";

export const metadata = {
  title: "Arbitrum Governance",
};

export default function IndexPage() {
  return (
    <div className="relative isolate">
      {/* Decorative background from the Figma frame: starfield + illustration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[822px] overflow-hidden select-none"
      >
        <div
          className="absolute inset-0 bg-top bg-cover bg-no-repeat"
          style={{ backgroundImage: "url(/proposals/stars-bg.svg)" }}
        />
        <div className="container relative h-full">
          <div
            className="absolute right-0 top-2 h-[160px] w-[160px] bg-right-top bg-contain bg-no-repeat opacity-90 md:top-4 md:h-[220px] md:w-[220px] lg:h-[290px] lg:w-[290px]"
            style={{ backgroundImage: "url(/proposals/illustration.png)" }}
          />
        </div>
      </div>

      <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
        <div className="container flex flex-col gap-4">
          <ProposalsView />
        </div>
      </div>
    </div>
  );
}
