# Campus Ops MCP

> A stateful Model Context Protocol (MCP) server and simulated Alexa+ interface for academic operations (assignments, tuition fees, project milestones, library returns). Tracks task dependencies, enforces invariants on blocked items, and requires explicit confirmation before mutating real-world state.

Built for the **Amazon Developer Hackathon 2026** (Alexa+ track: simulated experience path; AWS Builder mini-challenge: AWS Bedrock).

---

## Live Deployments
- **Alexa+ Web Simulator**: [https://campusmcp.vercel.app](https://campusmcp.vercel.app)
- **Campus Ops MCP Server**: [https://campus-ops-mcp-xlse.onrender.com](https://campus-ops-mcp-xlse.onrender.com)
- **MCP Server Health Check**: [https://campus-ops-mcp-xlse.onrender.com/health](https://campus-ops-mcp-xlse.onrender.com/health)
- **Judge Testing Instructions**: [docs/TESTING.md](docs/TESTING.md) (2-minute verification guide)

---

## Problem Statement

Students manage deadlines across university systems: course assignments, tuition payments, project milestones, and library loans.

When autonomous assistants interact with these systems without constraints, two failure modes occur:
1. **Premature Action on Blocked Dependencies**: An assistant attempts to advance a task whose prerequisites are incomplete (such as submitting milestone deliverables before prerequisite design approval).
2. **Unguarded Real-World Mutations**: An assistant executes irreversible or financial actions (such as marking tuition fees as paid or submitting final work) without human verification.

Campus Ops MCP addresses these failures by enforcing dependency graph invariants, requiring explicit confirmation before state mutations, and providing operational briefings via AWS Bedrock.

---

## Architecture

```
+-------------------------------------------------------------+
|                 Alexa+ Web Simulator (Next.js)              |
|  - Conversational Voice-Style Chat Interface                |
|  - Natural Language Intent Router                           |
|  - Guarded Action Confirmation Modal (Two-Phase Approval)   |
|  - Live Task Board with Reactive Dependency Resolution      |
+------------------------------+------------------------------+
                               | Streamable HTTP (JSON-RPC 2.0)
                               v
+-------------------------------------------------------------+
|                    Campus Ops MCP Server                    |
|   (Node.js + TypeScript + @modelcontextprotocol/sdk)        |
|                                                             |
|   Endpoints:                                                |
|   - POST   /mcp      (JSON-RPC requests, session mgmt)      |
|   - GET    /mcp      (SSE streams / notifications)          |
|   - DELETE /mcp      (Session termination)                  |
|   - GET    /health   (Service diagnostics & status)         |
|                                                             |
|   Core Engines & Tool Registry:                             |
|   +-- MCP Tool Registry (create_task, list_tasks, ...)      |
|   +-- Dynamic State Invariant Engine (open/blocked/stale)   |
|   +-- Guarded Action Gatekeeper (AUTO vs HUMAN_REQUIRED)    |
|   +-- Bedrock AI Engine (Claude on AWS Bedrock)             |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                   SQLite Persistence Layer                  |
|               (better-sqlite3 + WAL mode)                   |
|        - Tasks Table (dependencies, action_class, status)   |
|        - Audit Logs Table (immutable timestamped history)   |
+-------------------------------------------------------------+
```

---

## How Alexa+ & MCP Requirements Are Satisfied

| Requirement | Implementation in Campus Ops |
|---|---|
| **Official MCP Protocol** | Implements the official `@modelcontextprotocol/sdk` (v1.30.0) over **Streamable HTTP transport** conforming to the MCP 2025-11-25 specification. Supports `initialize`, `notifications/initialized`, and `tools/call`. |
| **Simulated Alexa+ Interface** | Built with Next.js App Router, providing a conversational chat experience that simulates voice commands (`"What's due this week?"`, `"What's blocked?"`, `"Complete CS 301 design"`, `"Pay tuition fee"`). |
| **Stateful Dependency Invariant** | Automatically computes whether tasks are `blocked` by unfinished prerequisites. The MCP server strictly refuses to advance blocked tasks. |
| **Guarded Actions (`HUMAN_REQUIRED`)** | State mutations affecting money or academic submissions are classified as `HUMAN_REQUIRED`. The server exposes `propose_action` which returns `requires_confirmation: true`. The web simulator displays an interactive modal dialog: *"Confirm: mark [Task] as paid? [Confirm] [Cancel]"*. Only `confirm_action(confirmed: true)` mutates state. |
| **Immutable Audit Trail** | Every action proposal, confirmation, rejection, and status transition is recorded in the SQLite audit log with ISO timestamps. |

---

## How AWS Bedrock Is Used (AWS Builder Challenge)

Campus Ops MCP integrates the **AWS Bedrock Runtime SDK** (`@aws-sdk/client-bedrock-runtime`) using Anthropic Claude (`anthropic.claude-3-haiku-20240307-v1:0`) via the Converse API (`ConverseCommand`).

### Workflow:
1. When querying upcoming work or invoking `get_smart_brief`, the server aggregates the schedule: tasks due within 7 days, currently blocked tasks with blocker IDs, and overdue items.
2. The structured JSON graph is sent to Claude on Bedrock.
3. Claude synthesizes the data into a 3-4 sentence operational brief detailing pending deadlines, blockers, and items requiring confirmation.
4. **Fallback Handling**: If AWS credentials are not configured or rate limits are reached, the engine falls back to a deterministic structured summary without interruption.
5. See [`docs/aws-builder.md`](docs/aws-builder.md) for architecture documentation of the AWS Bedrock integration.

---

## Data Model

```typescript
interface Task {
  id: string;
  title: string;
  category: "assignment" | "fee" | "project" | "library" | "other";
  deadline: string; // ISO-8601 date string
  depends_on: string[]; // IDs of prerequisite tasks that must be 'done' first
  status: "open" | "blocked" | "done" | "stale";
  action_class: "AUTO" | "HUMAN_REQUIRED";
  audit_log: {
    timestamp: string;
    event: string;
    note?: string;
  }[];
}
```

### Dynamic Invariants:
- **`done`**: The task has been completed and executed.
- **`blocked`**: One or more tasks listed in `depends_on` are not yet `done`.
- **`stale`**: Deadline has passed (`deadline < now`) and the task is not `done`.
- **`open`**: The task is unblocked, deadline is in the future, and ready for action.

---

## MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `create_task` | `title`, `category`, `deadline`, `depends_on`, `action_class` | Creates a new academic operation item. |
| `list_tasks` | `status` *(optional)*, `category` *(optional)* | Returns all tasks with dynamically evaluated statuses and dependencies. |
| `get_task` | `id` | Retrieves full task details and immutable audit log. |
| `update_task` | `id`, `status`, `title`, `deadline`, `depends_on`, `note` | Updates task metadata. Direct status updates on `HUMAN_REQUIRED` tasks are blocked. |
| `propose_action` | `task_id`, `action` | For `HUMAN_REQUIRED` tasks, returns `{ requires_confirmation: true, reason }` without mutating state. |
| `confirm_action` | `task_id`, `action`, `confirmed`, `note` | Only tool capable of mutating `HUMAN_REQUIRED` tasks. Enforces invariant that blocked tasks cannot be confirmed. |
| `get_weekly_brief` | *(none)* | Structured data aggregator of upcoming deadlines, blockers, and overdue tasks. |
| `get_smart_brief` | *(none)* | Bedrock-powered conversational voice briefing synthesized by Claude. |

---

## Local Quickstart

### Prerequisites
- Node.js `>= 20` (Node 22 LTS or Node 24 recommended)
- npm `>= 10`

### 1. Clone & Install
```bash
git clone https://github.com/ritesh-1912/Amazon-Dev-Hackathon.git
cd Amazon-Dev-Hackathon
npm install
cd web && npm install && cd ..
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Optional: Add your AWS credentials to `.env` to enable live Bedrock Claude generation:
```ini
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```
*(If AWS credentials are omitted, the system uses deterministic brief generation).*

### 3. Seed Demo Data
```bash
npm run seed
```

### 4. Run Locally
In terminal 1 (MCP Server on port 3001):
```bash
npm run dev
```

In terminal 2 (Next.js Web Simulator on port 3000):
```bash
cd web
npm run dev
```

Open **`http://localhost:3000`** in your browser to interact with the Alexa+ Web Simulator and the live task board.

### 5. Run Automated Tests
```bash
npm test
```
All 19 test cases verify:
- SQLite persistence and crash recovery
- Dependency blocking and cascading unblocking
- Human-in-the-loop action guards
- Rejection of invalid status changes on `HUMAN_REQUIRED` tasks
- AWS Bedrock Claude synthesis and graceful fallback
- Full Streamable HTTP MCP JSON-RPC protocol round-trips

---

## Production Deployment Guide

### Deploying MCP Server (Render / Fly.io / Docker)

#### Option A: Deploy to Render
The repository includes a ready-to-use [`render.yaml`](render.yaml) blueprint:
1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), select **New -> Blueprint**.
3. Connect your repository. Render detects `render.yaml` and deploys the `campus-ops-mcp` web service.
4. Set optional environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
5. Your MCP server will be live at `https://<service-name>.onrender.com`. Health endpoint: `/health`.

#### Option B: Deploy to Fly.io
The repository includes a [`fly.toml`](fly.toml) and multi-stage [`Dockerfile`](Dockerfile):
```bash
fly launch
fly deploy
```

---

### Deploying Web Simulator (Vercel)

The repository includes a [`web/vercel.json`](web/vercel.json) configuration:
1. In the [Vercel Dashboard](https://vercel.com/), click **Add New -> Project**.
2. Select the repository and set the **Root Directory** to `web`.
3. Under **Environment Variables**, add:
   - `MCP_SERVER_URL`: `https://<your-mcp-server>.onrender.com`
   - `NEXT_PUBLIC_MCP_SERVER_URL`: `https://<your-mcp-server>.onrender.com`
4. Click **Deploy**. Vercel will build and host the Next.js application.

---

## Security & Secrets Hygiene

- No credentials, tokens, or private keys are committed to Git.
- Both root `.gitignore` and `web/.gitignore` prevent `.env`, `.env.local`, SQLite databases (`*.db`), and build artifacts from tracking.
- Template configurations are provided in `.env.example` and `web/.env.example`.

---

## Development Roadmap

- **Phase 1: MCP Server Core with Task CRUD** — Completed
  - Streamable HTTP transport per MCP 2025-11-25 specification.
  - SQLite persistence via `better-sqlite3`.
  - JSON-RPC input validation with Zod.
  - Dependency resolution and demo seed script.
- **Phase 2: Guarded Actions & Audit Trail** — Completed
  - Two-phase commit protocol (`propose_action` / `confirm_action`).
  - Protection against direct status updates on `HUMAN_REQUIRED` tasks.
  - Invariant guard refusing advancement of blocked tasks.
  - `get_weekly_brief` structured aggregator.
- **Phase 3: AWS Bedrock Integration (AWS Builder Challenge)** — Completed
  - Bedrock Runtime SDK calling Claude on Bedrock.
  - `get_smart_brief` tool with deterministic fallback.
  - Architecture documentation in `docs/aws-builder.md`.
- **Phase 4: Web Simulator (Alexa+ Experience)** — Completed
  - Next.js App Router interface modeling Alexa+ voice interactions.
  - Confirmation modal for guarded human-in-the-loop actions.
  - Real-time task status panel with dynamic dependency resolution.
- **Phase 5: Deployment & Polish** — Completed
  - Production configurations (`Dockerfile`, `render.yaml`, `fly.toml`, `web/vercel.json`).
  - Architecture, security, and deployment documentation.
  - Environment templates without committed secrets.
- **Phase 6: Submission Assets** — Completed
  - Devpost pitch and submission documentation in `docs/devpost-submission.md`.
  - Product feedback for the Amazon developer team.
