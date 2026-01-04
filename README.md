# Live Schema Migration Coordinator

A zero-downtime database schema migration system that coordinates schema changes across multiple running application instances in real-time.

## Problem Statement

Traditional database migrations require downtime because:

- If you run migrations first, old code breaks (expects old schema)
- If you deploy new code first, it breaks (expects new schema)
- Restarting all applications causes service interruption
- Rolling deployments create inconsistency (some apps see old schema, some see new)

## Solution

This coordinator orchestrates migrations through synchronized phases:

1. Applications connect to a central coordinator via WebSocket
2. Coordinator announces upcoming schema changes
3. All applications acknowledge they are ready
4. Coordinator executes the database migration
5. Applications update their behavior to use the new schema
6. Migration completes with zero downtime

## Architecture

The system has three main components:

### Coordinator Server

Central hub that:

- Manages WebSocket connections from application instances
- Orchestrates migration phases
- Executes SQL migrations on the database
- Tracks acknowledgments from all apps
- Handles rollback if any app fails to respond

### App Clients

Application instances that:

- Connect to the coordinator via WebSocket
- Listen for migration phase messages
- Acknowledge each phase
- Update their behavior when instructed

### Migration Phases

**ANNOUNCE**: Coordinator informs apps of upcoming migration. Apps prepare and acknowledge.

**EXECUTE**: Coordinator runs SQL statements on the database. Apps wait.

**APPLY**: Apps switch to using the new schema. Apps acknowledge when done.

**CONFIRM**: Final confirmation that migration succeeded.

**ROLLBACK**: If anything fails, coordinator tells apps to revert changes.

## Project Structure

```
db-realtime-migrator/
├── src/
│   ├── types/
│   │   └── index.ts              # Shared TypeScript interfaces
│   ├── coordinator/
│   │   ├── server.ts             # WebSocket coordinator server
│   │   └── migration-executor.ts # PostgreSQL migration executor
│   ├── client/
│   │   └── app-client.ts         # App instance client
│   └── demo.ts                   # Demo script
├── test-postgres.ts              # PostgreSQL connection test
└── package.json
```

## Prerequisites

- Node.js or Bun runtime
- PostgreSQL database (Docker or native installation)
- Basic understanding of WebSockets and async/await

## Installation

### 1. Install Dependencies

```bash
bun install
# or
npm install
```

Required packages:

- `ws` - WebSocket library
- `pg` - PostgreSQL client
- `uuid` - Unique ID generation

### 2. Setup PostgreSQL

#### Option A: Using Docker (Recommended)

```bash
docker run --name migration-postgres \
  -e POSTGRES_PASSWORD=mysecret \
  -e POSTGRES_DB=myapp \
  -e POSTGRES_USER=myuser \
  -p 5432:5432 \
  -d postgres:16
```

#### Option B: Native Installation

Install PostgreSQL on your system and create a database:

```sql
CREATE DATABASE myapp;
CREATE USER myuser WITH PASSWORD 'mysecret';
GRANT ALL PRIVILEGES ON DATABASE myapp TO myuser;
```

### 3. Test Database Connection

```bash
bun test-postgres.ts
```

Expected output:

```
Connected to PostgreSQL
Current time: 2026-01-04T...
Table created
Column added
Column dropped (rollback)
All tests passed!
```

## Usage

### Running the Demo

The demo demonstrates a complete migration flow with 3 simulated application instances.

```bash
bun src/demo.ts
```

The demo will:

1. Connect to PostgreSQL
2. Create a test table with initial schema
3. Start the coordinator server
4. Create 3 app client instances
5. Execute a migration that adds email columns
6. Verify the schema changes
7. Clean up and exit

## Using in Your Application

### 1. Create Coordinator Server

```typescript
import { Pool } from "pg";
import CoordinatorServer from "./coordinator/server";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "myapp",
  user: "myuser",
  password: "mysecret",
});

const coordinator = new CoordinatorServer(8080, pool);
coordinator.start();
```

### 2. Connect App Clients

In each application instance:

```typescript
import AppClient from "./client/app-client";

const client = new AppClient("App-1", "ws://localhost:8080");
```

### 3. Execute a Migration

```typescript
import { v4 as uuidv4 } from "uuid";
import { MigrationStatus } from "./types";

const migration = {
  id: uuidv4(),
  name: "add_user_email",
  sql: [
    "ALTER TABLE users ADD COLUMN email TEXT",
    "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE",
  ],
  status: MigrationStatus.PENDING,
  startedAt: new Date(),
};

await coordinator.startMigration(migration);
```

## How It Works

### Phase Flow Diagram

```
Coordinator                    App-1        App-2        App-3
    |                            |            |            |
    |--- ANNOUNCE -------------→ |            |            |
    |                            |← ACK ------┘            |
    |                            |← ACK ------------------┘
    |                            |← ACK -------------------------┘
    |                            |            |            |
    |--- EXECUTE (RUNNING) ----→ |            |            |
    |                            |            |            |
    | [runs SQL on database]     |            |            |
    |                            |            |            |
    |--- EXECUTE (COMPLETED) --→ |            |            |
    |                            |            |            |
    |--- APPLY ----------------→ |            |            |
    |                            |← ACK ------┘            |
    |                            |← ACK ------------------┘
    |                            |← ACK -------------------------┘
    |                            |            |            |
    |--- CONFIRM --------------→ |            |            |
    |                            |            |            |
```

### Database Schema Evolution

**Before Migration:**

```sql
users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP
)
```

**After EXECUTE Phase:**

```sql
users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP,
  email TEXT,              -- NEW
  email_verified BOOLEAN   -- NEW
)
```

Apps continue using old queries until APPLY phase. This is safe because PostgreSQL allows querying a subset of columns.

**After APPLY Phase:**

Apps switch to querying all columns including the new ones.

## Error Handling and Rollback

### Timeout Scenario

If any app fails to acknowledge within 30 seconds:

1. Coordinator detects timeout
2. Sends ROLLBACK to all apps
3. Sets migration status to FAILED
4. Apps revert to previous behavior

### SQL Execution Failure

If database migration fails:

1. PostgreSQL transaction rolls back (no partial changes)
2. Coordinator sends ROLLBACK to all apps
3. Migration marked as FAILED

## Key Features

**Zero Downtime**: Applications continue serving requests throughout the migration.

**Transaction Safety**: SQL statements execute in a PostgreSQL transaction (all-or-nothing).

**Timeout Protection**: Migrations automatically rollback if apps don't respond within 30 seconds.

**Coordinated Phases**: All apps synchronize at each phase before proceeding.

**Acknowledgment Tracking**: Coordinator waits for ALL apps to acknowledge before continuing.

## Verification

After running the demo, verify schema changes manually:

```bash
# Connect to PostgreSQL
docker exec -it migration-postgres psql -U myuser -d myapp

# View table schema
\d users

# Expected output shows new columns:
# - email (text)
# - email_verified (boolean)
```
