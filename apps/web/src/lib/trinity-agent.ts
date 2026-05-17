const AGENT_URL = 'http://localhost:8765';

export async function isAgentRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${AGENT_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return res.ok;
  } catch {
    return false;
  }
}

export async function readFiscalStatus(): Promise<{
  invoiceFiscalNumber: string;
  creditNoteFiscalNumber: string;
  machineSerial: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${AGENT_URL}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

export async function printTicket(content: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${AGENT_URL}/print-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return false;

    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
