//! Error codes returned across the C ABI as negative i32 values.
//!
//! Positive return values from the exports are handles or byte lengths.
//! Zero is reserved for "not found" on lookup-style exports.

#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    Ok = 0,
    UnknownSession = -1,
    UnknownRequest = -2,
    BadEnvelope = -3,
    BadSignature = -4,
    DecryptFailed = -5,
    RequestExpired = -6,
    BufferTooSmall = -7,
    InvalidArg = -8,
    InvalidHandle = -9,
    HandleCollision = -10,
    Internal = -99,
}

impl ErrorCode {
    #[inline]
    pub const fn as_i32(self) -> i32 {
        self as i32
    }
}

impl From<ErrorCode> for i32 {
    fn from(c: ErrorCode) -> i32 {
        c as i32
    }
}
