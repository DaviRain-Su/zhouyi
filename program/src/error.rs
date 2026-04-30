use pinocchio::error::ProgramError;

/// Validate that the instruction data contains exactly 6 yao bytes.
pub fn validate_yao_data(data: &[u8]) -> Result<[u8; 6], ProgramError> {
    if data.len() < 6 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let yaos = [data[0], data[1], data[2], data[3], data[4], data[5]];
    for &yao in &yaos {
        crate::state::validate_yao(yao)?;
    }
    Ok(yaos)
}
