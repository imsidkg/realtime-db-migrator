import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import MigrationExecutor from "./migration-executor";
import type { AckMessage, Migration, Phase } from "../types";

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
}
