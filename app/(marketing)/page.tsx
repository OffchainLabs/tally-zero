import { HomeView } from "@/components/container/HomeView";
import ProposalBanner from "@components/section/display/ProposalBanner";

export const metadata = {
  title: "ArbitrumDAO Governance",
};

export default async function IndexPage() {
  return (
    <div className="relative isolate">
      {/* Starfield backdrop from the Figma frame, behind the banner and table. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[822px] select-none overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-top bg-cover bg-no-repeat"
          style={{ backgroundImage: "url(/proposals/stars-bg.svg)" }}
        />
      </div>

      <div className="container flex flex-col gap-4 pb-8 pt-6 md:pb-12 md:pt-10">
        <ProposalBanner />
        <HomeView />
      </div>
    </div>
  );
}
