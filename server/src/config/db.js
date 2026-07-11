'use strict';
const { Pool, types } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

// By default node-postgres parses DATE columns into a JS Date at LOCAL
// midnight, which silently drifts by the server's UTC offset whenever that
// value is later round-tripped through date-only arithmetic. Keeping the
// raw 'YYYY-MM-DD' string avoids that entire class of off-by-one bugs.
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool(
    env.db.url
        ? {
              connectionString: env.db.url,
              max: env.db.poolMax,
              ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 5000
          }
        : {
              host: env.db.host,
              port: env.db.port,
              database: env.db.database,
              user: env.db.user,
              password: env.db.password,
              max: env.db.poolMax,
              ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 5000
          }
);

pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Always use parameterized queries ($1, $2, ...) — never string-concatenate
 * user input into SQL. This is the primary SQL-injection defense.
 */
async function query(text, params) {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 200) {
        logger.warn('Slow query', { text, duration });
    }
    return result;
}

async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, withTransaction };
