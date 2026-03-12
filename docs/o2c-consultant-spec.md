# O2C Consultant Product Spec

## Purpose
The O2C Consultant is a subtle, floating advisory experience that appears across operational process areas and offers pointed recommendations grounded in the current workflow context.

## Goals
- Improve O2C cycle time.
- Improve top-line realization by reducing preventable leakage.
- Improve DSO and collections effectiveness.
- Surface predictive guidance such as likely order behavior and customer preferences.

## UX
- Floating launcher fixed at the bottom-right of each process area.
- Quiet by default.
- If the current context has a meaningful insight, a small teaser appears above the launcher.
- Clicking the teaser or launcher opens a compact advisory panel.
- The panel shows:
  - contextual title and teaser
  - 2-3 live metrics
  - pointed recommendations
  - suggested follow-up prompts
  - conversational chat powered by Azure OpenAI

## Process Areas
- Order Capture
- Agent workspaces on `/agents`
- Collections Strategy
- Cash Application
- Dispute Triage & Resolution

## Trigger Model
- Use deterministic business rules from current queue counts and KPIs.
- Show a proactive teaser only when there is a meaningful issue or opportunity.
- Examples:
  - large validation or hold backlog
  - elevated revenue at risk
  - high unapplied cash
  - overdue collections concentration
  - open dispute concentration

## Response Style
- Specific to the current process area.
- Business-focused, concise, and action-oriented.
- Recommendations should mention outcomes such as cycle time, top line, DSO, and customer behavior when relevant.

## Architecture
- `GET /api/consultant/brief`
  - deterministic, stage-aware insight briefing from live data
- `POST /api/consultant/chat`
  - Azure OpenAI backed advisor chat grounded in the same briefing
- `O2CConsultant` client component
  - floating launcher
  - teaser
  - compact chat panel

## Success Criteria
- Available across process areas without disrupting operational workflows.
- Gives context-specific insights rather than generic chat.
- Uses Azure OpenAI when configured and deterministic fallback otherwise.
