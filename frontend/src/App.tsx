
import { useState } from "react";
import type * as React from "react";
import {
  Leaf,
  Send,
  Sprout,
  User,
  Bot,
  LoaderCircle,
} from "lucide-react";
import "./App.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  answer?: string;
  error?: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Namaskar! 🌱 I'm Sugarcane AI. Ask me about farmers, sugarcane supply, paid amounts, or pending payments.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(
    event?: React.FormEvent<HTMLFormElement>,
    suggestedQuestion?: string
  ) {
    event?.preventDefault();

    const message = (suggestedQuestion ?? input).trim();

    if (!message || loading) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: message },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      // Read the response as text first to handle empty or invalid JSON.
      const raw = await response.text();

      let data: ChatResponse;

      try {
        data = JSON.parse(raw) as ChatResponse;
      } catch {
        throw new Error(
          `Invalid or empty server response (HTTP ${response.status}). ` +
            `Response: ${raw || "(empty response)"}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed with status ${response.status}.`
        );
      }

      if (typeof data.answer !== "string" || !data.answer.trim()) {
        throw new Error("The server response does not contain an answer.");
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer!,
        },
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Sorry, I couldn't connect: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Which farmers have pending payments?",
    "Calculate the total pending payment.",
    "Show farmers who supplied more than 100 tonnes.",
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Leaf size={25} />
          </div>

          <div>
            <h2>Sugarcane AI</h2>
            <span>Farmer Intelligence</span>
          </div>
        </div>

        <div className="sidebar-label">YOUR ASSISTANT</div>

        <div className="nav-item active">
          <Sprout size={18} />
          Farmer Insights
        </div>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>AI assistant interface</span>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <h1>Farmer Assistant</h1>
            <p>Ask questions about sugarcane and farmer payments</p>
          </div>

          <div className="online-pill">
            <span />
            AI Assistant
          </div>
        </header>

        <div className="chat-content">
          <div className="welcome">
            <div className="welcome-icon">
              <Sprout size={30} />
            </div>

            <h2>Your sugarcane data, made simpler.</h2>
            <p>
              Ask a question in plain English to explore your farmer records.
            </p>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message, index) => (
              <div
                className={`message-row ${message.role}`}
                key={`${message.role}-${index}`}
              >
                <div className="avatar">
                  {message.role === "assistant" ? (
                    <Bot size={18} />
                  ) : (
                    <User size={18} />
                  )}
                </div>

                <div className="message-bubble">
                  <div className="message-author">
                    {message.role === "assistant" ? "Sugarcane AI" : "You"}
                  </div>

                  <div className="message-text">{message.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row assistant">
                <div className="avatar">
                  <Bot size={18} />
                </div>

                <div className="message-bubble">
                  <LoaderCircle className="spinner" size={18} />
                  <span className="thinking">
                    Checking your farmer data...
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="suggestions">
            <div className="suggestions-label">TRY ASKING</div>

            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                className="suggestion"
                disabled={loading}
                onClick={() => void sendMessage(undefined, question)}
              >
                {question} <span>↗</span>
              </button>
            ))}
          </div>
        </div>

        <div className="composer-wrap">
          <form
            className="composer"
            onSubmit={(event) => void sendMessage(event)}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about farmers, supply, or pending payments..."
              aria-label="Your question"
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {loading ? (
                <LoaderCircle size={19} className="spinner" />
              ) : (
                <Send size={19} />
              )}
            </button>
          </form>

          <p className="disclaimer">
            Answers are generated from the records returned by your connected
            data tool.
          </p>
        </div>
      </section>
    </main>
  );
}
