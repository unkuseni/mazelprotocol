//! Ticket indexer for the draw bot.
//!
//! Fetches all tickets for a draw via `getProgramAccounts`, matches them
//! against winning numbers, counts winners per tier, and computes the
//! SHA256 verification hash that gets submitted on-chain during finalization.

use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_pubkey::Pubkey;

use crate::error::Result;

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
    // The verification hash MUST match the on-chain formula in
    // programs/mazelprotocol/src/instructions/finalize_draw.rs:
    //   SHA256(draw_id || winning_numbers || match_6 || match_5 || match_4 || match_3 || match_2 || nonce)
    // The winning numbers must be sorted ascending exactly as stored in the
    // DrawResult account (execute_draw sorts them before persisting).
    let verification_hash =
        compute_verification_hash_main(draw_id, &sorted_winning, &counts, nonce);

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
    // Must match on-chain formula: SHA256(draw_id || winning_numbers || counts || nonce)
    let verification_hash = compute_verification_hash_qp(draw_id, &sorted_winning, &counts, nonce);
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
    use solana_client::rpc_filter::{Memcmp, RpcFilterType};

    let draw_id_bytes = draw_id.to_le_bytes();

    // TicketData layout (programs/mazelprotocol/src/state/tickets.rs):
    //   [0..8]   anchor discriminator
    //   [8..40]  owner (Pubkey)
    //   [40..48] draw_id (u64 LE)
    //   [48..54] numbers (6 × u8)
    //   ... TICKET_SIZE = 114 bytes total (106 serialized + 8 padding)
    // The Memcmp offset must point at draw_id (40), NOT 8 — otherwise the
    // filter matches the middle of `owner` and returns the wrong accounts.
    let filters = vec![RpcFilterType::Memcmp(Memcmp::new(
        40,
        solana_client::rpc_filter::MemcmpEncodedBytes::Bytes(draw_id_bytes.to_vec()),
    ))];

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

    // Parse every matching account. Single TicketData accounts are 114 bytes
    // (106 serialized bytes plus Anchor's 8-byte trailing padding), while
    // UnifiedTicket bulk-batch accounts are variable-sized starting at 117
    // bytes. Both layouts store draw_id at byte offset 40, so the Memcmp
    // above matches both and the extractor below disambiguates them.
    let mut tickets: Vec<Vec<u8>> = Vec::new();
    for (_pubkey, account) in &accounts {
        tickets.extend(extract_main_ticket_numbers(&account.data, draw_id));
    }

    Ok(tickets)
}

async fn fetch_qp_tickets(
    rpc: &RpcClient,
    program_id: &Pubkey,
    draw_id: u64,
) -> Result<Vec<Vec<u8>>> {
    use solana_client::rpc_filter::{Memcmp, RpcFilterType};

    let draw_id_bytes = draw_id.to_le_bytes();

    // QuickPickTicket layout (programs/quickpick/src/state.rs):
    //   [0..8]   anchor discriminator
    //   [8..40]  owner (Pubkey)
    //   [40..48] draw_id (u64 LE)
    //   [48..53] numbers (5 × u8)
    //   ... QUICK_PICK_TICKET_SIZE = 80 bytes total (72 serialized bytes plus
    //   8 bytes of trailing padding added by Anchor's `space` allocation)
    let filters = vec![RpcFilterType::Memcmp(Memcmp::new(
        40,
        solana_client::rpc_filter::MemcmpEncodedBytes::Bytes(draw_id_bytes.to_vec()),
    ))];

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
        .filter_map(|(_pubkey, account)| extract_qp_ticket_numbers(&account.data))
        .collect();

    Ok(tickets)
}

// ---------------------------------------------------------------------------
// Matching & hashing
// ---------------------------------------------------------------------------

/// Allocated size of a single main-lottery `TicketData` account. Mirrors
/// `TICKET_SIZE` in `programs/mazelprotocol/src/constants.rs`
/// (114 = 106 serialized bytes + 8 bytes of trailing padding).
const MAIN_TICKET_SIZE: usize = 114;

