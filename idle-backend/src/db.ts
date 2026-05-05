import { Pool, types } from "pg";

const PG_BIGINT_OID = 20;

function parseBigIntAsNumber(value: string): number {
  return Number(value);
}

export function createPool(databaseUrl: string): Pool {
  types.setTypeParser(PG_BIGINT_OID, parseBigIntAsNumber);
  return new Pool({
    connectionString: databaseUrl
  });
}
