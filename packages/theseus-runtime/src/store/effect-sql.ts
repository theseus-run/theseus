import { SqliteClient } from "@effect/sql-sqlite-bun";

export const TheseusSqliteLive = (dbPath: string) =>
  SqliteClient.layer({
    filename: dbPath,
    create: true,
  });
