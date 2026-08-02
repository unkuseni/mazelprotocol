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
        if let Ok(data) = std::fs::read_to_string(&self.path) {
            serde_json::from_str(&data).unwrap_or(StoreData { users: vec![] })
        } else {
            StoreData { users: vec![] }
        }
    }

    fn save(&self, data: &StoreData) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, serde_json::to_string_pretty(data)?)?;
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
        let _guard = self.lock.lock().map_err(|_| {
            crate::error::Error::Store("store lock poisoned".to_string())
        })?;

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
