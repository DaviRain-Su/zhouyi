use pinocchio::{
    AccountView,
    Address,
    cpi::{Seed, Signer},
    error::ProgramError,
    ProgramResult,
};
use pinocchio_log::log;
use pinocchio_system::instructions::CreateAccount;

use crate::error::validate_yao_data;
use crate::state::{is_changing, HexagramState};

/// Cast (占卜) a new hexagram.
///
/// Accounts:
///   0. payer        [signer, writable]  - pays for the PDA account
///   1. hexagram     [writable]          - the PDA to store the hexagram
///   2. system_program                   - System Program
///
/// Instruction data:
///   [0..6] - 6 yao values, each in range [6, 9]
pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    // Validate and extract yao values
    let yaos = validate_yao_data(instruction_data)?;

    // Destructure accounts
    let [payer, hexagram, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Verify payer is signer
    if !payer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify payer is writable
    if !payer.is_writable() {
        return Err(ProgramError::Immutable);
    }

    // Verify hexagram account is writable
    if !hexagram.is_writable() {
        return Err(ProgramError::Immutable);
    }

    // Derive PDA: ["hexagram", payer_address]
    let payer_key = payer.address();
    let (pda, bump) = Address::derive_program_address(
        &[b"hexagram".as_ref(), payer_key.as_ref()],
        program_id,
    )
    .ok_or(ProgramError::InvalidArgument)?;

    // Verify the hexagram account matches the derived PDA
    if hexagram.address() != &pda {
        return Err(ProgramError::InvalidArgument);
    }

    // Check if already initialized - if so, overwrite (re-cast)
    let is_recast = HexagramState::is_initialized(
        unsafe { hexagram.borrow_unchecked() }
    );

    if !is_recast {
        // First time: create the PDA account via System Program CPI
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
            lamports: 1_500_000, // ~0.0015 SOL, enough for rent exemption on 56 bytes
            space: HexagramState::SIZE as u64,
            owner: program_id,
        }
        .invoke_signed(&[signer])?;
    }

    // Write hexagram data (zero-copy)
    let data = unsafe { hexagram.borrow_unchecked_mut() };

    HexagramState::init_discriminator(data);
    HexagramState::set_owner(data, payer_key.as_ref());
    HexagramState::set_yaos(data, &yaos);

    // Initialize derived yaos as the same as original (before any flip)
    HexagramState::set_derived_yaos(data, &yaos);
    data[HexagramState::OFFSET_FLIPPED] = 0;

    // Log the cast result
    log!("Hexagram cast:");
    log!("  Yao 1 (bottom): {}", yaos[0]);
    log!("  Yao 2: {}", yaos[1]);
    log!("  Yao 3: {}", yaos[2]);
    log!("  Yao 4: {}", yaos[3]);
    log!("  Yao 5: {}", yaos[4]);
    log!("  Yao 6 (top): {}", yaos[5]);

    // Count and log changing lines
    let changing_count = yaos.iter().filter(|&&y| is_changing(y)).count();
    log!("  Changing lines: {}", changing_count as u64);

    if changing_count > 0 {
        log!("  Dynamic hexagram - call Flip to transform");
    } else {
        log!("  Static hexagram - no changing lines");
    }

    Ok(())
}
