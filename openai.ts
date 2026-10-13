
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import "dotenv/config";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing in the root environment.");
}

const ai = new OpenAI({ apiKey });

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Sugarcane AI API" });
});

app.post("/api/chat", async (req, res) => {
  const question = req.body?.message;

  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "Please enter a question." });
    return;
  }

  const client = new Client({
    name: "sugarcane-ai-web-client",
    version: "1.0.0",
  });

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Supabase environment variables are missing.");
    }

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "mcp-server.ts"],
      env: {
        ...process.env,
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: key,
      } as Record<string, string>,
    });

    await client.connect(transport);

    const { tools } = await client.listTools();
    const farmerTool = tools.find(
      (tool) => tool.name === "get_farmer_data"
    );

    if (!farmerTool) {
      throw new Error("MCP tool get_farmer_data was not found.");
    }

    const openAITools = [
      {
        type: "function" as const,
        name: "get_farmer_data",
        description:
          "Retrieve farmer records from Supabase for questions about sugarcane supply and payments.",
        parameters: {
          type: "object" as const,
          properties: {},
          required: [],
          additionalProperties: false,
        },
        strict: true,
      },
    ];

    let response = await ai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You are Sugarcane AI, an assistant for farmer and sugarcane payment data. Use the get_farmer_data tool for questions that need farmer records or calculations. Base factual answers on the returned records. Clearly show rupee amounts and do not invent records.",
      input: question,
      tools: openAITools,
      tool_choice: "required",
    });

    for (let step = 0; step < 5; step++) {
      const calls = response.output.filter(
        (item) => item.type === "function_call"
      );

      if (calls.length === 0) break;

      const outputs = [];

      for (const call of calls) {
        if (call.name !== "get_farmer_data") {
          throw new Error(`Unknown tool: ${call.name}`);
        }

        const result = await client.callTool({
          name: "get_farmer_data",
          arguments: {},
        });

        if (result.isError) {
          throw new Error(
            "MCP tool failed: " + JSON.stringify(result.content)
          );
        }

        const textContent = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");

        if (!textContent.trim()) {
          throw new Error(
            "MCP returned empty data. Check the MCP server and Supabase query."
          );
        }

        outputs.push({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: textContent,
        });
      }

      response = await ai.responses.create({
        model: "gpt-4.1-mini",
        previous_response_id: response.id,
        input: outputs,
        tools: openAITools,
        tool_choice: "auto",
      });
    }

    const answer = response.output_text.trim();

    if (!answer) {
      throw new Error("OpenAI returned no text answer.");
    }

    res.json({ answer });
  } catch (error) {
    console.error("Sugarcane AI API error:", error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "An unexpected server error occurred.",
    });
  } finally {
    try {
      await client.close();
    } catch (error) {
      console.error("MCP client cleanup error:", error);
    }
  }
});

app.listen(port, () => {
  console.log(`Sugarcane AI API running at http://localhost:${port}`);
});
