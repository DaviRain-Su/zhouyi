#![allow(unexpected_cfgs)]

use pinocchio::{
    AccountView,
    Address,
    entrypoint,
    error::ProgramError,
    ProgramResult,
};

mod error;
mod instructions;
mod state;
mod svg;

entrypoint!(process_instruction);

/// Zhou Yi (周易) Oracle — Solana Program
///
/// Instruction format:
///   byte 0: instruction discriminant
///     0 = Cast   — cast a new hexagram (6 yao values follow)
///     1 = Flip   — apply changing line transformation
///
/// The ancient I Ching encoding lives on-chain:
///   6 = 老阴 (Old Yin)    — yin, changing
///   7 = 少阳 (Young Yang) — yang, static
///   8 = 少阴 (Young Yin)  — yin, static
///   9 = 老阳 (Old Yang)   — yang, changing
pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    match instruction_data[0] {
        // Cast (占卜) — create a new hexagram from 6 user-selected yao values
        0 => instructions::cast::process(program_id, accounts, &instruction_data[1..]),
        // Flip (变卦) — transform changing lines into their derived state
        1 => instructions::flip::process(program_id, accounts, &instruction_data[1..]),
        // CastSeed (天命) — deterministic hexagram from blockhash seed
        2 => instructions::cast_seed::process(program_id, accounts, &instruction_data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
