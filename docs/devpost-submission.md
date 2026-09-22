# Devpost Submission: Campus Ops MCP

## Project Title
**Campus Ops MCP**

## One-Line Tagline
A stateful Model Context Protocol (MCP) server + Alexa+ voice experience that manages student academic operations — tracking dependencies, preventing action on blocked tasks, and requiring explicit human confirmation before mutating real-world state.

---

## Live URLs
- **Web Simulator**: [https://campusmcp.vercel.app](https://campusmcp.vercel.app)
- **MCP Server Endpoint**: [https://campus-ops-mcp-xlse.onrender.com/mcp](https://campus-ops-mcp-xlse.onrender.com/mcp)
- **MCP Health Diagnostic**: [https://campus-ops-mcp-xlse.onrender.com/health](https://campus-ops-mcp-xlse.onrender.com/health)
- **GitHub Repository**: [https://github.com/ritesh-1912/Amazon-Dev-Hackathon](https://github.com/ritesh-1912/Amazon-Dev-Hackathon)

---

## Testing Instructions

To verify the project in under 2 minutes:

1. Open the live simulator: [https://campusmcp.vercel.app](https://campusmcp.vercel.app).
2. Note: the MCP server is on Render's free tier and may take up to 30s to wake up on first request — the UI will show a "waking up" message during this, this is expected.
3. Try: "What's due this week?", then "What's blocked?", then "Complete CS 301 design", then "What's blocked?" again to see the dependent task unblock, then "Pay tuition fee" to see the confirmation modal.
4. Optionally hit [https://campus-ops-mcp-xlse.onrender.com/health](https://campus-ops-mcp-xlse.onrender.com/health) directly to see the MCP server's spec version and status independent of the UI.

---

## Targeted Hackathon Tracks
- **Alexa+ Track**: Simulated Experience Path (Conversational Next.js UI interacting with stateful MCP server).
- **AWS Builder Mini-Challenge**: Live AWS Bedrock Runtime integration with Anthropic Claude for natural language intelligence and weekly briefs.

---

## Inspiration & Problem Statement
Every semester, university students face an overwhelming web of high-stakes deadlines scattered across incompatible platforms:
- Course assignments on Canvas or Blackboard
- Tuition and lab fee deadlines on the Bursar portal
- Group capstone milestones and code repositories on GitHub
- Course reserve book returns at the university library

When modern conversational agents or autonomous assistants are connected to academic systems without guardrails, two failure modes can occur:
1. **Premature Execution on Blocked Dependencies**: An assistant attempts to advance or submit a deliverable whose prerequisite dependencies are not yet complete (e.g. attempting to submit the CS 301 implementation milestone before the prerequisite architecture specification has been finished and approved).
2. **Unguarded Real-World State Mutations**: An AI assistant marks high-stakes items as done or paid without explicit human confirmation, risking academic misconduct or unauthorized financial transactions.

Campus Ops MCP addresses these failure modes by tracking task blockers, explaining why tasks cannot proceed, and enforcing human confirmation before state mutations take place on guarded items.

---

## What Campus Ops MCP Does
- **Conversational Alexa+ Simulator**: A voice-style chat interface where students can ask questions like *"What's due this week?"*, *"What tasks are blocked?"*, *"Complete CS 301 design"*, or *"Mark fees paid"*.
- **Dynamic Dependency Graph**: Tasks evaluate dependencies in real time. If prerequisite tasks are incomplete, dependent tasks are classified as `blocked`. Once prerequisites are marked done, dependents transition to `open`.
- **Two-Phase Action Commit (`propose_action` -> `confirm_action`)**: For guarded tasks (`HUMAN_REQUIRED` class, such as tuition payments or final project submissions), the MCP server rejects direct updates and returns a proposal requiring confirmation. The web interface renders an explicit confirmation modal dialog (*"Confirm: mark [Spring tuition] as paid? [Confirm] [Cancel]"*).
- **AI Briefing with AWS Bedrock**: Using Claude on AWS Bedrock, the assistant summarizes task dependencies into an operational brief detailing what's due, what's blocked and why, and what requires human review.
- **Audit Log**: An SQLite table records every status alteration, action proposal, confirmation, and rejection with ISO timestamps.

---

## How We Built It

### 1. MCP Server Core
- Implemented with Node.js and TypeScript using the official `@modelcontextprotocol/sdk` (v1.30.0).
- Uses the **Streamable HTTP Transport** conforming to the MCP 2025-11-25 specification, supporting session management, server-sent events (`text/event-stream`), and JSON-RPC 2.0 tool execution.
- Exposes 8 structured tools: `create_task`, `list_tasks`, `get_task`, `update_task`, `propose_action`, `confirm_action`, `get_weekly_brief`, and `get_smart_brief`.

### 2. State & Persistence Engine
- Built on SQLite via `better-sqlite3` with Write-Ahead Logging (WAL) mode for fast persistence.
- Implements cascading dependency resolution: when a prerequisite completes, dependent tasks evaluate their remaining prerequisites and transition status.

### 3. AWS Bedrock Runtime Integration
- Integrated via `@aws-sdk/client-bedrock-runtime` using the Converse API (`ConverseCommand`).
- Prompts Claude (`anthropic.claude-3-haiku-20240307-v1:0`) to format task summaries.
- Falls back to a deterministic structured brief if Bedrock is unreachable or unconfigured.

### 4. Alexa+ Web Simulator
- Built with Next.js (App Router), React 19, TypeScript, and Tailwind CSS.
- Features a chat interface with intent routing and quick user-story action buttons.
- Features a Live Task Board sidebar displaying status counters and prerequisite dependencies.
- Features a confirmation modal dialog for guarded actions.

---

## Challenges We Encountered
- **Streamable HTTP Protocol Handling**: The MCP Streamable HTTP specification uses Server-Sent Events (`text/event-stream`) for JSON-RPC tool responses and notifications. Bridging Next.js API routes with persistent MCP session headers (`mcp-session-id`) required custom SSE stream parsing and session lifecycle management.
- **Guard Enforcement**: Ensuring that `update_task` cannot bypass human confirmation required enforcing a guard that routes all `HUMAN_REQUIRED` mutations through `confirm_action`, rejecting direct `update_task` calls on those tasks.

---

## Accomplishments
- **MCP Specification Compliance**: Implements the Model Context Protocol (MCP) Streamable HTTP specification (2025-11-25).
- **Enforced Human-in-the-Loop Guard**: The server rejects any direct status change on `HUMAN_REQUIRED` tasks outside the `propose_action`/`confirm_action` flow.
- **Deployment Configurations Included**: Contains a multi-stage Dockerfile, Render blueprint (`render.yaml`), Fly.io config (`fly.toml`), and Next.js deployment configuration for Vercel.
- **Automated Test Suite**: 19 automated tests across 3 Vitest test suites covering CRUD operations, dependency resolution, guarded action invariant logic, Bedrock synthesis with fallback, and MCP Streamable HTTP session handling.

---

## What's Next for Campus Ops MCP
- **Canvas LMS & Blackboard API Integrations**: Directly synchronizing course assignments and due dates into the MCP SQLite store via webhooks.
- **University Bursar ACH API Connector**: Secure integration with university billing portals upon student biometric confirmation.
- **Multi-Agent Collaborative Capstones**: Expanding the dependency graph to support multi-student team projects where team members unblock milestones for each other.

---

## Product Feedback for the Amazon Team
1. **Alexa+ Tool Execution Safety**: We love the direction of conversational Alexa+ agents powered by MCP. Providing native support for two-phase commit actions (`propose` / `confirm`) directly in the Alexa+ voice flow (e.g. voice confirmation prompts: *"Are you sure you want to proceed with [action]?"*) would elevate agent safety across consumer use cases.
2. **MCP over Streamable HTTP Documentation**: Standardizing sample client libraries and SDK helper utilities for Next.js and web environments connecting to Streamable HTTP MCP servers will accelerate developer adoption.
3. **AWS Bedrock Converse API**: The unified Converse API is exceptionally clean and intuitive to work with across Claude models. Adding lightweight prompt caching and preset streaming formatters for voice responses would make voice-agent development even faster.
