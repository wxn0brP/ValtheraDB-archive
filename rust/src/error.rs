use std::fmt;

#[derive(Debug)]
pub enum ConduitError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Protocol(String),
    Server { code: String, message: String, details: Option<serde_json::Value> },
    Closed,
    Timeout,
}

impl fmt::Display for ConduitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConduitError::Io(e) => write!(f, "IO error: {}", e),
            ConduitError::Json(e) => write!(f, "JSON error: {}", e),
            ConduitError::Protocol(msg) => write!(f, "Protocol error: {}", msg),
            ConduitError::Server { code, message, .. } => write!(f, "[{}] {}", code, message),
            ConduitError::Closed => write!(f, "Conduit closed"),
            ConduitError::Timeout => write!(f, "Request timed out"),
        }
    }
}

impl std::error::Error for ConduitError {}

impl From<std::io::Error> for ConduitError {
    fn from(e: std::io::Error) -> Self { ConduitError::Io(e) }
}

impl From<serde_json::Error> for ConduitError {
    fn from(e: serde_json::Error) -> Self { ConduitError::Json(e) }
}
