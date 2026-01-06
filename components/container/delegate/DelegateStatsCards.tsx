"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { formatVotingPower } from "@/lib/format-utils";

export interface DelegateStatsCardsProps {
  delegateCount: number;
  totalVotingPower: string;
  totalSupply: string;
  delegatedPercentage: string;
}

export function DelegateStatsCards({
  delegateCount,
  totalVotingPower,
  totalSupply,
  delegatedPercentage,
}: DelegateStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Card variant="floating" className="glow-border">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardDescription>Total Delegates</CardDescription>
          <CardTitle className="text-2xl sm:text-3xl">
            {delegateCount.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card variant="floating" className="glow-border">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardDescription>Total Voting Power</CardDescription>
          <CardTitle className="text-2xl sm:text-3xl">
            {formatVotingPower(totalVotingPower)} ARB
          </CardTitle>
        </CardHeader>
      </Card>

      <Card variant="floating" className="glow-border">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardDescription>ARB Total Supply</CardDescription>
          <CardTitle className="text-2xl sm:text-3xl">
            {formatVotingPower(totalSupply)} ARB
          </CardTitle>
        </CardHeader>
      </Card>

      <Card variant="floating" className="glow-border">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardDescription>Delegated</CardDescription>
          <CardTitle className="text-2xl sm:text-3xl">
            {delegatedPercentage}%
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
