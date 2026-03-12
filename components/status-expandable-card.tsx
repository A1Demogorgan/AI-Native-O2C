"use client";

import type { CSSProperties, ReactNode } from "react";

type Tone = "red" | "amber" | "green";

type Props = {
  title: string;
  subtitle?: string;
  tone: Tone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  style?: CSSProperties;
  compact?: boolean;
};

export default function StatusExpandableCard({
  title,
  subtitle,
  tone,
  open,
  onToggle,
  children,
  style,
  compact = false,
}: Props) {
  return (
    <div className={`status-panel status-panel-${tone} ${open ? "status-panel-open" : ""} ${compact ? "status-panel-compact" : ""}`} style={style}>
      <button type="button" className="status-panel-trigger" onClick={onToggle} aria-expanded={open}>
        <span className="status-panel-copy">
          <span className="status-panel-title">{title}</span>
          {subtitle ? <span className="status-panel-subtitle">{subtitle}</span> : null}
        </span>
        <span className="status-panel-chevron">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="status-panel-body">{children}</div>}
    </div>
  );
}