/// Serialized size of `TicketData` without the trailing padding. Accepted for
/// robustness in case the on-chain allocation strategy ever changes.
const MAIN_TICKET_SERIALIZED_SIZE: usize = 106;

/// Minimum allocated size of a `UnifiedTicket` bulk-batch account
/// (`UnifiedTicket::size_for_count(1)` in the main lottery program).
const MAIN_UNIFIED_TICKET_MIN_SIZE: usize = 117;

/// Allocated size of a `QuickPickTicket` account. Mirrors
/// `QUICK_PICK_TICKET_SIZE` (80 = 72 serialized bytes + 8 bytes padding).
const QP_TICKET_SIZE: usize = 80;

/// Serialized size of `QuickPickTicket` without the trailing padding.
const QP_TICKET_SERIALIZED_SIZE: usize = 72;

/// Extract ticket number arrays from a main-lottery program account.
///
/// Handles both on-chain layouts:
/// - Single `TicketData`: numbers at bytes `[48..54]`.
/// - `UnifiedTicket` bulk batch: `ticket_count` u32 at `[56..60]`, the Borsh
///   Vec element count at `[60..64]`, then `ticket_count` packs of 6 numbers
///   starting at byte 64.
///
/// Returns zero or more 6-number arrays. Malformed or unexpected accounts are
/// skipped so a bad RPC node cannot corrupt winner counts.
fn extract_main_ticket_numbers(data: &[u8], expected_draw_id: u64) -> Vec<Vec<u8>> {
    if data.len() == MAIN_TICKET_SERIALIZED_SIZE || data.len() == MAIN_TICKET_SIZE {
        if data.len() < 54 {
            return Vec::new();
        }
        return vec![data[48..54].to_vec()];
    }

    if data.len() < MAIN_UNIFIED_TICKET_MIN_SIZE || data.len() < 64 {
        return Vec::new();
    }

    // Defensive re-check of the draw_id field. The RPC Memcmp already filters
    // on this offset, but verify again before trusting the variable layout.
    let Ok(raw_draw_id) = data[40..48].try_into() else {
        return Vec::new();
    };
    if u64::from_le_bytes(raw_draw_id) != expected_draw_id {
        return Vec::new();
    }

    let Ok(raw_ticket_count) = data[56..60].try_into() else {
        return Vec::new();
    };
    let Ok(raw_declared_count) = data[60..64].try_into() else {
        return Vec::new();
    };
    let ticket_count = u32::from_le_bytes(raw_ticket_count) as usize;
    let declared_count = u32::from_le_bytes(raw_declared_count) as usize;

    // Borsh serializes `Vec<[u8; 6]>` as (u32 element count, elements...), so
    // the declared count must equal ticket_count. Reject mismatches and empty
    // batches to avoid misparsing foreign accounts.
    if ticket_count == 0 || declared_count != ticket_count {
        return Vec::new();
    }

    let numbers_end = 64usize.saturating_add(ticket_count.saturating_mul(6));
    if numbers_end > data.len() {
        return Vec::new();
    }

    (0..ticket_count)
        .map(|i| {
            let start = 64 + i * 6;
            data[start..start + 6].to_vec()
        })
        .collect()
}

/// Extract the 5 numbers from a Quick Pick ticket account, if the account has
/// the expected single-ticket layout.
fn extract_qp_ticket_numbers(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() != QP_TICKET_SIZE && data.len() != QP_TICKET_SERIALIZED_SIZE {
        return None;
    }
    if data.len() < 53 {
        return None;
    }
    Some(data[48..53].to_vec())
}

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
///
/// MUST match the on-chain formula in
/// programs/mazelprotocol/src/instructions/finalize_draw.rs:
///   SHA256(draw_id || winning_numbers || match_6 || match_5 || match_4 || match_3 || match_2 || nonce)
/// `winning_numbers` must be the sorted numbers exactly as stored in the
/// DrawResult account.
fn compute_verification_hash_main(
    draw_id: u64,
    winning_numbers: &[u8],
    counts: &MainWinnerCounts,
    nonce: u64,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(draw_id.to_le_bytes());
    hasher.update(winning_numbers);
    hasher.update(counts.match6.to_le_bytes());
    hasher.update(counts.match5.to_le_bytes());
    hasher.update(counts.match4.to_le_bytes());
    hasher.update(counts.match3.to_le_bytes());
    hasher.update(counts.match2.to_le_bytes());
    hasher.update(nonce.to_le_bytes());
    let result = hasher.finalize();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result);
    hash
}

