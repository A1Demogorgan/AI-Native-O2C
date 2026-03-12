"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CapturedOrder, OrderCaptureDraft, OrderLineItem } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type WorkflowStage = {
  stage: string;
  agents: Array<{ id: string; label: string }>;
};

type ChatProfile = {
  user_name: string;
  user_email: string;
  customer_name: string;
  customer_email: string;
  customer_id: string;
  ship_to_default: string;
  currency: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  pricing_quotes?: Array<{
    sku: string;
    unit_price: number;
    currency: string;
    contract_clause: string;
    contract_link: string;
  }>;
};

const STAGES: WorkflowStage[] = [
  {
    stage: "Order Management",
    agents: [
      { id: "order-capture", label: "Order Capture - Email" },
      { id: "order-capture-chatbot", label: "Order Capture - Chatbot" },
      { id: "order-validation", label: "Order Validation" },
      { id: "credit-risk", label: "Credit Risk" },
      { id: "hold-resolution", label: "Hold Resolution" },
    ],
  },
  {
    stage: "Shipping",
    agents: [
      { id: "inventory-allocation", label: "Inventory & Allocation" },
      { id: "shipment-planning", label: "Shipment Planning" },
    ],
  },
  {
    stage: "Billing",
    agents: [
      { id: "billing-intelligence", label: "Billing Intelligence" },
      { id: "invoice-matching", label: "Invoice Matching" },
    ],
  },
  {
    stage: "Cash & Collections",
    agents: [
      { id: "payment-prediction", label: "Payment Prediction" },
      { id: "collections-strategy", label: "Collections Strategy" },
      { id: "collections-communications", label: "Collections Communications" },
      { id: "cash-application", label: "Cash Application" },
      { id: "dispute-triage-resolution", label: "Dispute Triage & Resolution" },
    ],
  },
];

const WORKSPACE_ROUTES: Record<string, string> = {
  "order-capture": "/agents",
  "order-capture-chatbot": "/agents/chatbot",
  "cash-application": "/payments",
  "dispute-triage-resolution": "/disputes",
  "collections-strategy": "/collections",
};

