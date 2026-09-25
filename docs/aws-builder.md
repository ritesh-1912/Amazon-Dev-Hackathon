# AWS Builder Mini-Challenge: AWS Bedrock Integration

This document outlines how **Campus Ops MCP** integrates Amazon Web Services to fulfill the requirements of the **AWS Builder Mini-Challenge** (Amazon Developer Hackathon 2026).

---

## 1. AWS Service Called

- **Service Name**: **Amazon Bedrock Runtime**
- **Official SDK**: `@aws-sdk/client-bedrock-runtime` (v3)
- **API Invoked**: `ConverseCommand` (Amazon Bedrock Unified Conversational Inference API)
- **Foundation Model**: **Anthropic Claude 3** (Default: `anthropic.claude-3-haiku-20240307-v1:0`, configurable via `BEDROCK_MODEL_ID` to Claude 3.5 Sonnet / Haiku)
- **Authentication**:
  - **Primary / Recommended**: `AWS_BEARER_TOKEN_BEDROCK` (Bedrock API bearer token; automatically resolved by `@aws-sdk/client-bedrock-runtime`)
  - **Documented Fallback**: `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` (standard IAM credentials)
- **Region**: Configured via `AWS_REGION` with no hardcoded fallback (strict validation prevents silent cross-region failures)

---

## 2. Where in the Code

| Component | File Path | Function / Responsibility |
|-----------|-----------|---------------------------|
| **AI Layer Wrapper** | [`src/lib/bedrock.ts`](../src/lib/bedrock.ts) (re-exported at [`lib/bedrock.ts`](../lib/bedrock.ts)) | Initializes `BedrockRuntimeClient`, detects auth method, enforces explicit `AWS_REGION`, formats structured dependency states, defines calm academic ops system prompt, and executes `ConverseCommand`. |
| **MCP Tool Registration** | [`src/tools.ts`](../src/tools.ts) | Exposes `get_smart_brief` tool which pulls state from SQLite and invokes the Bedrock layer. |
| **Environment Configuration** | [`.env.example`](../.env.example) | Specifies `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK` (recommended), `AWS_ACCESS_KEY_ID`/`SECRET` (fallback), and `BEDROCK_MODEL_ID`. |
| **Unit & Resilience Tests** | [`tests/phase3.test.ts`](../tests/phase3.test.ts) | Tests Bedrock request formatting, client execution, auth detection, and graceful fallback behavior. |

---

## 3. Why AWS Bedrock is Used

In an academic operations system, the raw backend state is a complex relational graph containing:
- Prerequisite task dependency trees (e.g., project specifications blocking code submissions).
- Varied categories (tuition installments, lab fees, quizzes, library returns).
- Hard deadlines and overdue (stale) flags.
- Strict action classes (`HUMAN_REQUIRED` vs `AUTO`).

### The Problem
A voice interface like **Alexa+** cannot simply read out raw JSON or recite database rows without overwhelming the student with cognitive overhead.

### The Bedrock Solution
Amazon Bedrock with Claude acts as an **operational synthesizer**:
1. **Context Comprehension**: Ingests the structured JSON output of `get_weekly_brief()` containing upcoming deadlines, blockers, and required confirmations.
2. **Calm Persona**: Enforces a calm, concise spoken-brief persona:
   > *"You are a calm household/academic ops assistant. Given this task state, write a 3-4 sentence spoken-style brief: what's due soon, what's blocked and why, what needs the student's confirmation. No filler, no enthusiasm, just the facts a person needs before their day starts."*
3. **Conversational Synthesis**: Produces 3–4 spoken-style sentences prioritizing immediate deadlines, unblocking steps, and pending approvals.

---

## 4. Graceful Fallback & Error Handling

The server implements fault-tolerant fallback logic in `src/lib/bedrock.ts`:
- **Startup Authentication & Region Verification**: At startup, the server inspects the environment and logs which authentication method is active (`bearer token`, `access key`, or `none`). If `AWS_REGION` is missing, startup fails immediately with a clear error rather than silently defaulting to a wrong region.
- If AWS credentials or bearer tokens are not configured, network connectivity drops, or rate limits occur, the server logs an explicit `[AWS Bedrock Warning]` and returns a structured fallback brief.
- The server won't crash if Bedrock is unreachable; it returns a structured fallback brief instead.
- **UI Verification Proof**: The Alexa+ web simulator inspects the returned tool result `source` field and displays a small, muted tag next to the message (`"via AWS Bedrock"` for live Bedrock calls vs `"offline fallback"` for deterministic fallback), allowing judges and users to verify live execution in production.