/// Compute SHA256 verification hash for QP winner counts + nonce.
///
/// MUST match the on-chain formula in
/// programs/quickpick/src/instructions/finalize_draw.rs:
///   SHA256(draw_id || winning_numbers || match_5 || match_4 || match_3 || nonce)
fn compute_verification_hash_qp(
    draw_id: u64,
    winning_numbers: &[u8],
    counts: &QpWinnerCounts,
    nonce: u64,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(draw_id.to_le_bytes());
    hasher.update(winning_numbers);
    hasher.update(counts.match5.to_le_bytes());
    hasher.update(counts.match4.to_le_bytes());
    hasher.update(counts.match3.to_le_bytes());
    hasher.update(nonce.to_le_bytes());
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

    /// Build a 114-byte single-ticket account payload with the given numbers.
    fn make_main_ticket(draw_id: u64, numbers: [u8; 6]) -> Vec<u8> {
        let mut data = vec![0u8; MAIN_TICKET_SIZE];
        data[40..48].copy_from_slice(&draw_id.to_le_bytes());
        data[48..54].copy_from_slice(&numbers);
        data
    }

    #[test]
    fn test_extract_single_main_ticket_114_bytes() {
        let data = make_main_ticket(42, [1, 2, 3, 4, 5, 6]);
        assert_eq!(extract_main_ticket_numbers(&data, 42), vec![vec![1, 2, 3, 4, 5, 6]]);
    }

    #[test]
    fn test_extract_single_main_ticket_unpadded_106_bytes() {
        let mut data = make_main_ticket(9, [7, 14, 21, 28, 35, 42]);
        data.truncate(MAIN_TICKET_SERIALIZED_SIZE);
        assert_eq!(extract_main_ticket_numbers(&data, 9), vec![vec![7, 14, 21, 28, 35, 42]]);
    }

    #[test]
    fn test_extract_unified_ticket_batch() {
        // Layout mirrors UnifiedTicket::size_for_count(2):
        // 8 disc + 32 owner + 8 draw + 8 start + 4 count + 4 vec len
        // + 2 * 6 numbers + 8 ts + 33 syndicate + 4 bitmap len + 1 bitmap + 1 bump
        let count: u32 = 2;
        let total = 8 + 32 + 8 + 8 + 4 + 4 + (count as usize * 6) + 8 + 33 + 4 + 1 + 1;
        let mut data = vec![0u8; total];
        data[40..48].copy_from_slice(&7u64.to_le_bytes());
        data[56..60].copy_from_slice(&count.to_le_bytes());
        data[60..64].copy_from_slice(&count.to_le_bytes());
        data[64..70].copy_from_slice(&[1, 2, 3, 4, 5, 6]);
        data[70..76].copy_from_slice(&[7, 8, 9, 10, 11, 12]);

        assert_eq!(
            extract_main_ticket_numbers(&data, 7),
            vec![vec![1, 2, 3, 4, 5, 6], vec![7, 8, 9, 10, 11, 12]]
        );
    }

    #[test]
    fn test_extract_rejects_mismatched_unified_draw_id() {
        let count: u32 = 1;
        let total = 8 + 32 + 8 + 8 + 4 + 4 + 6 + 8 + 33 + 4 + 1 + 1;
        let mut data = vec![0u8; total];
        data[40..48].copy_from_slice(&7u64.to_le_bytes());
        data[56..60].copy_from_slice(&count.to_le_bytes());
        data[60..64].copy_from_slice(&count.to_le_bytes());
        data[64..70].copy_from_slice(&[1, 2, 3, 4, 5, 6]);

        assert!(extract_main_ticket_numbers(&data, 8).is_empty());
    }

    #[test]
    fn test_extract_qp_ticket_80_bytes() {
        let mut data = vec![0u8; QP_TICKET_SIZE];
        data[40..48].copy_from_slice(&3u64.to_le_bytes());
        data[48..53].copy_from_slice(&[1, 2, 3, 4, 5]);
        assert_eq!(extract_qp_ticket_numbers(&data), Some(vec![1, 2, 3, 4, 5]));
    }

    #[test]
    fn test_extract_rejects_foreign_sizes() {
        assert!(extract_qp_ticket_numbers(&[0u8; 100]).is_none());
        assert!(extract_main_ticket_numbers(&[0u8; 100], 0).is_empty());
    }

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
        let h1 = compute_verification_hash_main(7, &[1, 2, 3, 4, 5, 6], &counts, 42);
        let h2 = compute_verification_hash_main(7, &[1, 2, 3, 4, 5, 6], &counts, 42);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_verification_hash_different_nonce() {
        let counts = MainWinnerCounts { match6: 0, match5: 1, match4: 0, match3: 0, match2: 0 };
        let h1 = compute_verification_hash_main(7, &[1, 2, 3, 4, 5, 6], &counts, 1);
        let h2 = compute_verification_hash_main(7, &[1, 2, 3, 4, 5, 6], &counts, 2);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_verification_hash_matches_onchain_formula() {
        // The on-chain program (programs/mazelprotocol/src/instructions/
        // finalize_draw.rs) verifies:
        //   SHA256(draw_id || winning_numbers || match_6 || match_5 ||
        //          match_4 || match_3 || match_2 || nonce)
        // This test recomputes the hash independently and asserts the bot's
        // helper produces the identical value — locking the formula so a
        // regression here can never silently break finalization again.
        let draw_id: u64 = 9;
        let winning: [u8; 6] = [3, 11, 22, 33, 44, 46];
        let counts = MainWinnerCounts { match6: 0, match5: 2, match4: 5, match3: 40, match2: 300 };
        let nonce: u64 = 123456;

        let mut hasher = Sha256::new();
        hasher.update(draw_id.to_le_bytes());
        hasher.update(winning);
        hasher.update(counts.match6.to_le_bytes());
        hasher.update(counts.match5.to_le_bytes());
        hasher.update(counts.match4.to_le_bytes());
        hasher.update(counts.match3.to_le_bytes());
        hasher.update(counts.match2.to_le_bytes());
        hasher.update(nonce.to_le_bytes());
        let expected: [u8; 32] = hasher.finalize().into();

        assert_eq!(compute_verification_hash_main(draw_id, &winning, &counts, nonce), expected);
    }

    #[test]
    fn test_qp_verification_hash_matches_onchain_formula() {
        // Quick Pick on-chain formula:
        //   SHA256(draw_id || winning_numbers || match_5 || match_4 || match_3 || nonce)
        let draw_id: u64 = 4;
        let winning: [u8; 5] = [5, 12, 20, 29, 35];
        let counts = QpWinnerCounts { match5: 0, match4: 3, match3: 25 };
        let nonce: u64 = 99;

        let mut hasher = Sha256::new();
        hasher.update(draw_id.to_le_bytes());
        hasher.update(winning);
        hasher.update(counts.match5.to_le_bytes());
        hasher.update(counts.match4.to_le_bytes());
        hasher.update(counts.match3.to_le_bytes());
        hasher.update(nonce.to_le_bytes());
        let expected: [u8; 32] = hasher.finalize().into();

        assert_eq!(compute_verification_hash_qp(draw_id, &winning, &counts, nonce), expected);
    }
}
