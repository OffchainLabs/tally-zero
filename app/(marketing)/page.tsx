import Search from "@/components/container/Search";
import SearchSkeleton from "@/components/container/SearchSkeleton";
import Hero from "@components/section/display/Hero";
import { Suspense } from "react";

export const metadata = {
  title: "ArbitrumDAO Governance",
};

export default async function IndexPage() {
  return (
    <>
      <Hero />
      <div className="container flex flex-col gap-4 pb-8 md:pb-12">
        <Suspense fallback={<SearchSkeleton />}>
          <Search />
        </Suspense>
      </div>
    </>
  );
}
