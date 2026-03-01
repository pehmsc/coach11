const SCHEMA_HINT =
  "Aplica a migration de push_subscriptions no Supabase e recarrega o schema cache do PostgREST em Settings > API > Reload schema.";

export function isPushSubscriptionsSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const row = error as { code?: string; message?: string; details?: string };
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  const details = typeof row.details === "string" ? row.details.toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

export function getPushSubscriptionsSchemaHint() {
  return SCHEMA_HINT;
}
