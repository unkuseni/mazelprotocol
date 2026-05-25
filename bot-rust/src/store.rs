//! State persistence layer.
//!
//! Persists draw state and bot statistics to JSON files on disk.
//! Designed so that swapping to SQLite requires only changing this module.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::error::Result;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Represents the current phase of a draw lifecycle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DrawPhase {
    Idle,
    AwaitingCommit,
    Committed,
    Executed,
    Indexed,
    Finalized,
    Error,
}

/// Persisted draw state for a single program.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedDrawState {
    pub program: String,
    pub draw_id: u64,
    pub phase: DrawPhase,
    pub commit_slot: Option<u64>,
    pub commit_timestamp: Option<i64>,
    pub randomness_account: Option<String>,
    pub winning_numbers: Option<Vec<u8>>,
    pub indexer_result: Option<IndexerResultData>,
    pub error_count: u32,
    pub last_error: Option<String>,
    pub last_attempt_timestamp: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerResultData {
    pub winner_counts: serde_json::Value,
    pub total_tickets_scanned: u64,
    pub verification_hash: String,
    pub nonce: u64,
}

/// Persisted bot statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedBotStats {
    pub start_time: String,
    pub poll_count: u64,
    pub main_draws_completed: u64,
    pub main_draws_failed: u64,
    pub qp_draws_completed: u64,
    pub qp_draws_failed: u64,
    pub last_main_draw_id: Option<u64>,
    pub last_main_draw_phase: Option<String>,
    pub last_qp_draw_id: Option<u64>,
    pub last_qp_draw_phase: Option<String>,
    pub consecutive_errors: u32,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/// File-based state store.
pub struct Store {
    data_dir: PathBuf,
}

impl Store {
    /// Create a new store with the given data directory.
    pub fn new(data_dir: PathBuf) -> Self {
        Store { data_dir }
    }

    fn ensure_dir(&self) -> Result<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        Ok(())
    }

    fn state_path(&self, program: &str) -> PathBuf {
        self.data_dir.join(format!("{}_draw_state.json", program))
    }

    fn stats_path(&self) -> PathBuf {
        self.data_dir.join("bot_stats.json")
    }

    fn paused_path(&self) -> PathBuf {
        self.data_dir.join("bot_paused.txt")
    }

    // -----------------------------------------------------------------------
    // Draw state
    // -----------------------------------------------------------------------

    pub fn load_draw_state(&self, program: &str) -> Result<Option<PersistedDrawState>> {
        let path = self.state_path(program);
        if !path.exists() {
            return Ok(None);
        }
        let data = std::fs::read_to_string(&path)?;
        let state: PersistedDrawState = serde_json::from_str(&data)?;
        Ok(Some(state))
    }

    pub fn save_draw_state(&self, state: &PersistedDrawState) -> Result<()> {
        self.ensure_dir()?;
        let path = self.state_path(&state.program);
        let data = serde_json::to_string_pretty(state)?;
        std::fs::write(&path, data)?;
        Ok(())
    }

    pub fn clear_draw_state(&self, program: &str) -> Result<()> {
        let path = self.state_path(program);
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Bot stats
    // -----------------------------------------------------------------------

    pub fn load_stats(&self) -> Result<PersistedBotStats> {
        let path = self.stats_path();
        if !path.exists() {
            return Ok(PersistedBotStats {
                start_time: chrono::Utc::now().to_rfc3339(),
                poll_count: 0,
                main_draws_completed: 0,
                main_draws_failed: 0,
                qp_draws_completed: 0,
                qp_draws_failed: 0,
                last_main_draw_id: None,
                last_main_draw_phase: None,
                last_qp_draw_id: None,
                last_qp_draw_phase: None,
                consecutive_errors: 0,
            });
        }
        let data = std::fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&data)?)
    }

    pub fn save_stats(&self, stats: &PersistedBotStats) -> Result<()> {
        self.ensure_dir()?;
        let path = self.stats_path();
        let data = serde_json::to_string_pretty(stats)?;
        std::fs::write(&path, data)?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Paused flag
    // -----------------------------------------------------------------------

    pub fn is_paused(&self) -> bool {
        let path = self.paused_path();
        if let Ok(data) = std::fs::read_to_string(&path) {
            data.trim() == "true"
        } else {
            false
        }
    }

    pub fn set_paused(&self, paused: bool) -> Result<()> {
        self.ensure_dir()?;
        let path = self.paused_path();
        std::fs::write(&path, if paused { "true" } else { "false" })?;
        Ok(())
    }
}
