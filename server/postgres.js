import pg from 'pg';

export const postgres = new pg.Pool({
  host: 'postgres',
  user: 'playwright',
  password: 'playwright',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
process.on('SIGINT', function () {
  postgres.end();
});
