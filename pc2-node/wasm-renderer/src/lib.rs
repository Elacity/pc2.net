//! dDRM Universal Renderer — decrypt and render protected assets in WASM.
//!
//! This crate is compiled to `wasm32-wasip1` and executed by the PC2 node's
//! WASMRuntime. The CEK and plaintext never leave WASM linear memory.
//!
//! ## Operating modes
//!
//! | Mode          | Assets                        | Output                          |
//! |---------------|-------------------------------|---------------------------------|
//! | render        | image, text, pdf, cbz, code   | JPEG/WebP pixels (pixel-lock)   |
//! | render        | epub reflowable               | sanitized XHTML (html-lock)     |
//! | decrypt_only  | any                           | raw plaintext                   |
//! | encrypt_only  | any                           | CEK+IV+ciphertext               |
//! | stream        | audio, video                  | chunked segments                |
//! | interactive   | games, dApps, wasm-apps       | frames via bridge               |
//!
//! ## MemFS interface (used by WASMRuntime.ts)
//!
//! Input:  /input/command.json  (render parameters including CEK)
//!         /input/encrypted.bin (raw encrypted content bytes)
//!         /input/plaintext.bin (raw plaintext bytes — encrypt_only mode)
//! Output: /output/result.json  (success, content_type, total_pages/chapters, error)
//!         /output/rendered.bin (raw rendered bytes — JPEG/WebP/PNG, or sanitized HTML)
//!         /output/encrypted.bin (raw ciphertext — encrypt_only mode)
//!
//! ## Runtime convergence
//!
//! This crate is the future Viewer Provider Capsule in the ElastOS Runtime.
//! See `docs/handover/PC2_CONVERGENCE_INVENTORY_FOR_RUNTIME.md`. The MemFS
//! contract here maps 1:1 to `DRMProvider.render(encrypted, cek, mime) -> Buffer`.

mod decrypt;
#[cfg(feature = "image-render")]
pub mod render;
pub mod watermark;

use serde::{Deserialize, Serialize};

/// Command for the MemFS file-based interface.
/// The encrypted content is read from /input/encrypted.bin (raw bytes),
/// avoiding base64 encoding overhead for large files.
#[derive(Debug, Deserialize)]
pub struct RenderCommand {
    /// Base64-encoded AES-256-GCM Content Encryption Key (32 bytes).
    pub cek_b64: String,
    /// Base64-encoded initialization vector (12 bytes).
    pub iv_b64: String,
    /// MIME type of the original asset (e.g. "image/png", "application/epub+zip").
    pub mime_type: String,
    /// Watermark text (buyer address + timestamp).
    pub watermark: Option<String>,
    /// For multi-page assets (PDF, CBZ): which page to render (0-indexed).
    pub page: Option<u32>,
    /// For EPUB: which chapter to render (0-indexed). Overrides `page` for EPUB.
    pub chapter: Option<u32>,
    /// Maximum output width in pixels (pixel-lock renderers).
    pub max_width: Option<u32>,
    /// Maximum output height in pixels (pixel-lock renderers).
    pub max_height: Option<u32>,
    /// Output format preference (pixel-lock renderers).
    pub output_format: Option<OutputFormat>,
    /// Operating mode. When "decrypt_only", skip rendering and output raw plaintext.
    pub mode: Option<String>,
    /// EPUB reader: buyer wallet address for zero-width forensic watermark.
    /// If absent, falls back to `watermark`.
    pub forensic_mark: Option<String>,
    /// EPUB reader: preferred reader pane width in CSS px (for image resizing hints).
    pub viewport_width: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    #[default]
    Jpeg,
    Webp,
    Png,
    /// Output is sanitized HTML (EPUB reflowable tier).
    Html,
}

/// Single EPUB table-of-contents entry.
#[derive(Debug, Serialize, Clone)]
pub struct TocEntry {
    pub title: String,
    pub chapter_index: u32,
    pub href: String,
}

