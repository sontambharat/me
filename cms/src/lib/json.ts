// Structured columns are stored as JSON strings (see schema.prisma) so the
// model is identical on SQLite and Postgres. These helpers centralise
// (de)serialisation so callers work with real objects.

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
