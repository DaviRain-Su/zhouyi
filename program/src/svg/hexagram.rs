use pinocchio::error::ProgramError;

use crate::state::{is_changing, is_yang};

struct SvgWriter<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> SvgWriter<'a> {
    fn new(buf: &'a mut [u8]) -> Self {
        Self { buf, len: 0 }
    }

    fn write_str(&mut self, value: &str) -> Result<(), ProgramError> {
        self.write_bytes(value.as_bytes())
    }

    fn write_bytes(&mut self, value: &[u8]) -> Result<(), ProgramError> {
        let end = self
            .len
            .checked_add(value.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if end > self.buf.len() {
            return Err(ProgramError::AccountDataTooSmall);
        }
        self.buf[self.len..end].copy_from_slice(value);
        self.len = end;
        Ok(())
    }

    fn write_u16(&mut self, value: u16) -> Result<(), ProgramError> {
        if value == 0 {
            return self.write_bytes(b"0");
        }
        let mut digits = [0u8; 5];
        let mut cursor = digits.len();
        let mut remaining = value;
        while remaining > 0 {
            cursor -= 1;
            digits[cursor] = b'0' + (remaining % 10) as u8;
            remaining /= 10;
        }
        self.write_bytes(&digits[cursor..])
    }

    fn len(&self) -> usize {
        self.len
    }
}

struct Palette {
    bg: &'static str,
    yang_color: &'static str,
    changing_color: &'static str,
    #[allow(dead_code)]
    accent: &'static str,
}

impl Palette {
    fn dark(has_changes: bool) -> Self {
        Self {
            bg: "#0a0a0a",
            yang_color: "#e0d8c8",
            changing_color: if has_changes { "#ff9944" } else { "#e0d8c8" },
            accent: "#ff9944",
        }
    }
}

