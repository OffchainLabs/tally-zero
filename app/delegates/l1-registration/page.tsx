import { L1Registration } from "@/components/l1-voting/L1Registration";

export const metadata = {
  title: "L1 Voting Registration | Arbitrum Governance",
  description:
    "Register the Ethereum address that votes for your delegate on the L1 voting governor.",
};

export default function L1RegistrationPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          L1 Voting Registration
        </h1>
        <p className="text-muted-foreground">
          Proposals on the L1 voting governor are voted on Ethereum with your
          Arbitrum voting power. Name the Ethereum address that votes for you on
          Arbitrum One, and accept your delegate from that address on Ethereum.
        </p>
      </div>
      <L1Registration />
    </div>
  );
}
