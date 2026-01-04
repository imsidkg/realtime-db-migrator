import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  user: 'myuser',  
  password: 'mysecret'
});

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Connected to PostgreSQL');
    console.log('  Current time:', result.rows[0].now);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created');
    
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
    console.log('✓ Column added');
    
    await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS email');
    console.log('✓ Column dropped (rollback)');
    
    await pool.end();
    console.log('✓ All tests passed!');
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

test();