function renderOrderTotal(items: OrderLineItem[] | undefined, fallback?: number) {
  if (!items || items.length === 0) return fallback ?? 0;
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

function parseLineItems(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Array<{ sku: string; quantity: number; unit_price: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AgentChatbotPage() {
  const router = useRouter();
  const [draftInput, setDraftInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "What do you like to order?" },
  ]);
  const [orderDraft, setOrderDraft] = useState<Partial<OrderCaptureDraft>>({});
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [readyToPost, setReadyToPost] = useState(false);
  const [autoPostWhenReady, setAutoPostWhenReady] = useState(false);
  const [postPromptShown, setPostPromptShown] = useState(false);
  const [hasPostedCurrentOrder, setHasPostedCurrentOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [postedOrder, setPostedOrder] = useState<CapturedOrder | null>(null);
  const [records, setRecords] = useState<CapturedOrder[]>([]);
  const [sessionStart] = useState(() => Date.now());
  const [openCardId, setOpenCardId] = useState("");

  async function loadRecords() {
    const res = await fetch("/api/orders");
    const data = (await res.json()) as CapturedOrder[];
    setRecords(data);
  }

  useEffect(() => {
    fetch("/api/session/profile")
      .then((res) => res.json())
      .then((data: ChatProfile) => {
        setProfile(data);
        setOrderDraft((prev) => ({
          ...prev,
          customer_name: prev.customer_name ?? data.customer_name,
          customer_email: prev.customer_email ?? data.customer_email,
          ship_to: prev.ship_to ?? data.ship_to_default,
          currency: prev.currency ?? data.currency,
        }));
      })
      .catch(() => {
        setError("Unable to load sign-in context.");
      });
    loadRecords();
  }, []);

  function isPostIntent(text: string) {
    return /(post|submit|place)\s+(the\s+)?order/i.test(text) || /go ahead/i.test(text);
  }

  function isAutoPostIntent(text: string) {
    return /auto\s*post|post automatically|submit automatically/i.test(text);
  }

  function isNewOrderIntent(text: string) {
    return /order again|order more|more mattresses|new order|another order/i.test(text);
  }

  function resetOrderCycle(nextMessages?: ChatMessage[]) {
    setOrderDraft(
      profile
        ? {
            customer_name: profile.customer_name,
            customer_email: profile.customer_email,
            ship_to: profile.ship_to_default,
            currency: profile.currency,
          }
        : {},
    );
    setReadyToPost(false);
    setAutoPostWhenReady(false);
    setPostPromptShown(false);
    setHasPostedCurrentOrder(false);
    setPostedOrder(null);
    if (nextMessages) {
      setMessages(nextMessages);
    }
  }

  async function sendMessage() {
    const text = draftInput.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setPostedOrder(null);

    const nextMessages = [...messages, { role: "user" as const, text }];
    setMessages(nextMessages);
    setDraftInput("");

    if (hasPostedCurrentOrder && isNewOrderIntent(text)) {
      const restartMessages = [
        ...nextMessages,
        { role: "assistant" as const, text: "Sure. Starting a new order. What would you like to order?" },
      ];
      resetOrderCycle(restartMessages);
      setBusy(false);
      return;
    }

    if (hasPostedCurrentOrder && isPostIntent(text)) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "This order is already posted. If you want another one, say 'order again' or 'order more mattresses'.",
        },
      ]);
      setBusy(false);
      return;
    }

    if (isAutoPostIntent(text)) {
      setAutoPostWhenReady(true);
    }

    if (isPostIntent(text) && readyToPost) {
      await postOrder();
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/agents/order-capture/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages.map((m) => ({ role: m.role, content: m.text })),
          draft: orderDraft,
          profile,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        assistant_message?: string;
        order_draft?: Partial<OrderCaptureDraft>;
        ready_to_post?: boolean;
        pricing_quotes?: Array<{
          sku: string;
          unit_price: number;
          currency: string;
          contract_clause: string;
          contract_link: string;
        }>;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Chat turn failed.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.assistant_message ?? "Please provide the next order detail.",
          pricing_quotes: data.pricing_quotes ?? [],
        },
      ]);
      setOrderDraft((prev) => ({ ...prev, ...(data.order_draft ?? {}) }));
      const ready = Boolean(data.ready_to_post);
      setReadyToPost(ready);

      if (ready && !postPromptShown && !hasPostedCurrentOrder) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: autoPostWhenReady
              ? "I have all required order details. Posting your order now."
              : "I have all required order details. Would you like me to post the order now?",
          },
        ]);
        setPostPromptShown(true);
      }

      if (ready && autoPostWhenReady) {
        await postOrder();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send chat message.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I can only assist SBB mattress order capture. Please provide order-specific details.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function postOrder() {
    if (!readyToPost || posting || !profile) return;
    if (hasPostedCurrentOrder) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "This order is already posted. Say 'order again' if you want to create a new order.",
        },
      ]);
      return;
    }
    if (!orderDraft.line_items || orderDraft.line_items.length === 0) {
      setError("At least one line item is required before posting.");
      return;
    }
    setPosting(true);
    setError("");

    const totalAmount = renderOrderTotal(orderDraft.line_items, orderDraft.total_amount);
    const now = new Date();
    const payload = {
      mailbox_id: "chatbot",
      message_id: `chat-${now.getTime()}`,
      source: "chat" as const,
      processing_seconds: Math.max(0, Math.round((Date.now() - sessionStart) / 1000)),
      validated: {
        customer_name: orderDraft.customer_name ?? profile.customer_name,
        customer_email: orderDraft.customer_email ?? profile.customer_email,
        po_number: orderDraft.po_number ?? `CHAT-PO-${now.getTime()}`,
        requested_date: orderDraft.requested_date ?? now.toISOString().slice(0, 10),
        ship_to: orderDraft.ship_to ?? profile.ship_to_default,
        currency: (orderDraft.currency ?? profile.currency ?? "USD").toUpperCase(),
        total_amount: Number(totalAmount.toFixed(2)),
        extraction_confidence: orderDraft.extraction_confidence ?? 0.95,
        special_notes: orderDraft.special_notes ?? "",
        line_items: orderDraft.line_items,
      },
    };

    try {
      const res = await fetch("/api/order-capture/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; order?: CapturedOrder };
      if (!res.ok || !data.order) {
        throw new Error(data.error ?? "Order post failed.");
      }
      const createdOrder = data.order;
      setPostedOrder(createdOrder);
      loadRecords();
      setPostPromptShown(false);
      setAutoPostWhenReady(false);
      setHasPostedCurrentOrder(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Order posted successfully. Capture ID ${createdOrder.capture_id} created. What else can I do for you?`,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post order.";
      setError(message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="agents-layout">
      <aside className="agents-sidebar">
        <h3>O2C Process Steps</h3>
        {STAGES.map((group) => (
          <div key={group.stage} className="stage-block">
            <div className="label">{group.stage}</div>
            <div className="stage-menu">
              {group.agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`stage-item ${agent.id === "order-capture-chatbot" ? "stage-item-active" : ""}`}
                  onClick={() => {
                    const route = WORKSPACE_ROUTES[agent.id] ?? "/agents";
                    router.push(route);
                  }}
                >
                  {agent.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <div className="agents-main">
        <h1 className="agents-title">Order Capture - Chatbot</h1>
        <article className="card">
          <div className="label">Core Agent Workspace</div>
          {profile && (
            <p className="muted-note" style={{ marginTop: 8 }}>
              Signed in: <strong>{profile.user_name}</strong> ({profile.user_email}) | Customer:{" "}
              <strong>{profile.customer_name}</strong>
            </p>
          )}
          {error && <div className="card" style={{ borderColor: "#e5a5a5", marginTop: 8 }}>{error}</div>}

          <div className="chat-layout chat-layout-single" style={{ marginTop: 10 }}>
            <div className="chat-thread card">
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-row ${msg.role === "user" ? "chat-row-user" : "chat-row-assistant"}`}>
                  {msg.role === "assistant" && (
                    <span className="chat-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="7" width="16" height="12" rx="2" />
                        <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" />
                      </svg>
                    </span>
                  )}
                  <div className={`chat-bubble ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
                    {msg.text}
                    {msg.role === "assistant" && msg.pricing_quotes && msg.pricing_quotes.length > 0 && (
                      <div className="price-chip-row">
                        {msg.pricing_quotes.map((quote) => (
                          <a
                            key={`${quote.sku}-${quote.unit_price}`}
                            href={quote.contract_link}
                            className="price-chip"
                            title={quote.contract_clause}
                          >
                            {quote.sku}: {quote.currency} {quote.unit_price.toFixed(2)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="chat-row chat-row-assistant">
                  <span className="chat-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="7" width="16" height="12" rx="2" />
                      <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" />
                    </svg>
                  </span>
                  <div className="chat-bubble chat-bubble-assistant">Thinking...</div>
                </div>
              )}
            </div>
          </div>

          <div className="form-stack" style={{ marginTop: 10 }}>
            <textarea
              rows={3}
              placeholder="Describe your SBB mattress order..."
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
            />
            <div className="row-actions">
              <button onClick={sendMessage} disabled={busy || !draftInput.trim()}>
                {busy ? "Sending..." : "Send"}
              </button>
              <button onClick={postOrder} disabled={!readyToPost || posting}>
                {posting ? "Posting..." : "Post Order"}
              </button>
            </div>
          </div>

          {postedOrder && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Posted:</strong> {postedOrder.capture_id} | {postedOrder.po_number}
            </div>
          )}
        </article>

        <StatusExpandableCard
          title={`Captured Orders (${records.length})`}
          tone="green"
          open={openCardId === "captured-orders"}
          onToggle={() => setOpenCardId((prev) => (prev === "captured-orders" ? "" : "captured-orders"))}
          style={{ marginTop: 12 }}
        >
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Capture</th>
                  <th>Source</th>
                  <th>PO</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Confidence</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.capture_id}>
                    <td>{row.capture_id}</td>
                    <td>{row.source}</td>
                    <td>{row.po_number}</td>
                    <td>{row.customer_name}</td>
                    <td>
                      {row.currency} {Number(row.total_amount).toFixed(2)}
                    </td>
                    <td>{(Number(row.extraction_confidence) * 100).toFixed(1)}%</td>
                    <td>{parseLineItems(row.line_items_json).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatusExpandableCard>
      </div>
    </section>
  );
}
