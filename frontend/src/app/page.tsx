"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Transaction,
  TransactionInstruction,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import HexagramDisplay from "@/components/HexagramDisplay";
import {
  randomHexagram,
  YAO_NAMES,
  isChanging,
  findHexagramPDA,
  HEXAGRAM_ACCOUNT_SIZE,
  parseHexagramData,
  ZHOUYI_PROGRAM_ID,
} from "@/lib/zhouyi";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;

  const [yaos, setYaos] = useState<number[]>([7, 8, 9, 6, 7, 8]);
  const [status, setStatus] = useState<string>("");
  const [onChain, setOnChain] = useState<{
    yaos: number[];
    derivedYaos: number[];
    flipped: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const randomize = useCallback(() => setYaos(randomHexagram()), []);

  const setYao = useCallback((index: number, value: number) => {
    setYaos((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // Cast hexagram on-chain
  const handleCast = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setStatus("Casting hexagram...");

    try {
      const [pda] = findHexagramPDA(publicKey);

      // Build instruction data: [0, yao0..yao5]
      const data = Buffer.from([0, ...yaos]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: ZHOUYI_PROGRAM_ID,
        data,
      });

      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      setStatus(`Cast! Confirming ${sig.slice(0, 12)}...`);
      await connection.confirmTransaction(sig, "confirmed");

      // Fetch the PDA data
      const accountInfo = await connection.getAccountInfo(pda);
      if (accountInfo) {
        const parsed = parseHexagramData(accountInfo.data as Buffer);
        if (parsed) {
          setOnChain({
            yaos: parsed.yaos,
            derivedYaos: parsed.derivedYaos,
            flipped: parsed.flipped,
          });
        }
      }
      setStatus("Hexagram cast successfully!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [publicKey, yaos, sendTransaction, connection]);

  // Flip changing lines
  const handleFlip = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setStatus("Flipping changing lines...");

    try {
      const [pda] = findHexagramPDA(publicKey);

      const data = Buffer.from([1]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: pda, isSigner: false, isWritable: true },
        ],
        programId: ZHOUYI_PROGRAM_ID,
        data,
      });

      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      setStatus(`Flipping... Confirming ${sig.slice(0, 12)}...`);
      await connection.confirmTransaction(sig, "confirmed");

      const accountInfo = await connection.getAccountInfo(pda);
      if (accountInfo) {
        const parsed = parseHexagramData(accountInfo.data as Buffer);
        if (parsed) {
          setOnChain({
            yaos: parsed.yaos,
            derivedYaos: parsed.derivedYaos,
            flipped: parsed.flipped,
          });
        }
      }
      setStatus("Lines transformed!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [publicKey, sendTransaction, connection]);

  const changingCount = yaos.filter(isChanging).length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <h2 className="text-5xl font-black text-gold-400 font-han mb-2">周易</h2>
        <p className="text-ink-400 text-lg">
          Ancient divination, permanently on-chain
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Input */}
        <div>
          <div className="bg-ink-800 rounded-xl p-6 border border-ink-700 mb-6">
            <h3 className="text-gold-400 font-bold text-lg mb-4 font-han">Cast Your Hexagram</h3>

            <div className="space-y-3 mb-6">
              {yaos.map((yao, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-ink-400 text-sm w-20">
                    Yao {i + 1} {i === 0 ? "(bottom)" : i === 5 ? "(top)" : ""}
                  </span>
                  <div className="flex gap-1">
                    {[6, 7, 8, 9].map((v) => (
                      <button
                        key={v}
                        onClick={() => setYao(i, v)}
                        className={`px-3 py-1 rounded text-sm font-mono transition-colors ${
                          yao === v
                            ? "bg-gold-500 text-ink-900"
                            : "bg-ink-700 text-ink-300 hover:bg-ink-600"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className="text-ink-500 text-xs">{YAO_NAMES[yao]}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={randomize}
                className="flex-1 py-2 rounded-lg bg-ink-700 text-ink-200 hover:bg-ink-600 transition-colors text-sm"
              >
                Randomize
              </button>
              <button
                onClick={handleCast}
                disabled={!publicKey || loading}
                className="flex-1 py-2 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-ink-900 font-bold hover:from-gold-500 hover:to-gold-400 transition-colors text-sm disabled:opacity-50"
              >
                {loading ? "Sending..." : "Cast 占卜"}
              </button>
            </div>

            {changingCount > 0 && (
              <p className="text-gold-500 text-xs mt-3">
                {changingCount} changing line{changingCount > 1 ? "s" : ""} detected — use
                Flip to transform
              </p>
            )}
          </div>

          {/* Status */}
          {status && (
            <div className="bg-ink-800 rounded-lg px-4 py-3 border border-ink-700 text-sm text-ink-300 mb-4">
              {status}
            </div>
          )}

          {/* Flip button */}
          {onChain && !onChain.flipped && onChain.yaos.some(isChanging) && (
            <button
              onClick={handleFlip}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-700 to-amber-600 text-white font-bold hover:from-amber-600 hover:to-amber-500 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Flip 变卦"}
            </button>
          )}
        </div>

        {/* Right: Preview + On-chain */}
        <div className="space-y-6">
          <HexagramDisplay yaos={yaos} title="Preview 预览" />

          {onChain && (
            <HexagramDisplay
              yaos={onChain.yaos}
              title="On-Chain 链上"
              flipped={onChain.flipped}
              derivedYaos={onChain.derivedYaos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
