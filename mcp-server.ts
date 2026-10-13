
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createClient } from "@supabase/supabase-js";
import * as z from "zod/v4";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in MCP server environment."
  );
}

const db = createClient(url, key);

serveStdio(() => {
  const server = new McpServer({
    name: "sugarcane-farmer-server",
    version: "1.0.0",
  });

  server.registerTool(
    "get_farmer_data",
    {
      description:
        "Retrieve farmer records from Supabase, including village, supplied sugarcane, paid amount and pending payment.",
      inputSchema: z.object({}),
    },
    async () => {
      console.error("MCP tool called. Querying Supabase...");

      const { data, error } = await db
        .from("farmers")
        .select(
          "id,name,village,sugarcane_supplied_tonnes,amount_paid,payment_pending,total_amount"
        )
        .order("id");

      if (error) {
        console.error("Supabase query failed:", error.message);
        throw new Error("Supabase query failed: " + error.message);
      }

      console.error("Farmer rows returned:", data?.length ?? 0);

      if (!data || data.length === 0) {
        throw new Error(
          "No farmer rows found. Check the public.farmers table and its records."
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  return server;
});
