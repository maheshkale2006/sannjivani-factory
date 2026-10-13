
import dotenv from "dotenv";
import path from "node:path";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

// Load environment variables from the project root.
const envPath = path.resolve(process.cwd(), ".env");
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(
    "Local .env file not loaded. Using environment variables provided by the deployment platform."
  );
}

const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing.");
}

const app = express();
const port = Number(process.env.PORT || 3001);
const ai = new OpenAI({ apiKey });

// Allow the deployed frontend and local development frontend.
const allowedOrigins = [
  "https://frontend-eight-brown-50.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permit requests without an Origin header, such as PowerShell tests.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed by CORS."));
      }
    },
  })
);

app.use(express.json({ limit: "20kb" }));

// Health check.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Sugarcane AI API",
  });
});

// Chat endpoint.
app.post("/api/chat", async (req, res) => {
  const question: unknown = req.body?.message;

  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({
      error: "Please enter a question.",
    });
    return;
  }

  if (question.length > 4000) {
    res.status(400).json({
      error: "Please keep your question under 4000 characters.",
    });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({
      error: "Supabase environment variables are missing.",
    });
    return;
  }

  const client = new Client({
    name: "sugarcane-ai-web-client",
    version: "1.0.0",
  });

  let connected = false;

  try {
    // Start the MCP server as a child process.
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "mcp-server.ts"],
      env: {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
      } as Record<string, string>,
    });

    await client.connect(transport);
    connected = true;

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
        "You are Sugarcane AI, an assistant for farmer and sugarcane payment data. Use get_farmer_data for questions requiring farmer records. Base factual answers and calculations on returned records only. Never invent farmer records. Format currency in Indian rupees.",
      input: question.trim(),
      tools: openAITools,
      tool_choice: "required",
    });

    // Handle MCP tool calls.
    for (let step = 0; step < 5; step++) {
      const calls = response.output.filter(
        (item) => item.type === "function_call"
      );

      if (calls.length === 0) {
        break;
      }

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
            "MCP returned empty data. Check the Supabase query and MCP server."
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
    console.error(
      "Sugarcane AI API error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    if (!res.headersSent) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "An unexpected server error occurred.",
      });
    }
  } finally {
    if (connected) {
      try {
        await client.close();
      } catch (error) {
        console.error(
          "MCP client cleanup error:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  }
});

// Handle unknown routes.
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Sugarcane AI API listening on port ${port}`);
});
