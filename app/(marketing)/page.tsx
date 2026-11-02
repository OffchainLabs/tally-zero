import { HomeView } from "@/components/container/HomeView";
import { canonicalUrl, siteOpenGraph } from "@/lib/seo";
import ProposalBanner from "@components/section/display/ProposalBanner";
import { siteConfig } from "@config/site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Absolute: the home page is the one place the full name belongs, and the
  // template would otherwise append the site name to itself.
  title: { absolute: siteConfig.homeTitle },
  description: siteConfig.description,
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    ...siteOpenGraph,
    title: siteConfig.homeTitle,
    description: siteConfig.description,
    url: canonicalUrl("/"),
  },
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
        <HomeView banner={<ProposalBanner />} />
      </div>
    </div>
  );
}
