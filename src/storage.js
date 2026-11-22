import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
export const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});
