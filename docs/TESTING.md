# Testing Instructions for Judges

To verify the project in under 2 minutes:

1. **Open the Live Simulator**: Visit [https://campusmcp.vercel.app](https://campusmcp.vercel.app).
2. **Cold-Start Note**: The MCP backend is hosted on Render's free tier. If the service was idling, the first request may take ~20–30s to wake up (the web UI displays a connection status indicator while connecting). Keep-alive pings maintain active sessions.
3. **Ask for an Operational Brief**:
   - Ask or click: *"What's due this week?"* (triggers `get_smart_brief`).
   - The expected result is a calm spoken-style summary with a small muted source tag:
     - `"via AWS Bedrock"` when model invocation is enabled on the AWS account.
     - `"offline fallback"` when the account is awaiting model review (`ValidationException: Operation not allowed`).
     - *Both are expected and valid behaviors demonstrating fault-tolerant degradation.*
4. **Test Dependency Resolution & Invariants**:
   - Ask: *"What's blocked?"* — see `task-cs301-impl` blocked by prerequisite `task-cs301-design`.
   - Ask or click: *"Complete CS 301 design"* — resolves the prerequisite architecture specification.
   - Ask: *"What's blocked?"* again — observe the dependent task automatically unblock to `open` status.
5. **Test Guarded Action Confirmation Modal**:
   - Ask or click: *"Pay tuition"* — because paying tuition has action class `HUMAN_REQUIRED`, direct mutation is blocked and an interactive confirmation modal dialog appears (*"Confirm: mark Spring 2026 Tuition Installment #2 as paid?"*). Click **Confirm** to execute or **Cancel** to reject.
6. **Repeatable Walkthrough (Reset Demo Data)**:
   - All visitors interact with a shared demo SQLite database.
   - Click the small **"Reset demo data"** text button in the Task Board sidebar header at any time.
   - This calls `POST /demo/reset`, clears mutations/audit logs, restores the original 8 demo tasks, refreshes the task counters, and prints: *"Demo data reset to the initial state."*
7. **Direct MCP Health Diagnostics**:
   - Hit [https://campus-ops-mcp-xlse.onrender.com/health](https://campus-ops-mcp-xlse.onrender.com/health) directly to inspect the server's spec version (`2025-11-25`), status (`ok`), and active sessions independent of the frontend.

---

### Built-in Behaviors & Architecture Notes
- **Shared Demo State**: All visitors share the demo SQLite database on Render; the "Reset demo data" button provides complete idempotency.
- **Intent Routing**: Conversational input is routed to structured MCP tools via rule-based intent matching. The Bedrock engine's role is synthesizing the weekly operations brief.
- **Known Limitation**: The AWS project account was blocked from model invocation (`ValidationException: Operation not allowed`) pending AWS Support review at submission time. The system gracefully falls back to structured brief generation without crashing.