/// Result metadata written to /output/result.json.
/// The actual rendered bytes go to /output/rendered.bin.
#[derive(Debug, Serialize, Default)]
pub struct RenderResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Response MIME type of the rendered bytes (e.g. "image/jpeg",
    /// "text/html; charset=utf-8; profile=epub-chapter").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// For paginated assets: total pages (PDF, CBZ).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
    /// For EPUB: total number of spine chapters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_chapters: Option<u32>,
    /// For EPUB: table of contents. Returned on the first chapter load;
    /// clients should cache it for the session.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapters: Option<Vec<TocEntry>>,
    /// For EPUB: `true` if the publication declares `rendition:layout=pre-paginated`
    /// (picture books, comics). Callers should treat these as CBZ-like pixel-lock.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fixed_layout: Option<bool>,
    /// For EPUB: publication title from OPF metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epub_title: Option<String>,
    /// For EPUB: publication author from OPF metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epub_author: Option<String>,
    /// Size of rendered output in bytes (written to /output/rendered.bin).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_size: Option<usize>,
}

impl RenderResult {
    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(msg.into()),
            ..Default::default()
        }
    }
}

/// File-based entry point for WASMRuntime integration.
///
/// Takes command JSON + raw encrypted bytes (from MemFS files).
/// Returns (result_json, Option<rendered_bytes>).
/// All sensitive material (CEK, plaintext) is confined to WASM linear memory.
pub fn process_from_files(command_json: &str, encrypted_bytes: &[u8]) -> (String, Option<Vec<u8>>) {
    let (result, rendered) = process_files_inner(command_json, encrypted_bytes);
    let json = serde_json::to_string(&result).unwrap_or_else(|e| {
        serde_json::to_string(&RenderResult::error(format!("serialize error: {e}"))).unwrap()
    });
    (json, rendered)
}

fn process_files_inner(command_json: &str, encrypted_bytes: &[u8]) -> (RenderResult, Option<Vec<u8>>) {
    let cmd: RenderCommand = match serde_json::from_str(command_json) {
        Ok(c) => c,
        Err(e) => return (RenderResult::error(format!("invalid command: {e}")), None),
    };

    // Encrypt-only mode: generate CEK+IV, encrypt the input bytes, return ciphertext.
    // The input is read from /input/plaintext.bin (passed as `encrypted_bytes` by MemFS convention)
    // but interpreted as plaintext in this mode.
    if cmd.mode.as_deref() == Some("encrypt_only") {
        return process_encrypt_only(encrypted_bytes);
    }

    // Decrypt-only mode: decrypt and return raw plaintext bytes (no rendering).
    if cmd.mode.as_deref() == Some("decrypt_only") {
        return process_decrypt_only(&cmd, encrypted_bytes);
    }

    // Render-only mode: input is ALREADY plaintext (decrypted by the caller).
    // Skip AES-GCM decrypt and route straight to the renderer. Used when the
    // caller holds the CEK in a place that cannot be exposed across the FFI
    // boundary (e.g. `ddrm-decrypt`'s WASM linear memory): the caller calls
    // `sessionView.decryptAsset()` first and hands us the resulting bytes
    // with no `cek_b64`/`iv_b64`. The renderer never sees the key in this
    // mode — CEK containment is preserved end-to-end for the WASM backend.
    if cmd.mode.as_deref() == Some("render_only") {
        return route_render_raw(&cmd, encrypted_bytes);
    }

    // Step 1: Decrypt using CEK + IV from command, encrypted bytes from file
    let mut plaintext = match decrypt::aes_gcm_decrypt_raw(&cmd.cek_b64, &cmd.iv_b64, encrypted_bytes) {
        Ok(data) => data,
        Err(e) => return (RenderResult::error(format!("decrypt failed: {e}")), None),
    };

    // Step 2: Route to the appropriate renderer based on MIME type
    let (result, rendered) = route_render_raw(&cmd, &plaintext);

    // Step 3: Zero plaintext in WASM memory before returning
    plaintext.iter_mut().for_each(|b| *b = 0);

    (result, rendered)
}

