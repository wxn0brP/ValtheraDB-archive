use serde_json::json;
use valtheradb_conduit::Conduit;
use std::path::PathBuf;

fn binary_path() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    let platform = if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") { "linux-arm64" } else { "linux-x64" }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "darwin-arm64" } else { "darwin-x64" }
    } else {
        "windows-x64"
    };
    let name = format!("valtheradb-conduit-{}", platform);
    let mut p = root.join("dist").join(&name);
    if !p.exists() {
        p = root.join("dist").join("valtheradb-conduit");
    }
    p
}

#[test]
fn smoke_test() {
    let bin = binary_path();
    let data_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test").join("data").join("main");
    if data_dir.exists() { std::fs::remove_dir_all(&data_dir).unwrap(); }
    std::fs::create_dir_all(&data_dir).unwrap();

    println!("starting conduit from: {}", bin.display());
    let mut conduit = Conduit::new(bin.to_str().unwrap()).unwrap();
    println!("ready: {:?}", conduit.ready);
    println!("ping: {:?}", conduit.ping().unwrap());

    let db = conduit.init("data", data_dir.to_str().unwrap(), Some(json!({"numberId": false}))).unwrap();
    let users = db.collection("users");

    let ada = users.add(json!({"name": "Ada", "lang": "rust"}), true).unwrap();
    let bob = users.add(json!({"name": "Bob", "lang": "go"}), true).unwrap();
    println!("inserted: {:?} {:?}", ada, bob);

    println!("collections: {:?}", db.get_collections().unwrap());
    println!("find Ada: {:?}", users.find(Some(json!({"name": "Ada"})), None, None, None).unwrap());
    println!("find one Bob: {:?}", users.find_one(Some(json!({"name": "Bob"})), None, None).unwrap());

    let updated = users.update_one(json!({"name": "Ada"}), json!({"lang": "rust-bridge"}), None).unwrap();
    println!("updated Ada: {:?}", updated);
    println!("all users: {:?}", users.find(None, None, None, None).unwrap());

    let removed = users.remove_one(json!({"name": "Bob"}), None).unwrap();
    println!("removed Bob: {:?}", removed);
    println!("after remove: {:?}", users.find(None, None, None, None).unwrap());

    println!("dbs: {:?}", conduit.list_dbs().unwrap());
    conduit.shutdown().unwrap();
    println!("shutdown ok");
}
