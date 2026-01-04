import WebSocket from "ws";
import { Phase, type PhaseMessage, type AckMessage } from "../types";

export default class AppClient {
  private ws: WebSocket;
  private appId: string = "";
  private name: string;

  constructor(name: string, coordinatorUrl: string) {
    this.name = name;
    this.ws = new WebSocket(coordinatorUrl);

    this.ws.on("open", () => {
      console.log(`[${this.name}] Connected to coordinator`);
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data);
    });

    this.ws.on("close", () => {
      console.log(`[${this.name}] disconnected from coord`);
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
        setTimeout(() => {
          this.sendAcknowledgment(Phase.APPLY);
        }, 100);
        break;

      case Phase.CONFIRM:
        console.log(`[${this.name}] migration conf`);
        break;

      case Phase.ROLLBACK:
        console.log(`[${this.name}]  rolling back `);
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

  disconnect() {
    this.ws.close();
    console.log(`[${this.name}] Disconnecting...`);
  }
}
