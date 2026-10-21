# Testing Instructions for Judges

To verify the project in under 2 minutes:

1. Open the live simulator: [https://campusmcp.vercel.app](https://campusmcp.vercel.app).
2. Note: the MCP server is on Render's free tier and may take up to 30s to wake up on first request — the UI will show a "waking up" message during this, this is expected.
3. Ask "What's due this week?" — the expected result is a brief with a small source tag: "via AWS Bedrock" when Bedrock is enabled for the account, or "offline fallback" otherwise. Both are correct behavior.
4. Try: "What's blocked?", then "Complete CS 301 design", then "What's blocked?" again to see the dependent task unblock, then "Pay tuition fee" to see the confirmation modal.
5. Optionally hit [https://campus-ops-mcp-xlse.onrender.com/health](https://campus-ops-mcp-xlse.onrender.com/health) directly to see the MCP server's spec version and status independent of the UI.

> **Known limitation**: The AWS project account was blocked from model invocation (`ValidationException: Operation not allowed`) pending AWS Support review at submission time.

