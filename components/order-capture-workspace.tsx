"use client";

import { useEffect, useMemo, useState } from "react";
import type { CapturedOrder, OrderCaptureCorrection, OrderCaptureDraft, OrderMailbox } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type PulledEmail = {
  message_id: string;
  mailbox_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  received_at: string;
  attachment: {
    file_name: string;
    public_url: string;
    content_type: string;
  };
  attachment_text: string;
};

type OrderCaptureWorkspaceProps = {
  showTitle?: boolean;
  hideMailboxControls?: boolean;
  externalMailboxId?: string;
  autoloadNonce?: number;
  showCapturedOrders?: boolean;
};

function parseLineItems(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Array<{ sku: string; quantity: number; unit_price: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OrderCaptureWorkspace({
  showTitle = true,
  hideMailboxControls = false,
  externalMailboxId,
  autoloadNonce = 0,
  showCapturedOrders = true,
}: OrderCaptureWorkspaceProps) {
  const [mailboxes, setMailboxes] = useState<OrderMailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState("");
  const [pulled, setPulled] = useState<PulledEmail | null>(null);
  const [draft, setDraft] = useState<OrderCaptureDraft | null>(null);
  const [submittedDraft, setSubmittedDraft] = useState<OrderCaptureDraft | null>(null);
  const [corrections, setCorrections] = useState<OrderCaptureCorrection[]>([]);
  const [extractionProcessingSeconds, setExtractionProcessingSeconds] = useState<number>(0);
  const [approved, setApproved] = useState<CapturedOrder | null>(null);
  const [records, setRecords] = useState<CapturedOrder[]>([]);
  const [busyPull, setBusyPull] = useState(false);
  const [busyCapture, setBusyCapture] = useState(false);
  const [busyApprove, setBusyApprove] = useState(false);
  const [err, setErr] = useState<string>("");
  const [openCardId, setOpenCardId] = useState<string>("");

  async function loadRecords() {
    const res = await fetch("/api/orders");
    const data = (await res.json()) as CapturedOrder[];
    setRecords(data);
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/order-capture/mailboxes")
      .then((res) => res.json())
      .then((data: OrderMailbox[]) => {
        if (cancelled) {
          return;
        }
        setMailboxes(data);
        if (data.length > 0) {
          setSelectedMailbox((prev) => prev || data[0].mailbox_id);
        }
      });

    fetch("/api/orders")
      .then((res) => res.json())
      .then((data: CapturedOrder[]) => {
        if (!cancelled) {
          setRecords(data);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function pullLatestFor(mailboxId: string) {
    if (!mailboxId) return;
    setErr("");
    setBusyPull(true);
    setDraft(null);
    setSubmittedDraft(null);
    setCorrections([]);
    setExtractionProcessingSeconds(0);
    setApproved(null);

    const res = await fetch("/api/order-capture/pull-latest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailbox_id: mailboxId }),
    });

    if (!res.ok) {
      setErr("No latest email found for this mailbox.");
      setBusyPull(false);
      return;
    }

    setPulled((await res.json()) as PulledEmail);
    setBusyPull(false);
  }

  async function pullLatest() {
    await pullLatestFor(selectedMailbox);
  }

  useEffect(() => {
    if (!externalMailboxId || autoloadNonce <= 0 || mailboxes.length === 0) {
      return;
    }
    const exists = mailboxes.some((m) => m.mailbox_id === externalMailboxId);
    if (!exists) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSelectedMailbox(externalMailboxId);
      void pullLatestFor(externalMailboxId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [externalMailboxId, autoloadNonce, mailboxes]);

  async function captureWithAgent() {
    if (!pulled) return;
    setErr("");
    setBusyCapture(true);

    const res = await fetch("/api/agents/order-capture/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mailbox_id: pulled.mailbox_id,
        message_id: pulled.message_id,
        from: pulled.from,
        to: pulled.to,
        subject: pulled.subject,
        body: pulled.body,
        attachment_file_name: pulled.attachment.file_name,
        attachment_text: pulled.attachment_text,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(body.error ?? "Agent extraction failed. Check model credentials and payload format.");
      setBusyCapture(false);
      return;
    }

    const data = (await res.json()) as {
      draft: OrderCaptureDraft;
      submitted_order: OrderCaptureDraft;
      corrections: OrderCaptureCorrection[];
      raw_json: string;
      processing_seconds: number;
    };
    setDraft(data.draft);
    setSubmittedDraft(data.submitted_order);
    setCorrections(data.corrections);
    setExtractionProcessingSeconds(Number(data.processing_seconds ?? 0));
    setBusyCapture(false);
  }

  function updateDraftField<K extends keyof OrderCaptureDraft>(key: K, value: OrderCaptureDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateLineItem(idx: number, key: "sku" | "quantity" | "unit_price", value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const items = [...prev.line_items];
      const current = { ...items[idx] };
      if (key === "sku") current.sku = value;
      if (key === "quantity") current.quantity = Number(value || 0);
      if (key === "unit_price") current.unit_price = Number(value || 0);
      items[idx] = current;
      const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      return { ...prev, line_items: items, total_amount: Number(total.toFixed(2)) };
    });
  }

  async function approveAndPost() {
    if (!pulled || !draft) return;
    setErr("");
    setBusyApprove(true);

    const res = await fetch("/api/order-capture/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mailbox_id: pulled.mailbox_id,
        message_id: pulled.message_id,
        source: "email",
        processing_seconds: extractionProcessingSeconds,
        validated: draft,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(body.error ?? "Order approval failed.");
      setBusyApprove(false);
      return;
    }

    const data = (await res.json()) as { order: CapturedOrder };
    setApproved(data.order);
    setDraft(null);
    setSubmittedDraft(null);
    setCorrections([]);
    setExtractionProcessingSeconds(0);
    setBusyApprove(false);
    loadRecords();
  }

  const previewItems = useMemo(() => (draft ? draft.line_items : []), [draft]);
  const correctionByField = useMemo(() => new Map(corrections.map((c) => [c.field, c])), [corrections]);
  const hasCustomerCorrection = correctionByField.has("customer_name");

  return (
    <section>
      {showTitle && <h2 style={{ fontWeight: 800 }}>Order Capture Agent</h2>}
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      {!hideMailboxControls && (
        <div className="mailbox-panel card form-stack">
          <label htmlFor="mailbox">Order Mailbox</label>
          <select id="mailbox" value={selectedMailbox} onChange={(e) => setSelectedMailbox(e.target.value)}>
            {mailboxes.map((mb) => (
              <option key={mb.mailbox_id} value={mb.mailbox_id}>
                {mb.display_name}
              </option>
            ))}
          </select>

          <button onClick={pullLatest} disabled={busyPull || !selectedMailbox}>
            {busyPull ? "Pulling latest email..." : "Pull Latest Email"}
          </button>
        </div>
      )}

      {pulled && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Latest Email</h3>
          <p><strong>From:</strong> {pulled.from}</p>
          <p><strong>To:</strong> {pulled.to}</p>
          <p><strong>Subject:</strong> {pulled.subject}</p>
          <p><strong>Received:</strong> {new Date(pulled.received_at).toLocaleString()}</p>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="label">Email Body</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{pulled.body}</pre>
          </div>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="label">Attachment</div>
            <p style={{ marginTop: 4, marginBottom: 6 }}>
              <span className="pdf-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M8 13h8M8 17h6" />
                </svg>
              </span>
              {pulled.attachment.file_name} ({pulled.attachment.content_type})
            </p>
            <a href={pulled.attachment.public_url} target="_blank" rel="noreferrer">Open PDF</a>
          </div>

          <button style={{ marginTop: 10 }} onClick={captureWithAgent} disabled={busyCapture}>
            {busyCapture ? "Capturing with agent..." : "Capture Order (Real Agent)"}
          </button>
        </div>
      )}

      {draft && pulled && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide">
            <p><strong>Action for Human in the Loop - Review PDF and Extracted order.</strong></p>

            <div className="split-view" style={{ marginTop: 10 }}>
              <div className="split-pane card">
                <div className="label">PDF</div>
                <iframe className="pdf-frame" src={pulled.attachment.public_url} title="Order attachment PDF" />
              </div>

              <div className="split-pane card">
                <div className="label">Extracted Order</div>
                <div className="form-stack">
                  <label>Customer Name</label>
                  <input
                    className={hasCustomerCorrection ? "field-corrected" : ""}
                    value={draft.customer_name}
                    onChange={(e) => updateDraftField("customer_name", e.target.value)}
                  />
                  <small className="muted-note field-note">
                    {submittedDraft && hasCustomerCorrection ? `Original: ${submittedDraft.customer_name}` : "\u00A0"}
                  </small>
                </div>

                <div className="form-stack">
                  <label>Customer Email</label>
                  <input value={draft.customer_email} onChange={(e) => updateDraftField("customer_email", e.target.value)} />
                </div>

                <div className="order-mid-grid" style={{ marginTop: 8 }}>
                  <div className="form-stack">
                    <label>PO Number</label>
                    <input value={draft.po_number} onChange={(e) => updateDraftField("po_number", e.target.value)} />
                  </div>
                  <div className="form-stack">
                    <label>Requested Date</label>
                    <input value={draft.requested_date} onChange={(e) => updateDraftField("requested_date", e.target.value)} />
                  </div>
                  <div className="form-stack">
                    <label>Currency</label>
                    <input value={draft.currency} onChange={(e) => updateDraftField("currency", e.target.value)} />
                  </div>
                  <div className="form-stack">
                    <label>Total Amount</label>
                    <input
                      type="number"
                      value={draft.total_amount}
                      onChange={(e) => updateDraftField("total_amount", Number(e.target.value || 0))}
                    />
                  </div>
                </div>

                <div className="form-stack" style={{ marginTop: 8 }}>
                  <label>Ship To</label>
                  <textarea rows={2} value={draft.ship_to} onChange={(e) => updateDraftField("ship_to", e.target.value)} />
                </div>

                <div className="form-stack" style={{ marginTop: 8 }}>
                  <label>Special Notes</label>
                  <textarea rows={2} value={draft.special_notes} onChange={(e) => updateDraftField("special_notes", e.target.value)} />
                </div>

                <div className="card" style={{ marginTop: 8 }}>
                  <div className="label">Line Items</div>
                  <div className="table-wrap">
                    <table className="line-items-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, idx) => (
                          <tr key={`${item.sku}-${idx}`}>
                            <td>
                              <input
                                className={correctionByField.has(`line_items[${idx}].sku`) ? "field-corrected" : ""}
                                value={item.sku}
                                onChange={(e) => updateLineItem(idx, "sku", e.target.value)}
                              />
                              {submittedDraft && correctionByField.has(`line_items[${idx}].sku`) && (
                                <small className="muted-note field-note">Original: {submittedDraft.line_items[idx]?.sku ?? "-"}</small>
                              )}
                            </td>
                            <td><input type="number" value={item.quantity} onChange={(e) => updateLineItem(idx, "quantity", e.target.value)} /></td>
                            <td>
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateLineItem(idx, "unit_price", e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ marginBottom: 0 }}>Extraction confidence: {(draft.extraction_confidence * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <div className="row-actions" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setDraft(null)}>Cancel</button>
              <button onClick={approveAndPost} disabled={busyApprove}>
                {busyApprove ? "Posting..." : "Approve and Post Order"}
              </button>
            </div>

            {corrections.length > 0 && (
              <StatusExpandableCard
                title={`Agent corrections applied (${corrections.length})`}
                tone="amber"
                open={openCardId === "corrections"}
                onToggle={() => setOpenCardId((prev) => (prev === "corrections" ? "" : "corrections"))}
                style={{ marginTop: 10 }}
              >
                <div style={{ marginTop: 8 }}>
                  {corrections.map((c, idx) => (
                    <p key={`${c.field}-${idx}`} style={{ margin: "4px 0" }}>
                      <strong>{c.field}</strong>: {c.from_value} {"->"} {c.to_value}
                      {c.reason ? ` (${c.reason})` : ""}
                    </p>
                  ))}
                </div>
              </StatusExpandableCard>
            )}
          </div>
        </div>
      )}

      {approved && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Posted Order</h3>
          <p>
            Capture ID <strong>{approved.capture_id}</strong> created for PO <strong>{approved.po_number}</strong>.
          </p>
        </div>
      )}

      {showCapturedOrders && (
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
                    <td>{row.currency} {Number(row.total_amount).toFixed(2)}</td>
                    <td>{(Number(row.extraction_confidence) * 100).toFixed(1)}%</td>
                    <td>{parseLineItems(row.line_items_json).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatusExpandableCard>
      )}
    </section>
  );
}
