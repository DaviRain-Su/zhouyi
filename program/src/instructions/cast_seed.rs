use pinocchio::{
    AccountView,
    Address,
    cpi::{Seed, Signer},
    error::ProgramError,
    ProgramResult,
};
use pinocchio_log::log;
use pinocchio_system::instructions::CreateAccount;

use crate::state::{is_changing, HexagramState};
use crate::svg::hexagram::generate_hexagram_svg;

/// CastSeed (天命) — deterministic hexagram from recent blockhash.
///
/// Derives 6 yao values from the combination of:
///   - payer pubkey
///   - recent blockhash (SysvarRecentBockHashes)
///   - slot number
///
/// This creates a "divination" — the blockchain itself determines the hexagram.
///
/// Accounts:
///   0. payer        [signer, writable]  - pays for the PDA account
///   1. hexagram     [writable]          - the PDA to store the hexagram
///   2. slot_sysvar                       - SlotHashes sysvar
///   3. system_program                   - System Program
pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    _instruction_data: &[u8],
) -> ProgramResult {
    let [payer, hexagram, slot_sysvar, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    if !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !payer.is_writable() {
        return Err(ProgramError::Immutable);
    }
    if !hexagram.is_writable() {
        return Err(ProgramError::Immutable);
    }

    let payer_key = payer.address();
    let (pda, bump) = Address::derive_program_address(
        &[b"hexagram".as_ref(), payer_key.as_ref()],
        program_id,
    )
    .ok_or(ProgramError::InvalidArgument)?;

    if hexagram.address() != &pda {
        return Err(ProgramError::InvalidArgument);
    }

    // Read slot hash from sysvar (first 8 bytes of slot + 32 bytes of hash)
    let sysvar_data = unsafe { slot_sysvar.borrow_unchecked() };
    if sysvar_data.len() < 40 {
        return Err(ProgramError::InvalidArgument);
    }
    let slot = u64::from_le_bytes(sysvar_data[0..8].try_into().map_err(|_| ProgramError::InvalidArgument)?);
    let blockhash = &sysvar_data[8..40];

    // Derive 6 yao values from payer key + blockhash
    let yaos = derive_yaos(payer_key.as_ref(), blockhash);

    // Create PDA if needed
    let is_recast = HexagramState::is_initialized(
        unsafe { hexagram.borrow_unchecked() }
    );

    if !is_recast {
        let bump_seed = [bump];
        let seeds = [
            Seed::from(b"hexagram".as_slice()),
            Seed::from(payer_key.as_ref()),
            Seed::from(bump_seed.as_slice()),
        ];
        let signer = Signer::from(seeds.as_slice());

        CreateAccount {
            from: payer,
            to: hexagram,
            lamports: 5_000_000,
            space: HexagramState::SIZE as u64,
            owner: program_id,
        }
        .invoke_signed(&[signer])?;
    }

    // Write hexagram data directly into account (no intermediate stack buffer)
    let data = unsafe { hexagram.borrow_unchecked_mut() };
    HexagramState::init_discriminator(data);
    HexagramState::set_owner(data, payer_key.as_ref());
    HexagramState::set_yaos(data, &yaos);
    HexagramState::set_derived_yaos(data, &yaos);
    data[HexagramState::OFFSET_FLIPPED] = 0;
    HexagramState::set_source(data, HexagramState::SOURCE_SEED);
    HexagramState::set_slot(data, slot);

    // Generate SVG directly into account's SVG region
    let svg_region = &mut data[HexagramState::OFFSET_SVG
        ..HexagramState::OFFSET_SVG + crate::state::SVG_CAPACITY];
    let svg_len = generate_hexagram_svg(&yaos, None, svg_region)?;
    data[HexagramState::OFFSET_SVG_LEN..HexagramState::OFFSET_SVG_LEN + 2]
        .copy_from_slice(&(svg_len as u16).to_le_bytes());

    log!("Hexagram divined (天命):");
    log!("  Yao 1 (bottom): {}", yaos[0]);
    log!("  Yao 2: {}", yaos[1]);
    log!("  Yao 3: {}", yaos[2]);
    log!("  Yao 4: {}", yaos[3]);
    log!("  Yao 5: {}", yaos[4]);
    log!("  Yao 6 (top): {}", yaos[5]);

    let changing_count = yaos.iter().filter(|&&y| is_changing(y)).count();
    log!("  Changing lines: {}", changing_count as u64);
    log!("  Slot: {}", slot);

    if changing_count > 0 {
        log!("  Dynamic hexagram - call Flip to transform");
    } else {
        log!("  Static hexagram - no changing lines");
    }

    Ok(())
}

/// Derive 6 yao values deterministically from payer key and blockhash.
///
/// Uses FNV-1a-like hash mixing to produce values in [6, 9]:
///   6 = 老阴 (Old Yin),    7 = 少阳 (Young Yang),
///   8 = 少阴 (Young Yin),  9 = 老阳 (Old Yang)
fn derive_yaos(payer: &[u8], blockhash: &[u8]) -> [u8; 6] {
    let mut yaos = [0u8; 6];
    for i in 0..6 {
        // Mix payer and blockhash with position index
        let mut hash: u32 = 0x811c_9dc5; // FNV offset basis
        // Mix payer key bytes
        for &b in payer.iter().take(8) {
            hash ^= b as u32;
            hash = hash.wrapping_mul(0x0100_0193); // FNV prime
        }
        // Mix blockhash bytes
        for &b in blockhash.iter().take(8) {
            hash ^= b as u32;
            hash = hash.wrapping_mul(0x0100_0193);
        }
        // Mix position index
        hash ^= i as u32;
        hash = hash.wrapping_mul(0x0100_0193);

        // Map to yao value: hash % 4 → {6, 7, 8, 9}
        let yao = 6 + (hash % 4) as u8;
        yaos[i] = yao;
    }
    yaos
}
