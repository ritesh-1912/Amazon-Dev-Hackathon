# Campus Ops MCP

> A stateful Model Context Protocol (MCP) server + simulated Alexa+ experience that manages a student's academic "ops" (assignments, fees, project milestones, library returns) — tracking task dependencies, preventing the advancement of blocked items, and enforcing human confirmation before state mutations.

Built for the **Amazon Developer Hackathon 2026** (Alexa+ track — simulated experience path + AWS Builder mini-challenge with AWS Bedrock).

---

## 📌 Project Overview

Students handle diverse, high-stakes deadlines across disparate systems: coursework, tuition/lab fees, group project milestones, and library returns. A mistake—such as prematurely marking a fee paid or attempting a project deliverable before prerequisite architecture is completed—causes cascading issues.

**Campus Ops MCP** addresses this by providing:
1. **MCP Server Core**: Implements the official `@modelcontextprotocol/sdk` using the **Streamable HTTP transport** (spec 2025-11-25).
2. **State & Dependency Engine**: Dynamic evaluation of tasks (`open`, `blocked`, `done`, `stale`) backed by persistent file-based SQLite.
3. **Guarded Action Classification**:
   - `AUTO`: Safe operations (e.g., reading tasks, updating routine assignments or notes).
   - `HUMAN_REQUIRED`: Critical, real-world state alterations (e.g., fee payments, final project code submissions) require explicit two-phase confirmation (`propose_action` ➔ `confirm_action`).
4. **Full Audit Trail**: Every status alteration and action proposal/confirmation is immutably logged with ISO timestamps.
5. **AWS Bedrock Integration** *(Coming in Phase 3)*: Synthesizes structured task graphs into concise, calm natural-language briefs using Claude on Bedrock.
6. **Simulated Alexa+ Interface** *(Coming in Phase 4)*: Next.js chat experience modeling conversational Alexa+ voice interactions and confirmation modals.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Alexa+ Web Simulator                      │
│        (Next.js App Router + Tailwind + UI Modals)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ Streamable HTTP (JSON-RPC)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Campus Ops MCP Server                    │
│   (Node.js + TypeScript + @modelcontextprotocol/sdk)        │
│                                                             │
│   Endpoints:                                                │
│   - POST   /mcp      (JSON-RPC requests, session mgmt)      │
│   - GET    /mcp      (SSE streams / notifications)          │
│   - DELETE /mcp      (Session teardown)                     │
│   - GET    /health   (Service diagnostics & health check)   │
│                                                             │
│   Core Modules:                                             │
│   ├── MCP Tool Registry (create_task, list_tasks, ...)      │
│   ├── State Invariant Engine (blocked / stale resolver)     │
│   ├── Action Guard (AUTO vs HUMAN_REQUIRED enforcement)     │
│   └── Bedrock Client (Claude 3 on AWS Bedrock)              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   SQLite Persistence Layer                  │
│               (better-sqlite3 + WAL mode)                   │
│        - Tasks Table (dependencies, action_class, status)   │
│        - Audit Logs Table (immutable timestamped history)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Model

```typescript
interface Task {
  id: string;
  title: string;
  category: "assignment" | "fee" | "project" | "library" | "other";
  deadline: string; // ISO-8601 date string
  depends_on: string[]; // IDs of prerequisite tasks that must be 'done'
  status: "open" | "blocked" | "done" | "stale";
  action_class: "AUTO" | "HUMAN_REQUIRED";
  audit_log: {
    timestamp: string;
    event: string;
    note?: string;
  }[];
}
```

### Dynamic Status Invariants
- **`done`**: The task has been completed.
- **`blocked`**: Any task listed in `depends_on` is not in the `done` state.
- **`stale`**: Deadline has passed (`deadline < now`) and the task is still not `done`.
- **`open`**: The task is unblocked, within deadline, and ready for work.

---

## 🛠️ MCP Tools

| Tool | Purpose |
|------|---------|
| `create_task` | Creates an academic task with category, deadline, dependencies, and action class. |
| `list_tasks` | Returns all tasks with dynamically computed statuses, with optional `status` and `category` filters. |
| `get_task` | Retrieves a specific task by ID including its full audit trail. |
| `update_task` | Updates task fields and status, cascading dependency unblocking. |
| `propose_action` | *(Phase 2)* Generates a proposal object for `HUMAN_REQUIRED` actions without mutating state. |
| `confirm_action` | *(Phase 2)* Mutates state for `HUMAN_REQUIRED` actions upon human confirmation (`confirmed: true`). |
| `get_weekly_brief` | *(Phase 2)* Gathers tasks due in the next 7 days, blocked tasks, and stale items. |
| `get_smart_brief` | *(Phase 3)* Translates the weekly brief into spoken-style prose via AWS Bedrock Claude. |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20` (tested on Node v24)
- npm `>= 10`

### Installation
```bash
git clone https://github.com/ritesh-1912/Amazon-Dev-Hackathon.git
cd Amazon-Dev-Hackathon
npm install
```

### Environment Configuration
Copy the example environment file:
```bash
cp .env.example .env
```
Default parameters in `.env`:
```ini
PORT=3001
NODE_ENV=development
DB_PATH=./data/campus_ops.db
```

### Seed Demo Data
Populates the SQLite database with 8 realistic demo tasks (assignments, tuition fees, capstone milestones, library returns):
```bash
npm run seed
```

### Run Server Locally
```bash
# Development (with hot-reload)
npm run dev

# Production build & run
npm run build
npm run start
```

Once running:
- **MCP Endpoint**: `http://localhost:3001/mcp`
- **Health Check**: `http://localhost:3001/health`

### Run Web Simulator (Alexa+ Interface)
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:3000` to interact with the conversational Alexa+ simulator and the live task board.

### Run Automated Tests
```bash
npm test
```

---

## 📋 Hackathon Roadmap

- [x] **Phase 1: MCP Server Core with Task CRUD**
  - Streamable HTTP transport per MCP 2025-11-25 specification.
  - SQLite persistence via `better-sqlite3`.
  - Strict JSON-RPC input validation with Zod.
  - Dependency resolution and demo seed script.
- [x] **Phase 2: Guarded Actions & Audit Trail**
  - Two-phase commit (`propose_action` / `confirm_action`).
  - Strict protection preventing direct status updates on `HUMAN_REQUIRED` tasks.
  - Invariant guard refusing advancement of blocked tasks.
  - `get_weekly_brief` structured aggregator.
- [x] **Phase 3: AWS Bedrock Integration (AWS Builder Challenge)**
  - Bedrock Runtime SDK calling Claude on Bedrock.
  - `get_smart_brief` tool with graceful fallback.
  - Documentation at `docs/aws-builder.md`.
- [x] **Phase 4: Web Simulator (Alexa+ Experience)**
  - Next.js chat interface modeling Alexa+ voice interactions.
  - Interactive confirmation modal for guarded human-in-the-loop actions.
  - Real-time task status panel with dynamic dependency resolution.
- [ ] **Phase 5: Deployment & Polish**
  - MCP server deployment.
  - Web simulator deployment on Vercel.

