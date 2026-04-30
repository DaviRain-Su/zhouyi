import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";

// Program ID deployed on devnet
export const ZHOUYI_PROGRAM_ID = new PublicKey(
  "DFqXUJKoErPKr9mmviuvdys1GZ5nYVrgGYgatX5W2MHf"
);

// Yao constants
export const OLD_YIN = 6;
export const YOUNG_YANG = 7;
export const YOUNG_YIN = 8;
export const OLD_YANG = 9;

export const YAO_NAMES: Record<number, string> = {
  6: "老阴 (Old Yin)",
  7: "少阳 (Young Yang)",
  8: "少阴 (Young Yin)",
  9: "老阳 (Old Yang)",
};

export const YAO_CN: Record<number, string> = {
  6: "老阴",
  7: "少阳",
  8: "少阴",
  9: "老阳",
};

export function isYang(yao: number): boolean {
  return yao % 2 === 1;
}

export function isChanging(yao: number): boolean {
  return yao === OLD_YIN || yao === OLD_YANG;
}

export function flipYao(yao: number): number {
  switch (yao) {
    case OLD_YIN:
      return YOUNG_YANG; // 6 → 7
    case OLD_YANG:
      return YOUNG_YIN; // 9 → 8
    default:
      return yao; // 7, 8 unchanged
  }
}

export function randomYao(): number {
  const values = [6, 7, 8, 9];
  return values[Math.floor(Math.random() * values.length)];
}

export function randomHexagram(): number[] {
  return Array.from({ length: 6 }, () => randomYao());
}

/** Derive the PDA for a hexagram account */
export function findHexagramPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hexagram"), owner.toBuffer()],
    ZHOUYI_PROGRAM_ID
  );
}

/** Account data size: 56 bytes */
export const HEXAGRAM_ACCOUNT_SIZE = 56;

/** Discriminator: "ZHOUYI\0\1" */
const DISCRIMINATOR = Buffer.from([0x5a, 0x48, 0x4f, 0x55, 0x59, 0x49, 0x00, 0x01]);

/** Parse a hexagram account data buffer */
export interface HexagramData {
  owner: PublicKey;
  yaos: number[];
  derivedYaos: number[];
  flipped: boolean;
}

export function parseHexagramData(data: Buffer): HexagramData | null {
  if (data.length < 56) return null;

  // Verify discriminator
  const disc = data.subarray(0, 8);
  if (!disc.equals(DISCRIMINATOR)) return null;

  const owner = new PublicKey(data.subarray(8, 40));
  const yaos = Array.from(data.subarray(40, 46));
  const derivedYaos = Array.from(data.subarray(46, 52));
  const flipped = data[52] !== 0;

  return { owner, yaos, derivedYaos, flipped };
}

/** Build Cast instruction */
export function buildCastInstruction(
  payer: PublicKey,
  yaoValues: number[]
): TransactionInstruction {
  const [pda] = findHexagramPDA(payer);
  const data = Buffer.from([0, ...yaoValues]);

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ZHOUYI_PROGRAM_ID,
    data,
  });
}

/** Build Flip instruction */
export function buildFlipInstruction(
  owner: PublicKey
): TransactionInstruction {
  const [pda] = findHexagramPDA(owner);
  const data = Buffer.from([1]);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: pda, isSigner: false, isWritable: true },
    ],
    programId: ZHOUYI_PROGRAM_ID,
    data,
  });
}

// --- Indexer API ---

export const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://zhouyi-indexer.davirain-yin.workers.dev";

export interface IndexedHexagram {
  address: string;
  owner: string;
  yaos: number[];
  derived: number[];
  flipped: boolean;
}

export async function fetchHexagrams(owner?: string): Promise<IndexedHexagram[]> {
  const url = owner
    ? `${INDEXER_URL}/api/hexagrams?owner=${owner}`
    : `${INDEXER_URL}/api/hexagrams`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  return resp.json();
}
