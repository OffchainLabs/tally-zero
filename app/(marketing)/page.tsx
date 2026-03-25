import Features from "@components/section/display/Features";
import Hero from "@components/section/display/Hero";
import DaoValues from "@components/section/display/Opensource";
import HowItWorks from "@components/section/how-it-works/HowItWorks";

export const metadata = {
  title: "Arbitrum DAO Governance",
};

export default async function IndexPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <DaoValues />
    </>
  );
}