/// Decrypt-only: AES-GCM decrypt inside WASM, return raw plaintext.
/// The CEK is zeroed after use; plaintext is returned for the caller to handle.
fn process_decrypt_only(cmd: &RenderCommand, encrypted_bytes: &[u8]) -> (RenderResult, Option<Vec<u8>>) {
    let plaintext = match decrypt::aes_gcm_decrypt_raw(&cmd.cek_b64, &cmd.iv_b64, encrypted_bytes) {
        Ok(data) => data,
        Err(e) => return (RenderResult::error(format!("decrypt failed: {e}")), None),
    };

    let size = plaintext.len();
    (
        RenderResult {
            success: true,
            content_type: Some(cmd.mime_type.clone()),
            output_size: Some(size),
            ..Default::default()
        },
        Some(plaintext),
    )
}

/// Encrypt-only: generate random CEK + IV, AES-GCM encrypt inside WASM.
///
/// Returns result JSON containing cek_b64 and iv_b64, plus the ciphertext bytes.
/// The CEK never leaves WASM memory — the caller reads it from result.json.
fn process_encrypt_only(plaintext_bytes: &[u8]) -> (RenderResult, Option<Vec<u8>>) {
    let (cek_b64, iv_b64, ciphertext) = match decrypt::aes_gcm_encrypt_raw(plaintext_bytes) {
        Ok(t) => t,
        Err(e) => return (RenderResult::error(format!("encrypt failed: {e}")), None),
    };

    let size = ciphertext.len();
    let result = RenderResult {
        success: true,
        content_type: Some(format!("cek_b64={cek_b64};iv_b64={iv_b64}")),
        output_size: Some(size),
        ..Default::default()
    };
    (result, Some(ciphertext))
}

fn route_render_raw(cmd: &RenderCommand, plaintext: &[u8]) -> (RenderResult, Option<Vec<u8>>) {
    let mime = cmd.mime_type.as_str();

    #[cfg(feature = "image-render")]
    if mime.starts_with("image/") {
        return render::image::render_image_raw(plaintext, cmd);
    }

    #[cfg(feature = "pdf-render")]
    if mime == "application/pdf" {
        return render::pdf::render_pdf_raw(plaintext, cmd);
    }

    #[cfg(feature = "epub-render")]
    if mime == "application/epub+zip" || mime == "application/epub" {
        return render::epub::render_epub_raw(plaintext, cmd);
    }

    #[cfg(feature = "cbz-render")]
    if is_comic_archive(mime) {
        return render::cbz::render_cbz_raw(plaintext, cmd);
    }

    #[cfg(feature = "code-render")]
    if is_code_type(mime) {
        return render::code::render_code_raw(plaintext, cmd);
    }

    #[cfg(feature = "text-render")]
    if mime == "text/plain" || mime.starts_with("text/") {
        return render::text::render_text_raw(plaintext, cmd);
    }

    (RenderResult::error(format!("unsupported MIME type: {mime}")), None)
}

/// CBZ / CBR archives (comic books). CBR (RAR) is not supported — conversion
/// to CBZ is expected at upload time.
#[cfg(feature = "cbz-render")]
fn is_comic_archive(mime: &str) -> bool {
    matches!(
        mime,
        "application/vnd.comicbook+zip"
            | "application/x-cbz"
            | "application/x-cbr"
            | "application/vnd.comicbook-rar"
    )
}

/// Check if a MIME type represents source code (as opposed to plain text).
#[cfg(feature = "code-render")]
fn is_code_type(mime: &str) -> bool {
    matches!(
        mime,
        "application/javascript"
            | "text/javascript"
            | "application/json"
            | "application/xml"
            | "text/xml"
            | "application/x-yaml"
            | "text/yaml"
            | "text/x-yaml"
            | "application/toml"
            | "text/x-toml"
            | "application/x-sh"
            | "text/x-shellscript"
            | "text/x-python"
            | "text/x-rust"
            | "text/rust"
            | "text/x-c"
            | "text/x-csrc"
            | "text/x-c++"
            | "text/x-c++src"
            | "text/x-java"
            | "text/x-java-source"
            | "text/x-go"
            | "text/x-golang"
            | "text/x-typescript"
            | "text/css"
            | "text/html"
            | "text/x-ruby"
            | "text/x-php"
            | "text/x-swift"
            | "text/x-kotlin"
            | "text/x-sql"
            | "text/markdown"
            | "text/x-markdown"
    )
}
