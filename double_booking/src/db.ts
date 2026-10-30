import "dotenv/config";
import pg from "pg";

// Connection details come from PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

// PostgreSQL error codes
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_CHECK_VIOLATION = "23514";
