"use client";

import { isYang, isChanging, YAO_CN } from "@/lib/zhouyi";

interface Props {
  yaos: number[];
  title?: string;
  flipped?: boolean;
  derivedYaos?: number[];
}

function YaoLine({ value, index }: { value: number; index: number }) {
  const yang = isYang(value);
  const changing = isChanging(value);

  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-500 text-xs w-6 text-right">{index + 1}</span>
      <div className="flex-1 flex justify-center">
        {yang ? (
          <div
            className={`h-3 w-48 rounded-sm ${changing ? "bg-gold-300 yao-changing" : "bg-gold-500"}`}
          />
        ) : (
          <div className={`h-3 w-48 relative ${changing ? "yao-changing" : ""}`}>
            <div
              className={`absolute left-0 top-0 h-full w-[45%] rounded-sm ${changing ? "bg-gold-300" : "bg-gold-500"}`}
            />
            <div
              className={`absolute right-0 top-0 h-full w-[45%] rounded-sm ${changing ? "bg-gold-300" : "bg-gold-500"}`}
            />
          </div>
        )}
      </div>
      <span className="text-ink-400 text-xs w-24">
        {YAO_CN[value]}
        {changing && " ○"}
      </span>
    </div>
  );
}

export default function HexagramDisplay({ yaos, title, flipped, derivedYaos }: Props) {
  // Display from top (index 5) to bottom (index 0) — traditional order
  const displayOrder = [...yaos].reverse();

  return (
    <div className="bg-ink-800 rounded-xl p-6 border border-ink-700">
      {title && <h3 className="text-gold-400 font-bold text-lg mb-4 font-han">{title}</h3>}
      <div className="flex flex-col gap-1">
        {displayOrder.map((yao, i) => (
          <YaoLine key={i} value={yao} index={5 - i} />
        ))}
      </div>

      {flipped && derivedYaos && (
        <div className="mt-6 pt-4 border-t border-ink-700">
          <h4 className="text-gold-500 text-sm mb-3 font-han">变卦 (Derived)</h4>
          <div className="flex flex-col gap-1">
            {[...derivedYaos].reverse().map((yao, i) => (
              <YaoLine key={i} value={yao} index={5 - i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
