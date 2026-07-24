use std::collections::{HashMap, VecDeque};
use std::io::{BufReader, BufWriter, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

use crate::error::ConduitError;
use crate::protocol::{self, Frame};

const INIT_DB: u32 = 1;
const EXECUTE_JSON: u32 = 2;
const CLOSE_DB: u32 = 3;
const LIST_DBS: u32 = 4;
const PING: u32 = 5;
const SHUTDOWN: u32 = 6;

const READY: u32 = 100;
const RESULT: u32 = 101;
const ERROR: u32 = 102;

enum Response {
    Ok(Value),
    Err(ConduitError),
}

struct ConduitInner {
    stdin: Mutex<BufWriter<std::process::ChildStdin>>,
    pending: Mutex<HashMap<String, VecDeque<mpsc::Sender<Response>>>>,
    db_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    write_lock: Mutex<()>,
}

pub struct Conduit {
    inner: Arc<ConduitInner>,
    pub ready: Value,
    child: Child,
    reader: Option<thread::JoinHandle<()>>,
}

pub struct Db {
    inner: Arc<ConduitInner>,
    name: String,
}

pub struct Collection {
    inner: Arc<ConduitInner>,
    db_name: String,
    name: String,
}

impl Conduit {
    pub fn new(binary_path: &str) -> Result<Self, ConduitError> {
        Self::with_args(binary_path, &[])
    }

    pub fn with_args(binary_path: &str, args: &[&str]) -> Result<Self, ConduitError> {
        let mut child = Command::new(binary_path)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;

        let stdout = child.stdout.take().ok_or_else(|| ConduitError::Protocol("no stdout".into()))?;
        let stdin = child.stdin.take().ok_or_else(|| ConduitError::Protocol("no stdin".into()))?;

        let mut reader = BufReader::new(stdout);
        let ready_frame = protocol::read_frame(&mut reader)?;
        if ready_frame.frame_type != READY {
            return Err(ConduitError::Protocol("did not receive READY".into()));
        }
        let ready = ready_frame.payload.get("result").cloned().unwrap_or(Value::Null);

        let inner = Arc::new(ConduitInner {
            stdin: Mutex::new(BufWriter::new(stdin)),
            pending: Mutex::new(HashMap::new()),
            db_locks: Mutex::new(HashMap::new()),
            write_lock: Mutex::new(()),
        });

        let inner_for_reader = Arc::clone(&inner);
        let reader_handle = thread::spawn(move || {
            read_loop(&mut reader, &inner_for_reader.pending);
        });

        Ok(Conduit {
            inner,
            ready,
            child,
            reader: Some(reader_handle),
        })
    }

    pub fn db(&self, name: &str) -> Db {
        Db { inner: Arc::clone(&self.inner), name: name.to_string() }
    }

    pub fn init(&self, name: &str, dir: &str, opts: Option<Value>) -> Result<Db, ConduitError> {
        let db = self.db(name);
        db.init(dir, opts)?;
        Ok(db)
    }

    pub fn close_db(&self, name: &str) -> Result<Value, ConduitError> {
        self.request(name, CLOSE_DB, &json!({}))
    }

    pub fn list_dbs(&self) -> Result<Vec<String>, ConduitError> {
        let result = self.request("", LIST_DBS, &json!({}))?;
        match result {
            Value::Array(arr) => Ok(arr.into_iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            _ => Ok(vec![]),
        }
    }

    pub fn ping(&self) -> Result<Value, ConduitError> {
        self.request("", PING, &json!({}))
    }

    pub fn execute(&self, db: &str, op: &str, body: Option<Value>) -> Result<Value, ConduitError> {
        let mut payload = json!({"op": op});
        if let Some(b) = body {
            payload["body"] = b;
        }
        self.request(db, EXECUTE_JSON, &payload)
    }

    pub fn shutdown(&mut self) -> Result<(), ConduitError> {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.request("", SHUTDOWN, &json!({}));
            let _ = self.child.wait();
        }
        if let Some(handle) = self.reader.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    fn request(&self, db_name: &str, frame_type: u32, payload: &Value) -> Result<Value, ConduitError> {
        let lock = self.lock_for(db_name);
        let _lock_guard = lock.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;

        let (tx, rx) = mpsc::channel();
        {
            let mut pending = self.inner.pending.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;
            pending.entry(db_name.to_string()).or_default().push_back(tx);
        }

        let data = protocol::encode_frame(frame_type, db_name, payload);
        {
            let _wl = self.inner.write_lock.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;
            let mut stdin = self.inner.stdin.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;
            stdin.write_all(&data)?;
            stdin.flush()?;
        }

        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Response::Ok(val)) => Ok(val),
            Ok(Response::Err(e)) => Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => Err(ConduitError::Timeout),
            Err(_) => Err(ConduitError::Closed),
        }
    }

    fn lock_for(&self, db_name: &str) -> Arc<Mutex<()>> {
        let mut locks = self.inner.db_locks.lock().unwrap();
        locks.entry(db_name.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

impl Drop for Conduit {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn read_loop(reader: &mut BufReader<std::process::ChildStdout>, pending: &Mutex<HashMap<String, VecDeque<mpsc::Sender<Response>>>>) {
    loop {
        match protocol::read_frame(reader) {
            Ok(frame) => resolve_frame(&frame, pending),
            Err(_) => {
                let mut map = pending.lock().unwrap();
                for queue in map.values_mut() {
                    while let Some(tx) = queue.pop_front() {
                        let _ = tx.send(Response::Err(ConduitError::Closed));
                    }
                }
                return;
            }
        }
    }
}

fn resolve_frame(frame: &Frame, pending: &Mutex<HashMap<String, VecDeque<mpsc::Sender<Response>>>>) {
    let mut map = pending.lock().unwrap();
    if let Some(queue) = map.get_mut(&frame.db_name) {
        if let Some(tx) = queue.pop_front() {
            let payload = &frame.payload;
            if frame.frame_type == ERROR || payload.get("ok") == Some(&Value::Bool(false)) {
                let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("ERROR").to_string();
                let message = payload.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string();
                let details = payload.get("details").cloned();
                let _ = tx.send(Response::Err(ConduitError::Server { code, message, details }));
            } else {
                let result = payload.get("result").cloned().unwrap_or(Value::Null);
                let _ = tx.send(Response::Ok(result));
            }
        }
    }
}

impl Db {
    fn init(&self, dir: &str, opts: Option<Value>) -> Result<(), ConduitError> {
        let payload = json!({"dir": dir, "opts": opts.unwrap_or(json!({}))});
        let inner = &self.inner;
        let lock = {
            let mut locks = inner.db_locks.lock().unwrap();
            locks.entry(self.name.clone()).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
        };
        let _lock_guard = lock.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;

        let (tx, rx) = mpsc::channel();
        {
            let mut pending = inner.pending.lock().unwrap();
            pending.entry(self.name.clone()).or_default().push_back(tx);
        }
        let data = protocol::encode_frame(INIT_DB, &self.name, &payload);
        {
            let _wl = inner.write_lock.lock().unwrap();
            let mut stdin = inner.stdin.lock().unwrap();
            stdin.write_all(&data)?;
            stdin.flush()?;
        }
        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Response::Ok(_)) => Ok(()),
            Ok(Response::Err(e)) => Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => Err(ConduitError::Timeout),
            Err(_) => Err(ConduitError::Closed),
        }
    }

    pub fn execute(&self, op: &str, body: Option<Value>) -> Result<Value, ConduitError> {
        let mut payload = json!({"op": op});
        if let Some(b) = body {
            payload["body"] = b;
        }
        self.raw_request(EXECUTE_JSON, &payload)
    }

    pub fn c(&self, name: &str) -> Collection {
        Collection { inner: Arc::clone(&self.inner), db_name: self.name.clone(), name: name.to_string() }
    }

    pub fn collection(&self, name: &str) -> Collection {
        self.c(name)
    }

    pub fn get_collections(&self) -> Result<Vec<String>, ConduitError> {
        let result = self.execute("getCollections", None)?;
        match result {
            Value::Array(arr) => Ok(arr.into_iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            _ => Ok(vec![]),
        }
    }

    pub fn ensure_collection(&self, name: &str) -> Result<bool, ConduitError> {
        let r = self.execute("ensureCollection", Some(Value::String(name.to_string())))?;
        Ok(r.as_bool().unwrap_or(false))
    }

    pub fn isset_collection(&self, name: &str) -> Result<bool, ConduitError> {
        let r = self.execute("issetCollection", Some(Value::String(name.to_string())))?;
        Ok(r.as_bool().unwrap_or(false))
    }

    pub fn remove_collection(&self, name: &str) -> Result<bool, ConduitError> {
        let r = self.execute("removeCollection", Some(Value::String(name.to_string())))?;
        Ok(r.as_bool().unwrap_or(false))
    }

    pub fn add(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("add", Some(query))
    }

    pub fn find(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("find", Some(query))
    }

    pub fn find_one(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("findOne", Some(query))
    }

    pub fn update(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("update", Some(query))
    }

    pub fn update_one(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("updateOne", Some(query))
    }

    pub fn remove(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("remove", Some(query))
    }

    pub fn remove_one(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("removeOne", Some(query))
    }

    pub fn update_one_or_add(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("updateOneOrAdd", Some(query))
    }

    pub fn toggle_one(&self, query: Value) -> Result<Value, ConduitError> {
        self.execute("toggleOne", Some(query))
    }

    pub fn close(&self) -> Result<Value, ConduitError> {
        self.raw_request(CLOSE_DB, &json!({}))
    }

    fn raw_request(&self, frame_type: u32, payload: &Value) -> Result<Value, ConduitError> {
        let inner = &self.inner;
        let lock = {
            let mut locks = inner.db_locks.lock().unwrap();
            locks.entry(self.name.clone()).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
        };
        let _lock_guard = lock.lock().map_err(|_| ConduitError::Protocol("lock poisoned".into()))?;

        let (tx, rx) = mpsc::channel();
        {
            let mut pending = inner.pending.lock().unwrap();
            pending.entry(self.name.clone()).or_default().push_back(tx);
        }
        let data = protocol::encode_frame(frame_type, &self.name, payload);
        {
            let _wl = inner.write_lock.lock().unwrap();
            let mut stdin = inner.stdin.lock().unwrap();
            stdin.write_all(&data)?;
            stdin.flush()?;
        }
        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Response::Ok(val)) => Ok(val),
            Ok(Response::Err(e)) => Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => Err(ConduitError::Timeout),
            Err(_) => Err(ConduitError::Closed),
        }
    }
}

impl Collection {
    pub fn add(&self, data: Value, id_gen: bool) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.add(json!({"collection": self.name, "data": data, "id_gen": id_gen}))
    }

    pub fn find(&self, search: Option<Value>, db_find_opts: Option<Value>, find_opts: Option<Value>, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.find(json!({
            "collection": self.name,
            "search": search.unwrap_or(json!({})),
            "dbFindOpts": db_find_opts.unwrap_or(json!({})),
            "findOpts": find_opts.unwrap_or(json!({})),
            "context": context.unwrap_or(json!({}))
        }))
    }

    pub fn find_one(&self, search: Option<Value>, find_opts: Option<Value>, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.find_one(json!({
            "collection": self.name,
            "search": search.unwrap_or(json!({})),
            "findOpts": find_opts.unwrap_or(json!({})),
            "context": context.unwrap_or(json!({}))
        }))
    }

    pub fn update(&self, search: Value, updater: Value, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.update(json!({"collection": self.name, "search": search, "updater": updater, "context": context.unwrap_or(json!({}))}))
    }

    pub fn update_one(&self, search: Value, updater: Value, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.update_one(json!({"collection": self.name, "search": search, "updater": updater, "context": context.unwrap_or(json!({}))}))
    }

    pub fn remove(&self, search: Value, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.remove(json!({"collection": self.name, "search": search, "context": context.unwrap_or(json!({}))}))
    }

    pub fn remove_one(&self, search: Value, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.remove_one(json!({"collection": self.name, "search": search, "context": context.unwrap_or(json!({}))}))
    }

    pub fn update_one_or_add(&self, search: Value, updater: Value, add_arg: Option<Value>, context: Option<Value>, id_gen: bool) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.update_one_or_add(json!({
            "collection": self.name,
            "search": search,
            "updater": updater,
            "add_arg": add_arg.unwrap_or(json!({})),
            "context": context.unwrap_or(json!({})),
            "id_gen": id_gen
        }))
    }

    pub fn toggle_one(&self, search: Value, data: Option<Value>, context: Option<Value>) -> Result<Value, ConduitError> {
        let db = Db { inner: Arc::clone(&self.inner), name: self.db_name.clone() };
        db.toggle_one(json!({"collection": self.name, "search": search, "data": data.unwrap_or(json!({})), "context": context.unwrap_or(json!({}))}))
    }
}
