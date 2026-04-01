"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const FULL_WEIGHT_DAYS = 7;
const TOTAL_DAYS = 21;

interface VoteWeightChartProps {
  currentPct: number | undefined;
}

function getWeight(day: number): number {
  if (day <= FULL_WEIGHT_DAYS) return 100;
  if (day >= TOTAL_DAYS) return 0;
  return ((TOTAL_DAYS - day) / (TOTAL_DAYS - FULL_WEIGHT_DAYS)) * 100;
}

export function VoteWeightChart({
  currentPct,
}: VoteWeightChartProps): React.ReactElement {
  const data = useMemo(
    () =>
      Array.from({ length: TOTAL_DAYS + 1 }, (_, i) => ({
        day: i,
        weight: Math.round(getWeight(i) * 100) / 100,
      })),
    []
  );

  // Current position marker
  let currentDay: number | undefined;
  if (currentPct !== undefined) {
    if (currentPct >= 100) {
      currentDay = 0;
    } else if (currentPct <= 0) {
      currentDay = TOTAL_DAYS;
    } else {
      currentDay =
        TOTAL_DAYS - (currentPct / 100) * (TOTAL_DAYS - FULL_WEIGHT_DAYS);
    }
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
      >
        <defs>
          <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.2}
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.6)" }}
          tickLine={false}
          axisLine={false}
          ticks={[0, 7, 14, 21]}
          tickFormatter={(d: number) => (d === 0 ? "Day 1" : `Day ${d}`)}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.6)" }}
          tickLine={false}
          axisLine={false}
          ticks={[0, 50, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />

        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const { day, weight } = payload[0].payload as {
              day: number;
              weight: number;
            };
            return (
              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <p className="font-medium">Day {day === 0 ? 1 : day}</p>
                <p className="text-muted-foreground">
                  Weight: {weight.toFixed(1)}%
                </p>
              </div>
            );
          }}
        />

        <ReferenceLine
          x={FULL_WEIGHT_DAYS}
          stroke="hsl(var(--muted-foreground) / 0.3)"
          strokeDasharray="3 2"
        />

        <Area
          type="linear"
          dataKey="weight"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#weightFill)"
          isAnimationActive={false}
        />

        {currentDay !== undefined && currentPct !== undefined && (
          <ReferenceDot
            x={Math.round(currentDay)}
            y={Math.min(100, Math.max(0, currentPct))}
            r={4}
            fill="hsl(var(--chart-warning, 45 93% 47%))"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
