import { queryOptions } from "@tanstack/react-query";

import { siweApi } from "./client";
import { siweKeys } from "./keys";

export const meQueryOptions = queryOptions({
  queryKey: siweKeys.me,
  queryFn: () => siweApi.me(),
  staleTime: 30_000,
});
