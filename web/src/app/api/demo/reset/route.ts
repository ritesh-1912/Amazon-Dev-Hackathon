import { NextResponse } from 'next/server';

const rawServerUrl =
  process.env.MCP_SERVER_URL ||
  process.env.MCP_URL ||
  process.env.NEXT_PUBLIC_MCP_SERVER_URL ||
  'http://localhost:3001';
const MCP_SERVER_URL = rawServerUrl.replace(/\/+$/, '');

export const maxDuration = 30;

export async function POST() {
  try {
    const res = await fetch(`${MCP_SERVER_URL}/demo/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return NextResponse.json(
        { error: `Server error: ${errText || res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to reach MCP server' },
      { status: 502 }
    );
  }
}
