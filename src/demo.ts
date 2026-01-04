import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import CoordinatorServer from "./coordinator/server";
import AppClient from "./client/app-client";
import { MigrationStatus, type Migration } from "./types";

async function runDemo() {
  console.log("=".repeat(60));
  console.log("  Live Schema Migration Coordinator - Demo");
  console.log("=".repeat(60));
  console.log();

  console.log(" Setting up PostgreSQL connection...");
  const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "myapp",
    user: "myuser",
    password: "mysecret",
  });

  try {
    // Test connection
    await pool.query("SELECT NOW()");
    console.log("Connected to PostgreSQL");
    console.log();
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    process.exit(1);
  }

  // Step 2: Create test table
  console.log("Setting up test table...");
  try {
    await pool.query(`
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log(" Test table 'users' created");

    await pool.query(`
      INSERT INTO users (name) VALUES
        ('Alice'),
        ('Bob'),
        ('Charlie'),
        ('Diana'),
        ('Eve');
    `);
    console.log(" Inserted 5 test users");
    console.log();
  } catch (error) {
    console.error("Failed to create table:", error);
    await pool.end();
    process.exit(1);
  }

  // Step 3: Start coordinator server
  console.log(" Starting coordinator server...");
  const coordinator = new CoordinatorServer(8080, pool);
  coordinator.start();
  console.log();

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 4: Create app clients
  console.log("Creating app client instances...");
  const apps = [
    new AppClient("App-1", "ws://localhost:8080", pool),
    new AppClient("App-2", "ws://localhost:8080", pool),
    new AppClient("App-3", "ws://localhost:8080", pool),
  ];
  console.log(` Created ${apps.length} app instances`);
  console.log();

  console.log("Waiting for all apps to connect...");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log();

  // Step 5: Create migration
  console.log("=".repeat(60));
  console.log("  Starting Migration");
  console.log("=".repeat(60));
  console.log();

  const migration: Migration = {
    id: uuidv4(),
    name: "add_email_verified_column",
    sql: [
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE",
    ],
    status: MigrationStatus.PENDING,
    startedAt: new Date(),
  };

  console.log(` Migration: ${migration.name}`);
  console.log(` SQL Statements:`);
  migration.sql.forEach((sql, i) => {
    console.log(`   ${i + 1}. ${sql}`);
  });
  console.log();

  console.log("Executing migration...");
  console.log();

  try {
    await coordinator.startMigration(migration);

    console.log();
    console.log("=".repeat(60));
    console.log("Migration Complete");
    console.log("=".repeat(60));
    console.log();

    // Verify the changes
    console.log(" Verifying database schema...");
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

    console.log("Current schema:");
    result.rows.forEach((row) => {
      console.log(
        `   - ${row.column_name} (${row.data_type})${
          row.column_default ? ` DEFAULT ${row.column_default}` : ""
        }`
      );
    });
    console.log();
  } catch (error) {
    console.error();
    console.error("=".repeat(60));
    console.error("  Migration Failed!");
    console.error("=".repeat(60));
    console.error("Error:", error);
    console.error();
  }

  console.log(" Cleaning up...");
  apps.forEach((app) => app.disconnect());
  await new Promise((resolve) => setTimeout(resolve, 500));
  await pool.end();
  console.log(" Cleanup complete");
  console.log();

  console.log("=".repeat(60));
  console.log("  Demo Complete!");
  console.log("=".repeat(60));

  process.exit(0);
}

runDemo().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
