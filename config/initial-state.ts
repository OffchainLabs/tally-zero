/**
 * Initial state definitions for the application
 * Provides default state for search and proposal contexts
 */

import { State } from "@/types/search";

/** Initial state for the search context */
export const initialState: State = {
  governor: {
    address: undefined,
    contract: null,
    name: undefined,
  },
  token: {
    address: undefined,
    contract: null,
  },
  proposals: [],
};
