// Zhou Yi Indexer — Cloudflare Worker + D1
//
// Cron trigger (every minute) fetches hexagram accounts from Solana devnet
// and upserts them into D1. HTTP API serves indexed data.

interface Env {
  DB: D1Database;
  SOLANA_RPC_URL: string;
  PROGRAM_ID: string;
}

interface HexagramRow {
  address: string;
  owner: string;
  yaos: string;   // JSON [6,7,8,9,7,8]
  derived: string; // JSON after flip
  flipped: number;
  slot: number;
}

const DISCRIMINATOR = [0x5a, 0x48, 0x4f, 0x55, 0x59, 0x49, 0x00, 0x01];
const ACCOUNT_SIZE = 56;

// --- Data parsing ---

function parseHexagram(data: Uint8Array): { yaos: number[]; derived: number[]; flipped: boolean } | null {
  if (data.length < ACCOUNT_SIZE) return null;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== DISCRIMINATOR[i]) return null;
  }
  const yaos = Array.from(data.slice(40, 46));
  const derived = Array.from(data.slice(46, 52));
  const flipped = data[52] !== 0;
  return { yaos, derived, flipped };
}

function decodeBase64(b64: string): Uint8Array {
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let str = "";
  while (num > 0n) {
    const mod = Number(num % 58n);
    str = ALPHABET[mod] + str;
    num /= 58n;
  }
  // handle leading zeros
  for (const b of bytes) {
    if (b === 0) str = ALPHABET[0] + str;
    else break;
  }
  return str;
}

// --- Solana RPC ---

async function fetchProgramAccounts(rpcUrl: string, programId: string): Promise<
  { pubkey: string; data: Uint8Array }[]
> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [
        programId,
        {
          encoding: "base64",
          filters: [{ dataSize: ACCOUNT_SIZE }],
        },
      ],
    }),
  });

  const json = (await resp.json()) as {
    result?: { pubkey: string; account: { data: [string, string] } }[];
  };

  if (!json.result) return [];

  return json.result.map((r) => ({
    pubkey: r.pubkey,
    data: decodeBase64(r.account.data[0]),
  }));
}

// --- Cron handler ---

async function handleCron(env: Env): Promise<void> {
  const accounts = await fetchProgramAccounts(env.SOLANA_RPC_URL, env.PROGRAM_ID);

  for (const acct of accounts) {
    const parsed = parseHexagram(acct.data);
    if (!parsed) continue;

    await env.DB.prepare(
      `INSERT INTO hexagrams (address, owner, yaos, derived, flipped, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(address) DO UPDATE SET
         yaos = excluded.yaos,
         derived = excluded.derived,
         flipped = excluded.flipped,
         updated_at = datetime('now')`
    )
      .bind(
        acct.pubkey,
        base58Encode(acct.data.slice(8, 40)),
        JSON.stringify(parsed.yaos),
        JSON.stringify(parsed.derived),
        parsed.flipped ? 1 : 0
      )
      .run();
  }
}

// --- HTTP API ---

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  // GET /api/hexagrams?owner=...
  if (url.pathname === "/api/hexagrams") {
    const owner = url.searchParams.get("owner");
    let stmt;
    if (owner) {
      stmt = env.DB.prepare("SELECT * FROM hexagrams WHERE owner = ? ORDER BY updated_at DESC").bind(owner);
    } else {
      stmt = env.DB.prepare("SELECT * FROM hexagrams ORDER BY updated_at DESC LIMIT 100");
    }
    const { results } = await stmt.all<HexagramRow>();

    const data = results.map((r) => ({
      address: r.address,
      owner: r.owner,
      yaos: JSON.parse(r.yaos),
      derived: JSON.parse(r.derived),
      flipped: r.flipped === 1,
      updatedAt: r.slot,
    }));

    return Response.json(data, { headers: corsHeaders() });
  }

  // GET /api/hexagram/:address
  if (url.pathname.startsWith("/api/hexagram/")) {
    const addr = url.pathname.slice("/api/hexagram/".length);
    const row = await env.DB.prepare("SELECT * FROM hexagrams WHERE address = ?")
      .bind(addr)
      .first<HexagramRow>();

    if (!row) {
      return Response.json({ error: "not found" }, { status: 404, headers: corsHeaders() });
    }

    return Response.json(
      {
        address: row.address,
        owner: row.owner,
        yaos: JSON.parse(row.yaos),
        derived: JSON.parse(row.derived),
        flipped: row.flipped === 1,
      },
      { headers: corsHeaders() }
    );
  }

  // GET /health
  if (url.pathname === "/health") {
    return new Response("ok", { headers: corsHeaders() });
  }

  return Response.json({ error: "not found" }, { status: 404, headers: corsHeaders() });
}

// --- Worker entry ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await handleCron(env);
  },
};
