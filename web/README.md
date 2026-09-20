# Campus Ops — Web Simulator (Alexa+ Interface)

A Next.js (App Router) + TypeScript + Tailwind chat-style user interface that simulates an **Alexa+** conversational assistant.

## Features
- **Conversational Chat Interface**: Simulates hands-free Alexa+ voice requests for academic and operations management.
- **Natural Language Intent Routing**: Parses queries such as *"What's due this week?"*, *"What's blocked?"*, *"Complete CS 301 design"*, and *"Mark fees paid"*.
- **Guarded Confirmation Modals**: Enforces explicit human confirmation dialogs for `HUMAN_REQUIRED` actions (such as paying tuition fees or final project submissions).
- **Live Task Board**: Sidebar tracking real-time status (`open`, `blocked`, `done`, `stale`) with live task counters and visual dependency indicators.
- **Streamable HTTP MCP Integration**: Connects to the Campus Ops MCP Server over HTTP (`http://localhost:3001/mcp`) with full session handling.

## Running Locally

```bash
# Install dependencies
npm install

# Run dev server on port 3000
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
