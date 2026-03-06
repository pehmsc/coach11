import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

export async function invalidateMeContext(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.meContext() });
}

export async function invalidateContextSensitiveQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.meContext() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.players() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.attendance.root() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.statistics.root() }),
  ]);
}
