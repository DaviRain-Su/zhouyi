use pinocchio::error::ProgramError;

/// Yao (爻) values as used in the Zhou Yi divination system.
///
/// The genius of the ancient encoding: a single number encodes TWO things:
///   - Parity (odd/even) → Yin/Yang polarity
///   - Magnitude (extreme/middle) → Changing/Static dynamism
///
///   6 = 老阴 (Old Yin)    — Yin + Changing (the yin that becomes yang)
///   7 = 少阳 (Young Yang) — Yang + Static  (stable yang)
///   8 = 少阴 (Young Yin)  — Yin + Static   (stable yin)
///   9 = 老阳 (Old Yang)   — Yang + Changing (the yang that becomes yin)
pub const OLD_YIN: u8 = 6;
pub const YOUNG_YANG: u8 = 7;
pub const YOUNG_YIN: u8 = 8;
pub const OLD_YANG: u8 = 9;

/// Returns true if the yao represents Yang (阳) — odd values (7, 9).
#[inline(always)]
#[allow(dead_code)]
pub fn is_yang(yao: u8) -> bool {
    yao % 2 == 1
}

/// Returns true if the yao is a changing line (动爻) — extreme values (6, 9).
#[inline(always)]
pub fn is_changing(yao: u8) -> bool {
    yao == OLD_YIN || yao == OLD_YANG
}

/// Flip a changing yao to its transformed state:
///   6 (老阴) → 7 (少阳): yin transforms to yang
///   9 (老阳) → 8 (少阴): yang transforms to yin
/// Static yaos (7, 8) remain unchanged.
#[inline(always)]
pub fn flip_yao(yao: u8) -> u8 {
    match yao {
        OLD_YIN => YOUNG_YANG,   // 6 → 7
        OLD_YANG => YOUNG_YIN,   // 9 → 8
        other => other,           // 7, 8 unchanged
    }
}

/// Validate a yao value is in range [6, 9].
#[inline(always)]
pub fn validate_yao(yao: u8) -> Result<(), ProgramError> {
    if yao < OLD_YIN || yao > OLD_YANG {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

/// Hexagram (卦) stored on-chain as a PDA account.
///
/// Layout (56 bytes total):
///   [0..8]    discriminator  (8 bytes)
///   [8..40]   owner          (32 bytes, Pubkey of the caster)
///   [40..46]  yaos           (6 bytes, values 6/7/8/9)
///   [46..52]  derived_yaos   (6 bytes, after applying changing lines)
///   [52]      has_been_flipped (1 byte, 0 = fresh, 1 = flipped)
///   [53..56]  reserved       (3 bytes, padding)
pub struct HexagramState;

impl HexagramState {
    pub const SIZE: usize = 56;
    pub const DISCRIMINATOR: [u8; 8] = [0x5a, 0x48, 0x4f, 0x55, 0x59, 0x49, 0x00, 0x01]; // "ZHOUYI\0\1"

    pub const OFFSET_DISCRIMINATOR: usize = 0;
    pub const OFFSET_OWNER: usize = 8;
    pub const OFFSET_YAOS: usize = 40;
    pub const OFFSET_DERIVED: usize = 46;
    pub const OFFSET_FLIPPED: usize = 52;

    /// Write the discriminator into account data.
    pub fn init_discriminator(data: &mut [u8]) {
        data[Self::OFFSET_DISCRIMINATOR..Self::OFFSET_DISCRIMINATOR + 8]
            .copy_from_slice(&Self::DISCRIMINATOR);
    }

    /// Check if account data has our discriminator (already initialized).
    pub fn is_initialized(data: &[u8]) -> bool {
        data.len() >= Self::SIZE
            && data[Self::OFFSET_DISCRIMINATOR..Self::OFFSET_DISCRIMINATOR + 8]
                == Self::DISCRIMINATOR
    }

    /// Write the owner pubkey into account data.
    pub fn set_owner(data: &mut [u8], owner: &[u8]) {
        data[Self::OFFSET_OWNER..Self::OFFSET_OWNER + 32]
            .copy_from_slice(&owner[..32]);
    }

    /// Read the owner pubkey from account data.
    pub fn get_owner(data: &[u8]) -> &[u8] {
        &data[Self::OFFSET_OWNER..Self::OFFSET_OWNER + 32]
    }

    /// Write yao values into account data.
    pub fn set_yaos(data: &mut [u8], yaos: &[u8; 6]) {
        data[Self::OFFSET_YAOS..Self::OFFSET_YAOS + 6].copy_from_slice(yaos);
    }

    /// Read yao values from account data.
    pub fn get_yaos(data: &[u8]) -> [u8; 6] {
        let mut yaos = [0u8; 6];
        yaos.copy_from_slice(&data[Self::OFFSET_YAOS..Self::OFFSET_YAOS + 6]);
        yaos
    }

    /// Write derived (post-flip) yao values.
    pub fn set_derived_yaos(data: &mut [u8], yaos: &[u8; 6]) {
        data[Self::OFFSET_DERIVED..Self::OFFSET_DERIVED + 6].copy_from_slice(yaos);
    }

    /// Read derived yao values.
    #[allow(dead_code)]
    pub fn get_derived_yaos(data: &[u8]) -> [u8; 6] {
        let mut yaos = [0u8; 6];
        yaos.copy_from_slice(&data[Self::OFFSET_DERIVED..Self::OFFSET_DERIVED + 6]);
        yaos
    }

    /// Mark the hexagram as having been flipped.
    pub fn set_flipped(data: &mut [u8]) {
        data[Self::OFFSET_FLIPPED] = 1;
    }

    /// Check if the hexagram has been flipped.
    pub fn is_flipped(data: &[u8]) -> bool {
        data[Self::OFFSET_FLIPPED] != 0
    }
}
