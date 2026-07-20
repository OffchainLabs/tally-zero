"use client";

import { useEffect, useMemo, useState } from "react";

import { IndexerTallyDataClient } from "@/lib/tally-data/indexer";
import type {
  TallyAddressDisplayRecord,
  TallyDataClient,
} from "@/lib/tally-data/types";

const EMPTY_DISPLAY_RECORDS = new Map<string, TallyAddressDisplayRecord>();

let client: TallyDataClient | null = null;
const displayRecordCache = new Map<string, TallyAddressDisplayRecord>();

type DisplayRecordsState = {
  addressKey: string;
  records: Map<string, TallyAddressDisplayRecord>;
  isLoading: boolean;
};

export type AddressDisplayRecordsState = {
  records: Map<string, TallyAddressDisplayRecord>;
  isLoading: boolean;
};

export function getTallyDataClient(): TallyDataClient {
  client ??= new IndexerTallyDataClient();
  return client;
}

function cacheDisplayRecords(
  records: Map<string, TallyAddressDisplayRecord>
): Map<string, TallyAddressDisplayRecord> {
  for (const [address, record] of records) {
    displayRecordCache.set(address.toLowerCase(), record);
  }
  return records;
}

export function getCachedAddressDisplayRecord(
  address: string
): TallyAddressDisplayRecord | undefined {
  return displayRecordCache.get(address.toLowerCase());
}

export function primeAddressDisplayRecordCache(
  records: TallyAddressDisplayRecord[]
): void {
  for (const record of records) {
    displayRecordCache.set(record.address.toLowerCase(), record);
  }
}

export async function getAddressDisplayRecords(
  addresses: string[]
): Promise<Map<string, TallyAddressDisplayRecord>> {
  return cacheDisplayRecords(
    await getTallyDataClient().getAddressDisplayRecords(addresses)
  );
}

export async function getAddressDisplayRecord(
  address: string
): Promise<TallyAddressDisplayRecord | undefined> {
  return (await getAddressDisplayRecords([address])).get(address.toLowerCase());
}

function getAddressDisplayRecordKey(addresses: string[]): string {
  return Array.from(
    new Set(addresses.filter(Boolean).map((address) => address.toLowerCase()))
  )
    .sort()
    .join(",");
}

function getCachedDisplayRecords(
  addresses: string[]
): Map<string, TallyAddressDisplayRecord> {
  const records = new Map<string, TallyAddressDisplayRecord>();
  for (const address of addresses) {
    const record = displayRecordCache.get(address);
    if (record) records.set(address, record);
  }
  return records;
}

export function useAddressDisplayRecordsState(
  addresses: string[]
): AddressDisplayRecordsState {
  const addressKey = useMemo(
    () => getAddressDisplayRecordKey(addresses),
    [addresses]
  );
  const normalized = useMemo(
    () => (addressKey ? addressKey.split(",") : []),
    [addressKey]
  );
  const cachedRecords = useMemo(
    () => getCachedDisplayRecords(normalized),
    [normalized]
  );
  const allCached =
    normalized.length > 0 &&
    normalized.every((address) => displayRecordCache.has(address));
  const [state, setState] = useState<DisplayRecordsState>({
    addressKey: "",
    records: new Map(),
    isLoading: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (normalized.length === 0) {
      return;
    }

    const hasAllRecords = normalized.every((address) =>
      displayRecordCache.has(address)
    );

    if (hasAllRecords) {
      return;
    }

    getAddressDisplayRecords(normalized)
      .then((nextRecords) => {
        if (!cancelled) {
          setState({
            addressKey,
            records: nextRecords,
            isLoading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            addressKey,
            records: new Map(),
            isLoading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addressKey, normalized]);

  if (!addressKey) {
    return { records: EMPTY_DISPLAY_RECORDS, isLoading: false };
  }

  if (state.addressKey !== addressKey) {
    return {
      records: cachedRecords,
      isLoading: !allCached,
    };
  }

  return {
    records: state.records,
    isLoading: state.isLoading,
  };
}

export function useAddressDisplayRecords(
  addresses: string[]
): Map<string, TallyAddressDisplayRecord> {
  return useAddressDisplayRecordsState(addresses).records;
}

export function useAddressDisplayRecord(
  address: string
): TallyAddressDisplayRecord | undefined {
  const records = useAddressDisplayRecords(address ? [address] : []);
  return records.get(address.toLowerCase());
}

export type * from "@/lib/tally-data/types";
