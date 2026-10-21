"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bot, Trash2, Sparkles } from "lucide-react";

import { useApp } from "@/lib/store";
import { CERT_BY_ID } from "@/data";
import { askBuddy, starterPrompts } from "@/lib/ai";
import type { BuddyMode } from "@/lib/types";
import { Card, Button, Badge, Input } from "@/components/ui";

const MODES: { id: BuddyMode; label: string }[] = [
  { id: "explain", label: "Explain like I'm a beginner" },
  { id: "analogy", label: "Give me an analogy" },
  { id: "compare", label: "Compare X vs Y" },
  { id: "quiz", label: "Quiz me on this" },
  { id: "tip", label: "Exam tip" },
];

/**
 * Minimal inline formatter for the buddy's replies — handles bold, italic and
 * bullet lists without pulling in a markdown dependency.
 */
function RichText({ content }: { content: string }) {
  const blocks = content.split("\n");
  return (
    <div className="space-y-1">
      {blocks.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("• ")) {
          return (
            <p key={i} className="pl-3">
              <span className="text-accent">•</span>{" "}
              {inline(line.slice(2))}
            </p>
          );
        }
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function BuddyPage() {
  const s = useApp();
  const cert = CERT_BY_ID[s.activeCertId ?? "az-900"] ?? CERT_BY_ID["az-900"];
  const messages = s.chatByCert[cert.id] ?? [];
  const [mode, setMode] = useState<BuddyMode>("explain");
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing]);

  const send = async (text: string, m: BuddyMode = mode) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;

    s.appendChat(cert.id, {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      content: trimmed,
      at: Date.now(),
      mode: m,
    });
    s.touchStreak();
    setInput("");
    setTyping(true);

    try {
      const reply = await askBuddy({ certId: cert.id, mode: m, topic: trimmed });
      s.appendChat(cert.id, {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        content: reply.content,
        at: Date.now(),
        mode: m,
      });
    } catch {
      s.appendChat(cert.id, {
        id: `a-${Date.now()}-error`,
        role: "assistant",
        content:
          "Something went wrong generating that reply. Try rephrasing your question, or ask about a term from the exam outline.",
        at: Date.now(),
        mode: m,
      });
    } finally {
      setTyping(false);
    }
  };

  const starters = starterPrompts(cert.id);

  return (
    <div className="mx-auto flex h-[calc(100dvh-13rem)] max-w-2xl flex-col py-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold tracking-tight">AI Study Buddy — {cert.examCode}</h1>
        <Badge tone="accent">
          <Bot className="h-3 w-3" /> Original content only
        </Badge>
        {messages.length ? (
          <button
            onClick={() => s.clearChat(cert.id)}
            aria-label="Clear conversation"
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={`focus-ring rounded-full border px-3 py-1 text-xs transition-colors ${
              mode === m.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask about any concept from {cert.name}. The buddy answers from CertPath&apos;s own
              question and flashcard bank, so everything it says is original study material.
            </p>
            <div className="flex flex-wrap gap-2">
              {starters.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
                >
                  <Sparkles className="h-3 w-3" /> {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              I&apos;m an independent study aid — not an official vendor resource.
            </p>
          </div>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-accent text-accent-foreground" : "glass"
              }`}
            >
              {m.role === "assistant" ? (
                <RichText content={m.content} />
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}

        {typing ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:240ms]" />
            Study Buddy is thinking…
          </p>
        ) : null}

        {messages.length > 0 && messages[messages.length - 1].role === "assistant" ? (
          <div className="flex flex-wrap gap-2">
            {["Give me an analogy", "Quiz me on this", "Exam tip for this topic"].map((f) => (
              <button
                key={f}
                onClick={() => send(f)}
                className="focus-ring rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={endRef} />
      </Card>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${cert.examCode}…`}
          aria-label="Message the study buddy"
          disabled={typing}
        />
        <Button type="submit" aria-label="Send" disabled={typing || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
