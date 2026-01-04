import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import MigrationExecutor from "./migration-executor";
import {
  MigrationStatus,
  Phase,
  type AckMessage,
  type Migration,
} from "../types";

export default class CoordinatorServer {
  private wss: WebSocketServer;
  private executor: MigrationExecutor;
  private apps: Map<string, WebSocket>;
  private currentMigration: Migration | null;
  private acknowledgments: Map<Phase, Set<string>>;
  private phaseTimeout: NodeJS.Timeout | null;

  constructor(port: number, pool: Pool) {
    this.wss = new WebSocketServer({ port });
    this.executor = new MigrationExecutor(pool);
    this.apps = new Map<string, WebSocket>();
    this.currentMigration = null;
    this.acknowledgments = new Map<Phase, Set<string>>();
    this.phaseTimeout = null;

    this.wss.on("connection", (ws) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket) {
    const appId = uuidv4();
    this.apps.set(appId, ws);
    console.log(`app conn: ${appId} total: ${this.apps.size}`);
    ws.send(JSON.stringify({ type: "WELCOME", appId }));

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString()) as AckMessage;
      this.handleAcknowledgment(appId, message);
    });

    ws.on("close", () => {
      this.apps.delete(appId);
      console.log("app disc");
    });
  }

  private handleAcknowledgment(appId: string, message: AckMessage) {
    //this will only check if the message is acknowledged by all the apps
    if (!this.acknowledgments.has(message.phase)) {
      //double check
      this.acknowledgments.set(message.phase, new Set<string>());
    }
    this.acknowledgments.get(message.phase)?.add(appId);

    const ackCount = this.acknowledgments.get(message.phase)?.size;
    const totalApps = this.apps.size;
    if (ackCount === totalApps) {
      console.log(`all ${totalApps} apps ack ${message.phase}`);
    }
  }

  private broadcast(message: any) {
    const data = JSON.stringify(message);

    //the message is sent to all the apps
    this.apps.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        console.log("connection not open");
      }
    });
  }

  private sendPhase(phase: Phase, status?: "RUNNING" | "COMPLETED" | "FAILED") {
    const message = {
      phase: phase,
      migrationId: this.currentMigration!.id,
      status: status,
      timestamp: new Date(),
    };

    console.log(`broadcasting ${phase}${status ? ` (${status})` : ""}`);

    this.broadcast(message);
  }
  private waitForAcknowledgments(phase: Phase, timeout: number): Promise<void> {
    return new Promise((res, rej) => {
      //double check
      this.acknowledgments.set(phase, new Set<string>());

      const timeoutId = setTimeout(() => {
        clearInterval(interval);
        const ackCount = this.acknowledgments.get(phase)?.size || 0;
        const totalApps = this.apps.size;
        rej(
          `Timeout: Only ${ackCount}/${totalApps} apps acknowledged ${phase}`
        );
      }, timeout);

      const interval = setInterval(() => {
        if (this.acknowledgments.get(phase)?.size === this.apps.size) {
          clearTimeout(timeoutId);
          clearInterval(interval);
          res();
        }
      }, 100);
    });
  }

  private rollback(reason: string) {
    console.error("rolling back", reason);
    if (this.currentMigration) {
      this.currentMigration.status = MigrationStatus.FAILED;
    }

    this.sendPhase(Phase.ROLLBACK);
  }

  async startMigration(migration: Migration): Promise<void> {
    this.currentMigration = migration;
    this.currentMigration.status = MigrationStatus.ANNOUNCING;
    this.currentMigration.startedAt = new Date();

    try {
      console.log(`Starting migration: ${migration.name}`);
      this.sendPhase(Phase.ANNOUNCE);
      await this.waitForAcknowledgments(Phase.ANNOUNCE, 30000);

      this.currentMigration.status = MigrationStatus.EXECUTING;
      this.sendPhase(Phase.EXECUTE, "RUNNING");

      const result = await this.executor.executeMigrations(migration.sql);

      if (!result.success) {
        this.rollback(`Migration execution failed: ${result.error}`);
        return;
      }

      this.sendPhase(Phase.EXECUTE, "COMPLETED");

      this.currentMigration.status = MigrationStatus.APPLYING;
      this.sendPhase(Phase.APPLY);
      await this.waitForAcknowledgments(Phase.APPLY, 30000);

      this.currentMigration.status = MigrationStatus.COMPLETED;
      this.currentMigration.completedAt = new Date();
      this.sendPhase(Phase.CONFIRM);

      console.log(`Migration "${migration.name}" completed successfully!`);
    } catch (error: any) {
      this.rollback(error);
    }
  }

  start() {
    console.log(
      `Coordinator server listening on port ${this.wss.options.port}`
    );
  }
}
