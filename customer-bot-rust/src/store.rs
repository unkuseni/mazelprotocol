//! JSON file-based user store.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub telegram_id: u64,
    pub username: String,
    pub wallet_address: String,
    pub registered_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoreData {
    users: Vec<UserRecord>,
}

pub struct Store {
    path: PathBuf,
    // Serializes read-modify-write cycles. Required because webhook mode
    // spawns a tokio task per update — without this, two concurrent
    // /register calls could lose one another's writes.
    lock: Mutex<()>,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Store { path: dir.join("users.json"), lock: Mutex::new(()) }
    }

    fn load(&self) -> StoreData {
        match std::fs::read_to_string(&self.path) {
            Ok(data) => match serde_json::from_str::<StoreData>(&data) {
                Ok(parsed) => parsed,
                Err(e) => {
                    // A corrupt file must never silently reset to an empty
                    // list: the next save would overwrite real registrations
                    // with an empty store. Move it aside for recovery, then
                    // continue with an empty store (safe now that the corrupt
                    // file is out of the way).
                    tracing::error!(
                        error = %e,
                        path = %self.path.display(),
                        "users.json is corrupt; backing it up and starting with an empty store"
                    );
                    self.backup_corrupt();
                    StoreData { users: vec![] }
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => StoreData { users: vec![] },
            Err(e) => {
                // Any OTHER read failure (permission, EIO, transient I/O)
                // must not silently reset to an empty store: the next save
                // would overwrite the only copy of the registrations. Back
                // the file up first (like the corrupt-file path) so nothing
                // is lost.
                tracing::error!(
                    error = %e,
                    path = %self.path.display(),
                    "failed to read users.json; backing it up and starting with an empty store"
                );
                self.backup_corrupt();
                StoreData { users: vec![] }
            }
        }
    }

    /// Move a corrupt users.json to `<name>.corrupt-<timestamp>` so it is
    /// preserved for inspection instead of being overwritten by the next
    /// save (which would destroy the only copy of the registrations).
    fn backup_corrupt(&self) {
        let stamp = chrono::Utc::now().timestamp();
        let backup = self.path.with_extension(format!("corrupt-{stamp}"));
        match std::fs::rename(&self.path, &backup) {
            Ok(()) => tracing::warn!(
                backup = %backup.display(),
                "corrupt users.json preserved for inspection"
            ),
            Err(e) => tracing::error!(
                error = %e,
                path = %self.path.display(),
                "failed to back up corrupt users.json"
            ),
        }
    }

    fn save(&self, data: &StoreData) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Write to a temp file in the same directory, then rename over the
        // target. A crash mid-write leaves the previous good file in place
        // instead of a truncated users.json, and the rename is atomic on
        // the same filesystem.
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(data)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn get_user(&self, telegram_id: u64) -> Option<UserRecord> {
        let _guard = self.lock.lock().ok()?;
        self.load().users.into_iter().find(|u| u.telegram_id == telegram_id)
    }

    pub fn register_user(
        &self,
        telegram_id: u64,
        username: &str,
        wallet: &str,
    ) -> Result<UserRecord> {
        // Hold the lock across load → mutate → save so concurrent webhook
        // handlers cannot clobber each other's registrations.
        let _guard = self
            .lock
            .lock()
            .map_err(|_| crate::error::Error::Store("store lock poisoned".to_string()))?;

        let mut data = self.load();
        if let Some(existing) = data.users.iter_mut().find(|u| u.telegram_id == telegram_id) {
            existing.wallet_address = wallet.to_string();
            existing.username = username.to_string();
            let rec = existing.clone();
            self.save(&data)?;
            return Ok(rec);
        }
        let rec = UserRecord {
            telegram_id,
            username: username.to_string(),
            wallet_address: wallet.to_string(),
            registered_at: chrono::Utc::now().to_rfc3339(),
        };
        data.users.push(rec.clone());
        self.save(&data)?;
        Ok(rec)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique temp dir per test so parallel tests never collide.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mazelprotocol-customer-bot-{name}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_millis()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn save_writes_temp_file_then_renames() {
        let dir = temp_dir("save");
        let store = Store::new(dir.clone());
        store.register_user(1, "alice", "wallet1").unwrap();
        let content = std::fs::read_to_string(dir.join("users.json")).unwrap();
        assert!(content.contains("alice"));
        // No leftover temp files after a successful save.
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind: {leftovers:?}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_store_is_backed_up_not_silently_reset() {
        let dir = temp_dir("corrupt");
        let store = Store::new(dir.clone());
        store.register_user(1, "alice", "wallet1").unwrap();
        // Corrupt the file on disk.
        std::fs::write(dir.join("users.json"), "{ not json").unwrap();
        let data = store.load();
        assert!(data.users.is_empty(), "corrupt file must not be parsed");
        // The corrupt file must be preserved as a backup, not overwritten.
        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("corrupt"))
            .collect();
        assert_eq!(backups.len(), 1, "corrupt file must be preserved as a backup");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