/// Generate an on-chain SVG representation of a hexagram (卦).
///
/// Renders 6 lines from bottom to top (yao 1 = bottom, yao 6 = top):
/// - Yang (7, 9): solid horizontal line
/// - Yin (6, 8): broken line (gap in center)
/// - Changing (6, 9): accent color
///
/// If `derived` is Some and there are changing lines, renders dual hexagram with arrow.
pub fn generate_hexagram_svg(
    yaos: &[u8; 6],
    derived: Option<&[u8; 6]>,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let has_changes = yaos.iter().any(|&y| is_changing(y));
    let palette = Palette::dark(has_changes);
    let show_dual = derived.is_some() && has_changes;

    let line_w: u16 = 160;
    let line_x: u16 = 20;
    let spacing: u16 = 24;
    let top_pad: u16 = 10;

    let view_w: u16 = if show_dual {
        line_w * 2 + line_x * 2 + 30
    } else {
        line_w + line_x * 2
    };
    let view_h: u16 = top_pad + 6 * spacing + 14;

    let mut svg = SvgWriter::new(buf);

    // SVG open tag
    svg.write_str(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 "#)?;
    svg.write_u16(view_w)?;
    svg.write_str(" ")?;
    svg.write_u16(view_h)?;
    svg.write_str(r#"" data-soul="zhouyi">"#)?;

    // Background
    svg.write_str(r#"<rect width=""#)?;
    svg.write_u16(view_w)?;
    svg.write_str(r#"" height=""#)?;
    svg.write_u16(view_h)?;
    svg.write_str(r#"" fill=""#)?;
    svg.write_str(palette.bg)?;
    svg.write_str(r#"" rx="6"/>"#)?;

    // Render primary hexagram (本卦)
    render_lines(&mut svg, yaos, line_x, top_pad, spacing, line_w, &palette)?;

    // Render derived hexagram (之卦) if changing lines exist
    if let Some(derived_yaos) = derived {
        if has_changes {
            let dx = line_x + line_w + 30;
            render_lines(&mut svg, derived_yaos, dx, top_pad, spacing, line_w, &palette)?;
        }
    }

    svg.write_str("</svg>")?;
    Ok(svg.len())
}

fn render_lines(
    svg: &mut SvgWriter<'_>,
    yaos: &[u8; 6],
    x: u16,
    y: u16,
    spacing: u16,
    line_w: u16,
    palette: &Palette,
) -> Result<(), ProgramError> {
    // Render from top (yao 6) to bottom (yao 1)
    for i in (0..6).rev() {
        let yao = yaos[i];
        let ly = y + ((5 - i) as u16) * spacing;
        let is_chg = is_changing(yao);
        let color = if is_chg { palette.changing_color } else { palette.yang_color };
        let h: u16 = if is_chg { 4 } else { 3 };

        if is_yang(yao) {
            // Solid line
            svg.write_str(r#"<rect x=""#)?;
            svg.write_u16(x)?;
            svg.write_str(r#"" y=""#)?;
            svg.write_u16(ly)?;
            svg.write_str(r#"" width=""#)?;
            svg.write_u16(line_w)?;
            svg.write_str(r#"" height=""#)?;
            svg.write_u16(h)?;
            svg.write_str(r#"" fill=""#)?;
            svg.write_str(color)?;
            svg.write_str(r#"" rx="1"/>"#)?;
        } else {
            // Broken line — two segments with gap
            let seg_w = (line_w - 20) / 2;
            let gap_x = x + seg_w + 10;
            // Left
            svg.write_str(r#"<rect x=""#)?;
            svg.write_u16(x)?;
            svg.write_str(r#"" y=""#)?;
            svg.write_u16(ly)?;
            svg.write_str(r#"" width=""#)?;
            svg.write_u16(seg_w)?;
            svg.write_str(r#"" height=""#)?;
            svg.write_u16(h)?;
            svg.write_str(r#"" fill=""#)?;
            svg.write_str(color)?;
            svg.write_str(r#"" rx="1"/>"#)?;
            // Right
            svg.write_str(r#"<rect x=""#)?;
            svg.write_u16(gap_x)?;
            svg.write_str(r#"" y=""#)?;
            svg.write_u16(ly)?;
            svg.write_str(r#"" width=""#)?;
            svg.write_u16(seg_w)?;
            svg.write_str(r#"" height=""#)?;
            svg.write_u16(h)?;
            svg.write_str(r#"" fill=""#)?;
            svg.write_str(color)?;
            svg.write_str(r#"" rx="1"/>"#)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{OLD_YANG, OLD_YIN, YOUNG_YANG, YOUNG_YIN};

    fn render(yaos: &[u8; 6]) -> String {
        let mut buf = [0u8; 4096];
        let len = generate_hexagram_svg(yaos, None, &mut buf).expect("svg renders");
        core::str::from_utf8(&buf[..len]).unwrap().to_string()
    }

    fn render_dual(yaos: &[u8; 6], derived: &[u8; 6]) -> String {
        let mut buf = [0u8; 4096];
        let len = generate_hexagram_svg(yaos, Some(derived), &mut buf).expect("svg renders");
        core::str::from_utf8(&buf[..len]).unwrap().to_string()
    }

    #[test]
    fn static_hexagram_renders() {
        let svg = render(&[YOUNG_YANG; 6]);
        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.len() < 4096);
    }

    #[test]
    fn all_yin_renders() {
        let svg = render(&[YOUNG_YIN; 6]);
        assert!(svg.starts_with("<svg"));
        assert!(svg.len() < 4096);
    }

    #[test]
    fn changing_hexagram_dual_renders() {
        let yaos = [OLD_YIN, YOUNG_YANG, OLD_YANG, YOUNG_YIN, YOUNG_YANG, OLD_YIN];
        let derived = [YOUNG_YANG, YOUNG_YANG, YOUNG_YIN, YOUNG_YIN, YOUNG_YANG, YOUNG_YANG];
        let svg = render_dual(&yaos, &derived);
        assert!(svg.contains("data-soul=\"zhouyi\""));
        assert!(svg.len() < 4096);
    }

    #[test]
    fn changing_lines_use_accent_color() {
        let svg = render(&[OLD_YANG, YOUNG_YANG, YOUNG_YIN, YOUNG_YANG, YOUNG_YIN, OLD_YIN]);
        assert!(svg.contains("#ff9944"));
    }
}
