import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "周易 Oracle — I Ching on Solana",
  description: "Ancient Chinese divination meets on-chain permanence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-ink-900 text-ink-100">
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-ink-700 px-6 py-4">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gold-400 font-han">周易 Oracle</h1>
                <nav className="flex items-center gap-4">
                  <span className="text-ink-400 text-sm">Devnet</span>
                  {/* @ts-expect-error wallet-adapter-react-ui uses dynamic imports */}
                  <wallet-multi-button />
                </nav>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-ink-700 px-6 py-3 text-center text-ink-500 text-xs">
              Zhou Yi Oracle on Solana · Powered by Pinocchio
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
