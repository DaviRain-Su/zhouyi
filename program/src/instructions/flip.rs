use pinocchio::{
    AccountView,
    Address,
    error::ProgramError,
    ProgramResult,
};
use pinocchio_log::log;

use crate::state::{flip_yao, is_changing, HexagramState};

/// Flip (变卦) the changing lines of a cast hexagram.
///
/// Transforms old yin (6) → young yang (7) and old yang (9) → young yin (8),
/// producing the "之卦" (derived hexagram).
///
/// Accounts:
///   0. owner     [signer]     - the original caster
///   1. hexagram  [writable]   - the hexagram PDA to transform
///
/// Instruction data: none (just the instruction discriminant byte)
pub fn process(
    _program_id: &Address,
    accounts: &mut [AccountView],
    _instruction_data: &[u8],
) -> ProgramResult {
    // Destructure accounts
    let [owner, hexagram] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify hexagram is writable
    if !hexagram.is_writable() {
        return Err(ProgramError::Immutable);
    }

    // Read and validate account state (immutable borrow scoped)
    let yaos = {
        let data = unsafe { hexagram.borrow_unchecked() };
        if !HexagramState::is_initialized(data) {
            return Err(ProgramError::UninitializedAccount);
        }
        if HexagramState::get_owner(data) != owner.address().as_ref() {
            return Err(ProgramError::IncorrectProgramId);
        }
        if HexagramState::is_flipped(data) {
            return Err(ProgramError::InvalidInstructionData);
        }
        HexagramState::get_yaos(data)
    };

    // Apply the flip transformation
    let mut derived = [0u8; 6];
    let mut flipped_count: u64 = 0;
    for i in 0..6 {
        derived[i] = flip_yao(yaos[i]);
        if is_changing(yaos[i]) {
            flipped_count += 1;
        }
    }

    // Write back
    let data = unsafe { hexagram.borrow_unchecked_mut() };
    HexagramState::set_derived_yaos(data, &derived);
    HexagramState::set_flipped(data);

    // Log the transformation
    log!("Hexagram transformed (之卦):");
    log!("  Original:  [{},{},{},{},{},{}]", yaos[0], yaos[1], yaos[2], yaos[3], yaos[4], yaos[5]);
    log!("  Derived:   [{},{},{},{},{},{}]", derived[0], derived[1], derived[2], derived[3], derived[4], derived[5]);
    log!("  Lines flipped: {}", flipped_count);

    if flipped_count == 0 {
        log!("  No changing lines - hexagram is unchanged");
    }

    Ok(())
}
