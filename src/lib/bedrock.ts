import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { WeeklyBrief } from '../types.js';

export interface SmartBriefResult {
  source: 'aws_bedrock_claude' | 'fallback_structured';
  model: string;
  brief: string;
  structured_brief: WeeklyBrief;
  warning?: string;
}

const DEFAULT_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
const DEFAULT_REGION = 'us-east-1';

export const SYSTEM_PROMPT =
  "You are a calm household/academic ops assistant. Given this task state, write a 3-4 sentence spoken-style brief: what's due soon, what's blocked and why, what needs the student's confirmation. No filler, no enthusiasm, just the facts a person needs before their day starts.";

let cachedClient: BedrockRuntimeClient | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (cachedClient) return cachedClient;

  const region = process.env.AWS_REGION || DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  // If explicit credentials exist, configure credentials object;
  // otherwise fallback to default AWS SDK credential resolution
  cachedClient = new BedrockRuntimeClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          },
        }
      : {}),
  });

  return cachedClient;
}

export function resetBedrockClient(): void {
  cachedClient = null;
}

/**
 * Generate a spoken-style academic operations brief using Claude on AWS Bedrock.
 * Gracefully falls back to structured brief if credentials or API calls fail.
 */
export async function generateSmartBrief(
  briefData: WeeklyBrief,
  clientOverride?: BedrockRuntimeClient
): Promise<SmartBriefResult> {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;

  // Check if AWS credentials appear configured before attempting call
  const hasCreds =
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE;

  if (!hasCreds && !clientOverride) {
    console.warn('[AWS Bedrock Warning] No AWS credentials detected in environment. Using fallback brief.');
    return generateFallbackBrief(briefData, modelId, 'No AWS credentials configured in .env');
  }

  try {
    const client = clientOverride || getBedrockClient();

    // Prepare task state payload for Claude
    const promptContent = `Current student academic ops state:\n${JSON.stringify(
      {
        tasks_due_soon: briefData.tasks_due_soon.map((t) => ({
          title: t.title,
          category: t.category,
          deadline: t.deadline,
          status: t.status,
          action_class: t.action_class,
        })),
        blocked_tasks: briefData.blocked_tasks.map((b) => ({
          task: b.task.title,
          blocked_by: b.blocked_by.map((dep) => `${dep.title} (${dep.status})`),
        })),
        stale_tasks: briefData.stale_tasks.map((t) => ({
          title: t.title,
          category: t.category,
          deadline: t.deadline,
          action_class: t.action_class,
        })),
        pending_confirmations: briefData.pending_confirmations.map((t) => ({
          title: t.title,
          category: t.category,
        })),
        summary: briefData.summary,
      },
      null,
      2
    )}`;

    const command = new ConverseCommand({
      modelId,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [{ text: promptContent }],
        },
      ],
      inferenceConfig: {
        maxTokens: 400,
        temperature: 0.3,
      },
    });

    const response = await client.send(command);

    const messageContent = response.output?.message?.content;
    const textOutput = messageContent?.[0]?.text;

    if (!textOutput) {
      throw new Error('Empty response content received from Bedrock Claude model');
    }

    return {
      source: 'aws_bedrock_claude',
      model: modelId,
      brief: textOutput.trim(),
      structured_brief: briefData,
    };
  } catch (err: any) {
    console.warn(
      `[AWS Bedrock Warning] Failed to invoke Claude model on Bedrock (${err.name || 'Error'}: ${err.message}). Falling back to structured brief.`
    );
    return generateFallbackBrief(briefData, modelId, err.message);
  }
}

/**
 * Deterministic, calm fallback brief generated when AWS Bedrock is unreachable.
 */
function generateFallbackBrief(briefData: WeeklyBrief, modelId: string, errorReason: string): SmartBriefResult {
  const parts: string[] = [];

  // Due soon
  if (briefData.tasks_due_soon.length > 0) {
    const names = briefData.tasks_due_soon.map((t) => t.title).slice(0, 3).join(', ');
    parts.push(`You have ${briefData.tasks_due_soon.length} task(s) due in the next 7 days: ${names}.`);
  } else {
    parts.push('You have no immediate tasks due in the next 7 days.');
  }

  // Blocked
  if (briefData.blocked_tasks.length > 0) {
    const blockedDetails = briefData.blocked_tasks
      .map((b) => `${b.task.title} is waiting on ${b.blocked_by.map((d) => d.title).join(' and ')}`)
      .slice(0, 2)
      .join('; ');
    parts.push(`Currently, ${blockedDetails}.`);
  }

  // Stale
  if (briefData.stale_tasks.length > 0) {
    parts.push(`${briefData.stale_tasks.length} task(s) are overdue and require attention.`);
  }

  // Pending confirmation
  if (briefData.pending_confirmations.length > 0) {
    const confirmTitles = briefData.pending_confirmations.map((t) => t.title).slice(0, 2).join(', ');
    parts.push(`Confirmation is required before advancing: ${confirmTitles}.`);
  }

  return {
    source: 'fallback_structured',
    model: modelId,
    brief: parts.join(' '),
    structured_brief: briefData,
    warning: `Bedrock service fallback active: ${errorReason}`,
  };
}
