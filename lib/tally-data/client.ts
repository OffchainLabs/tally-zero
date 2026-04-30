"use client";

import { useEffect, useMemo, useState } from "react";

import { SqliteTallyDataClient } from "@/lib/tally-data/sqlite";
import type {
  TallyAddressDisplayRecord,
  TallyDataClient,
} from "@/lib/tally-data/types";

const EMPTY_DISPLAY_RECORDS = new Map<string, TallyAddressDisplayRecord>();

let client: TallyDataClient | null = null;

export function getTallyDataClient(): TallyDataClient {
  client ??= new SqliteTallyDataClient();
  return client;
}

export function useAddressDisplayRecords(
  addresses: string[]
): Map<string, TallyAddressDisplayRecord> {
  const addressKey = useMemo(
    () =>
      Array.from(
        new Set(
          addresses.filter(Boolean).map((address) => address.toLowerCase())
        )
      )
        .sort()
        .join(","),
    [addresses]
  );
  const [records, setRecords] = useState<
    Map<string, TallyAddressDisplayRecord>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    const normalized = addressKey ? addressKey.split(",") : [];

    if (normalized.length === 0) {
      return;
    }

    getTallyDataClient()
      .getAddressDisplayRecords(normalized)
      .then((nextRecords) => {
        if (!cancelled) setRecords(nextRecords);
      })
      .catch(() => {
        if (!cancelled) setRecords(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [addressKey]);

  return addressKey ? records : EMPTY_DISPLAY_RECORDS;
}

export function useAddressDisplayRecord(
  address: string
): TallyAddressDisplayRecord | undefined {
  const records = useAddressDisplayRecords(address ? [address] : []);
  return records.get(address.toLowerCase());
}

export type * from "@/lib/tally-data/types";
