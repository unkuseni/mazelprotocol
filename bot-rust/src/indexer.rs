//! Ticket indexer for the draw bot.
//!
//! Fetches all tickets for a draw via `getProgramAccounts`, matches them
//! against winning numbers, counts winners per tier, and computes the
//! SHA256 verification hash that gets submitted on-chain during finalization.

use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

use crate::config;
use crate::error::{BotError, Result};

// ---------------------------------------------------------------------------
// Winner count types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct MainWinnerCounts {
    pub match6: u32,
    pub match5: u32,
    pub match4: u32,
    pub match3: u32,
    pub match2: u32,
}

#[derive(Debug, Clone)]
pub struct QpWinnerCounts {
    pub match5: u32,
    pub match4: u32,
    pub match3: u32,
}

#[derive(Debug)]
pub struct IndexerResult {
    pub winner_counts: MainWinnerCounts,
    pub total_tickets_scanned: u64,
    pub verification_hash: [u8; 32],
    pub nonce: u64,
    pub duration_ms: u64,
}

#[derive(Debug)]
pub struct QpIndexerResult {
    pub winner_counts: QpWinnerCounts,
    pub total_tickets_scanned: u64,
    pub verification_hash: [u8; 32],
    pub nonce: u64,
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Main lottery indexer
// ---------------------------------------------------------------------------

/// Index all tickets for a main lottery draw and compute winner counts.
pub async fn index_main_draw(
    rpc: &RpcClient,
    program_id: &Pubkey,
    draw_id: u64,
    winning_numbers: &[u8],
) -> Result<IndexerResult> {
    let start = std::time::Instant::now();
    let sorted_winning = ensure_sorted(winning_numbers);

    tracing::info!(draw_id, winning_numbers = ?sorted_winning, "[main] Indexing tickets");

    // Fetch tickets using getProgramAccounts filter on draw_id
    let tickets = fetch_main_tickets(rpc, program_id, draw_id).await?;

    tracing::debug!(draw_id, ticket_count = tickets.len(), "[main] Fetched tickets");

    // Count winners
    let mut counts = MainWinnerCounts { match6: 0, match5: 0, match4: 0, match3: 0, match2: 0 };

    let total = tickets.len() as u64;
    for ticket in &tickets {
        let matches = count_matches(ticket, &sorted_winning);
        match matches {
            6 => counts.match6 += 1,
            5 => counts.match5 += 1,
            4 => counts.match4 += 1,
            3 => counts.match3 += 1,
            2 => counts.match2 += 1,
            _ => {}
        }
    }

    // Generate nonce for replay protection
    let nonce = uuid::Uuid::new_v4().as_u64_pair().0;
    let verification_hash = compute_verification_hash_main(&counts, nonce);

    let duration_ms = start.elapsed().as_millis() as u64;

    tracing::info!(
        draw_id,
        total_tickets = total,
        ?counts,
        nonce,
        duration_ms,
        "[main] Indexing complete"
    );

    Ok(IndexerResult {
        winner_counts: counts,
        total_tickets_scanned: total,
        verification_hash,
        nonce,
        duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Quick Pick indexer
// ---------------------------------------------------------------------------

/// Index all tickets for a Quick Pick draw.
pub async fn index_qp_draw(
    rpc: &RpcClient,
    program_id: &Pubkey,
    draw_id: u64,
    winning_numbers: &[u8],
) -> Result<QpIndexerResult> {
    let start = std::time::Instant::now();
    let sorted_winning = ensure_sorted(winning_numbers);

    let tickets = fetch_qp_tickets(rpc, program_id, draw_id).await?;

    let mut counts = QpWinnerCounts { match5: 0, match4: 0, match3: 0 };

    let total = tickets.len() as u64;
    for ticket in &tickets {
        let matches = count_matches(ticket, &sorted_winning);
        match matches {
            5 => counts.match5 += 1,
            4 => counts.match4 += 1,
            3 => counts.match3 += 1,
            _ => {}
        }
    }

    let nonce = uuid::Uuid::new_v4().as_u64_pair().0;
    let verification_hash = compute_verification_hash_qp(&counts, nonce);
    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(QpIndexerResult {
        winner_counts: counts,
        total_tickets_scanned: total,
        verification_hash,
        nonce,
        duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Ticket fetching via getProgramAccounts
// ---------------------------------------------------------------------------

async fn fetch_main_tickets(
    rpc: &RpcClient,
    program_id: &Pubkey,
    draw_id: u64,
) -> Result<Vec<Vec<u8>>> {
    use solana_account_decoder::UiDataSliceConfig;
    use solana_client::rpc_filter::{Memcmp, RpcFilterType};

    let draw_id_bytes = draw_id.to_le_bytes();

    // Anchor account discriminator for TicketData (8 bytes) + draw_id offset
    // The draw_id field starts at byte 8 (after discriminator) in the TicketData struct
    let filters = vec![RpcFilterType::Memcmp(Memcmp::new(8, draw_id_bytes.to_vec()))];

    let accounts = rpc.get_program_accounts_with_config(
        program_id,
        solana_client::rpc_config::RpcProgramAccountsConfig {
            filters: Some(filters),
            account_config: solana_client::rpc_config::RpcAccountInfoConfig {
                encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
                data_slice: None,
                commitment: None,
                min_context_slot: None,
            },
            ..Default::default()
        },
    )?;

    // Parse ticket data: each ticket is a list of u8 numbers
    let tickets: Vec<Vec<u8>> = accounts
        .iter()
        .filter_map(|(_pubkey, account)| {
            if account.data.len() < 16 {
                return None;
            }
            // TicketData layout:
            // [0..8] anchor discriminator
            // [8..16] draw_id (u64 LE)
            // [16..22] numbers (6 × u8)
            let numbers = account.data[16..22].to_vec();
            Some(numbers)
        })
        .collect();

    Ok(tickets)
}

async fn fetch_qp_tickets(
    rpc: &RpcClient,
    program_id: &Pubkey,
    draw_id: u64,
) -> Result<Vec<Vec<u8>>> {
    use solana_client::rpc_filter::{Memcmp, RpcFilterType};

    let draw_id_bytes = draw_id.to_le_bytes();

    let filters = vec![RpcFilterType::Memcmp(Memcmp::new(8, draw_id_bytes.to_vec()))];

    let accounts = rpc.get_program_accounts_with_config(
        program_id,
        solana_client::rpc_config::RpcProgramAccountsConfig {
            filters: Some(filters),
            account_config: solana_client::rpc_config::RpcAccountInfoConfig {
                encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
                ..Default::default()
            },
            ..Default::default()
        },
    )?;

    let tickets: Vec<Vec<u8>> = accounts
        .iter()
        .filter_map(|(_pubkey, account)| {
            if account.data.len() < 13 {
                return None;
            }
            // QP ticket: [0..8] discriminator, [8..16] draw_id, [16..21] numbers (5 × u8)
            let numbers = account.data[16..21].to_vec();
            Some(numbers)
        })
        .collect();

    Ok(tickets)
}

// ---------------------------------------------------------------------------
// Matching & hashing
// ---------------------------------------------------------------------------

/// Count how many numbers in `ticket` match `winning_numbers`.
fn count_matches(ticket: &[u8], winning: &[u8]) -> u32 {
    let mut count = 0;
    for &num in ticket {
        if winning.contains(&num) {
            count += 1;
        }
    }
    count
}

/// Ensure numbers are sorted ascending.
fn ensure_sorted(numbers: &[u8]) -> Vec<u8> {
    let mut sorted = numbers.to_vec();
    sorted.sort();
    sorted
}

/// Compute SHA256 verification hash for main lottery winner counts + nonce.
/// Hash = SHA256(match6 || match5 || match4 || match3 || match2 || nonce)
fn compute_verification_hash_main(counts: &MainWinnerCounts, nonce: u64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(&counts.match6.to_le_bytes());
    hasher.update(&counts.match5.to_le_bytes());
    hasher.update(&counts.match4.to_le_bytes());
    hasher.update(&counts.match3.to_le_bytes());
    hasher.update(&counts.match2.to_le_bytes());
    hasher.update(&nonce.to_le_bytes());
    let result = hasher.finalize();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result);
    hash
}

/// Compute SHA256 verification hash for QP winner counts + nonce.
fn compute_verification_hash_qp(counts: &QpWinnerCounts, nonce: u64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(&counts.match5.to_le_bytes());
    hasher.update(&counts.match4.to_le_bytes());
    hasher.update(&counts.match3.to_le_bytes());
    hasher.update(&nonce.to_le_bytes());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&hasher.finalize());
    hash
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_matches_all() {
        assert_eq!(count_matches(&[1, 2, 3, 4, 5, 6], &[1, 2, 3, 4, 5, 6]), 6);
    }

    #[test]
    fn test_count_matches_none() {
        assert_eq!(count_matches(&[1, 2, 3, 4, 5, 6], &[7, 8, 9, 10, 11, 12]), 0);
    }

    #[test]
    fn test_count_matches_partial() {
        assert_eq!(count_matches(&[1, 2, 3, 4, 5, 6], &[1, 2, 3, 10, 11, 12]), 3);
    }

    #[test]
    fn test_count_matches_unordered() {
        assert_eq!(count_matches(&[6, 5, 4, 3, 2, 1], &[1, 2, 3, 4, 5, 6]), 6);
    }

    #[test]
    fn test_ensure_sorted() {
        assert_eq!(ensure_sorted(&[6, 3, 1, 5, 2, 4]), vec![1, 2, 3, 4, 5, 6]);
    }

    #[test]
    fn test_verification_hash_deterministic() {
        let counts = MainWinnerCounts { match6: 0, match5: 1, match4: 3, match3: 10, match2: 50 };
        let h1 = compute_verification_hash_main(&counts, 42);
        let h2 = compute_verification_hash_main(&counts, 42);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_verification_hash_different_nonce() {
        let counts = MainWinnerCounts { match6: 0, match5: 1, match4: 0, match3: 0, match2: 0 };
        let h1 = compute_verification_hash_main(&counts, 1);
        let h2 = compute_verification_hash_main(&counts, 2);
        assert_ne!(h1, h2);
    }
}
