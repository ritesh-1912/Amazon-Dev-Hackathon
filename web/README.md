# Campus Ops — Web Simulator (Alexa+ Interface)

A Next.js (App Router) + TypeScript + Tailwind chat-style user interface that simulates an **Alexa+** conversational assistant.

## Features
- **Conversational Chat Interface**: Simulates hands-free Alexa+ voice requests for academic operations.
- **Natural Language Intent Routing**: Maps conversational user input to structured MCP tools (`get_smart_brief`, `list_tasks`, `propose_action`, `confirm_action`).
- **AWS Bedrock Proof Indicator**: Dynamically reads `result.source` on operational briefs and renders an understated tag:
  - `via AWS Bedrock`: live synthesis via Claude 3 on AWS Bedrock Runtime.
  - `offline fallback`: deterministic structured brief when Bedrock is unreachable or unconfigured.
- **Guarded Action Confirmation Modal**: Enforces explicit human confirmation dialogs for `HUMAN_REQUIRED` actions (such as paying tuition fees or final project submissions).
- **Live Task Board**: Sidebar tracking real-time status (`open`, `blocked`, `done`, `stale`) with live task counters and visual dependency indicators.
- **Quick Workflow Steps**: One-click demo buttons modeling the core user story:
  1. **"What's due?"** — triggers `get_smart_brief`
  2. **"Check blocked"** — shows blocked tasks and prerequisites
  3. **"Complete dependency"** — resolves prerequisite architecture specification
  4. **"Verify unblocked"** — verifies dependent task unblocks to open
  5. **"Pay tuition"** — triggers the guarded confirmation modal
- **Streamable HTTP MCP Integration**: Connects to the Campus Ops MCP Server over HTTP via `/api/mcp` server-side proxy with session management (`mcp-session-id`).

## Running Locally

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run dev server on port 3000
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables
- `MCP_SERVER_URL`: URL of the Campus Ops MCP server (e.g. `http://localhost:3001` or `https://campus-ops-mcp-xlse.onrender.com`).
- `NEXT_PUBLIC_MCP_SERVER_URL`: Client-side fallback URL for the MCP backend.

## Production Deployment
Deployed on Vercel: [https://campusmcp.vercel.app](https://campusmcp.vercel.app)
See [docs/TESTING.md](../docs/TESTING.md) for 2-minute verification instructions for judges.
