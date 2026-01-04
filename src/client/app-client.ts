import WebSocket from "ws";
import { Pool } from "pg";
import { Phase, type PhaseMessage, type AckMessage } from "../types";

export default class AppClient {
  private ws: WebSocket;
  private appId: string = "";
  private name: string;
  private useNewSchema: boolean = false;
  private pool: Pool;
  private queryInterval: NodeJS.Timeout | null = null;

  constructor(name: string, coordinatorUrl: string, pool: Pool) {
    this.name = name;
    this.pool = pool;
    this.ws = new WebSocket(coordinatorUrl);

    this.ws.on("open", () => {
      console.log(`[${this.name}] Connected to coordinator`);
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data);
    });

    this.ws.on("close", () => {
      console.log(`[${this.name}] disconnected from coord`);
      this.stopQueryingDatabase();
    });

    this.ws.on("error", (error) => {
      console.error(`[${this.name}] Error:`, error.message);
    });
  }

  private handleMessage(data: WebSocket.Data) {
    const message = JSON.parse(data.toString());

    if (message.type === "WELCOME") {
      this.appId = message.appId;
      console.log(`[${this.name}] received appId: ${this.appId}`);

      this.startQueryingDatabase();
      return;
    }

    const phaseMsg = message as PhaseMessage;

    switch (phaseMsg.phase) {
      case Phase.ANNOUNCE:
        console.log(`[${this.name}]  migration announced`);
        this.sendAcknowledgment(Phase.ANNOUNCE);
        break;

      case Phase.EXECUTE:
        if (phaseMsg.status === "RUNNING") {
          console.log(`[${this.name}]   migration exec`);
        } else if (phaseMsg.status === "COMPLETED") {
          console.log(`[${this.name}]  db migration completed`);
        }
        break;

      case Phase.APPLY:
        console.log(`[${this.name}]  Applying new schema`);

        this.useNewSchema = true;
        console.log(
          `[${this.name}]  Feature flag enabled: useNewSchema = true`
        );

        setTimeout(() => {
          this.sendAcknowledgment(Phase.APPLY);
        }, 100);
        break;

      case Phase.CONFIRM:
        console.log(`[${this.name}] migration conf`);
        break;

      case Phase.ROLLBACK:
        console.log(`[${this.name}]  rolling back`);

        this.useNewSchema = false;
        console.log(
          `[${this.name}]  Feature flag disabled: useNewSchema = false`
        );
        break;
    }
  }

  private sendAcknowledgment(phase: Phase) {
    const ack: AckMessage = {
      phase,
      status: "ACKNOWLEDGED",
      appId: this.appId,
    };

    this.ws.send(JSON.stringify(ack));
    console.log(`[${this.name}] Acknowledged ${phase}`);
  }

  async queryUsers(): Promise<void> {
    try {
      let query: string;

      if (this.useNewSchema) {
        query =
          "SELECT id, name, created_at, email, email_verified FROM users LIMIT 3";
      } else {
        query = "SELECT id, name, created_at FROM users LIMIT 3";
      }

      const result = await this.pool.query(query);
      const schemaType = this.useNewSchema ? "NEW" : "OLD";
      console.log(
        `[${this.name}] Query with ${schemaType} schema: ${result.rows.length} rows`
      );
    } catch (error: any) {
      console.error(`[${this.name}] Query error:`, error.message);
    }
  }

  private startQueryingDatabase() {
    this.queryInterval = setInterval(() => {
      this.queryUsers();
    }, 10000);
  }

  private stopQueryingDatabase() {
    if (this.queryInterval) {
      clearInterval(this.queryInterval);
      this.queryInterval = null;
    }
  }

  disconnect() {
    this.stopQueryingDatabase();
    this.ws.close();
    console.log(`[${this.name}] Disconnecting...`);
  }
}
