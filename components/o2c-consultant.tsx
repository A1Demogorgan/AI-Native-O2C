"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsultantBrief } from "@/lib/consultant/context";

type Props = {
  areaId: string;
  areaLabel: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function toneClass(prefix: string, tone: ConsultantBrief["promptTone"] | undefined) {
  if (tone === "red") return `${prefix} ${prefix}-red`;
  if (tone === "amber") return `${prefix} ${prefix}-amber`;
  return `${prefix} ${prefix}-green`;
}

export default function O2CConsultant({ areaId, areaLabel }: Props) {
  const [brief, setBrief] = useState<ConsultantBrief | null>(null);
  const [open, setOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setShowPrompt(false);
    setOpen(false);
    setErr("");

    fetch(`/api/consultant/brief?area_id=${encodeURIComponent(areaId)}&area_label=${encodeURIComponent(areaLabel)}`)
      .then((res) => res.json())
      .then((data: ConsultantBrief) => {
        if (cancelled) return;
        setBrief(data);
        setMessages([
          {
            role: "assistant",
            content: `${data.insightTitle}\n\n${data.teaser}\n\n${data.recommendations.slice(0, 2).join("\n")}`,
          },
        ]);
        if (data.shouldPrompt) {
          window.setTimeout(() => {
            if (!cancelled) {
              setShowPrompt(true);
            }
          }, 700);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrief(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [areaId, areaLabel]);

  useEffect(() => {
    if (!open) return;
    const node = chatLogRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setErr("");

    try {
      const res = await fetch("/api/consultant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area_id: areaId,
          area_label: areaLabel,
          messages: nextMessages,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; brief?: ConsultantBrief };
      if (!res.ok) {
        setErr(data.error ?? "The consultant could not respond.");
        setBusy(false);
        return;
      }
      if (data.brief) {
        setBrief(data.brief);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "No reply returned." }]);
    } catch {
      setErr("The consultant could not respond.");
    } finally {
      setBusy(false);
    }
  }

  const promptTone = brief?.promptTone ?? "green";

  return (
    <div className="consultant-shell" aria-live="polite">
      {showPrompt && !open && brief && (
        <button className={toneClass("consultant-teaser", promptTone)} onClick={() => setOpen(true)}>
          <strong>{brief.insightTitle}</strong>
          <span>{brief.teaser}</span>
        </button>
      )}

      {open && brief && (
        <section className="consultant-panel">
          <div className="consultant-panel-header">
            <div className="consultant-panel-title">
              <strong>O2C Consultant</strong>
              <span>{brief.areaLabel}</span>
            </div>
            <button className="secondary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          <div className="consultant-panel-body">
            <div className="consultant-metrics">
              {brief.metrics.map((metric) => (
                <div className="consultant-metric" key={metric.label}>
                  <div className="label">{metric.label}</div>
                  <div className="value">{metric.value}</div>
                </div>
              ))}
            </div>

            <p className="muted-note" style={{ margin: 0 }}>{brief.contextSummary}</p>

            <div className="consultant-suggestions">
              {brief.suggestedQuestions.map((question) => (
                <button key={question} className="secondary" onClick={() => sendMessage(question)}>
                  {question}
                </button>
              ))}
            </div>

            <div ref={chatLogRef} className="consultant-chat-log">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`consultant-message ${
                    message.role === "assistant" ? "consultant-message-assistant" : "consultant-message-user"
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>

            {err && <div className="consultant-error">{err}</div>}
          </div>

          <div className="consultant-input-row">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask how to improve cycle time, DSO, top line, or customer behavior."
            />
            <button onClick={() => sendMessage(input)} disabled={busy || !input.trim()}>
              {busy ? "Thinking..." : "Ask"}
            </button>
          </div>
        </section>
      )}

      <button
        className={toneClass("consultant-fab", promptTone)}
        onClick={() => {
          setOpen((prev) => !prev);
          setShowPrompt(false);
        }}
      >
        O2C Consultant
      </button>
    </div>
  );
}
