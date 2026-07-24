use std::io::{self, Read};

pub const HEADER_SIZE: usize = 12;

pub struct Frame {
    pub frame_type: u32,
    pub db_name: String,
    pub payload: serde_json::Value,
}

pub fn encode_frame(frame_type: u32, db_name: &str, payload: &serde_json::Value) -> Vec<u8> {
    let db_name_bytes = db_name.as_bytes();
    let payload_bytes = serde_json::to_vec(payload).unwrap();
    let mut buf = Vec::with_capacity(HEADER_SIZE + db_name_bytes.len() + payload_bytes.len());
    buf.extend_from_slice(&frame_type.to_le_bytes());
    buf.extend_from_slice(&(db_name_bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(&(payload_bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(db_name_bytes);
    buf.extend_from_slice(&payload_bytes);
    buf
}

pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Frame> {
    let mut header = [0u8; HEADER_SIZE];
    reader.read_exact(&mut header)?;

    let frame_type = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let db_name_len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let payload_len = u32::from_le_bytes([header[8], header[9], header[10], header[11]]) as usize;

    let mut db_name_bytes = vec![0u8; db_name_len];
    if db_name_len > 0 {
        reader.read_exact(&mut db_name_bytes)?;
    }
    let db_name = String::from_utf8(db_name_bytes)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    let mut payload_bytes = vec![0u8; payload_len];
    if payload_len > 0 {
        reader.read_exact(&mut payload_bytes)?;
    }
    let payload: serde_json::Value = if payload_bytes.is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_slice(&payload_bytes)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?
    };

    Ok(Frame { frame_type, db_name, payload })
}
