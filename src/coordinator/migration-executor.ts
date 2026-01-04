import type { Pool } from "pg";

export default class MigrationExecutor {
  private pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async executeMigrations(
    sql: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      console.log("starting migrations");
      for (const query of sql) {
        console.log(`executing ${query}`);
        await client.query(query);
      }
      await client.query("COMMIT");
      return { success: true };
    } catch (error: any) {
      await client.query("ROLLBACK");
      return { success: false, error };
    }
    finally{
        client.release()
    }
  }
}
