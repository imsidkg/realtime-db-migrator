// i am using strings as enum directly for the sake of debugging otherwise wehn i log messages i will see "ANNOUNCE" instead of 0,1, likewise
export enum Phase {
  ANNOUNCE = "ANNOUNCE",
  EXECUTE = "EXECUTE",
  APPLY = "APPLY",
  CONFIRM = "CONFIRM",
  ROLLBACK = "ROLLBACK",
}

export enum MigrationStatus {
  PENDING = "PENDING",
  ANNOUNCING = "ANNOUNCING",
  EXECUTING = "EXECUTING",
  APPLYING = "APPLYING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface PhaseMessage {
  phase: Phase;
  migrationId: string;
  status?: "RUNNING" | "COMPLETED" | "FAILED";
  timestamp: Date;
}

export interface AppConnection {
  id: string;
  websocket: WebSocket;
  acknowledgedPhases: Set<string>;
  lastHeartbeat: Date;
  healthy: boolean;
}

export interface Migration {
  id: string;
  name: string;
  sql: string[];
  status: MigrationStatus;
  completedAt?: Date;
  startedAt: Date;
}

export interface AckMessage {
  phase: Phase;
  status: "ACKNOWLEDGED" | "ERROR";
  appId: string;
  error?: string;
}
