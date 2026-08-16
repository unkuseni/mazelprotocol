//! Solana RPC queries — read-only lottery state fetchers.

use crate::config::BotConfig;
use crate::error::Result;
use anchor_lang::AnchorDeserialize;
use solana_client::client_error::{ClientError, ClientErrorKind};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_request::RpcError;
use solana_pubkey::Pubkey;

pub const LOTTERY_SEED: &[u8] = b"lottery";
pub const DRAW_SEED: &[u8] = b"draw";
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
pub const QUICK_PICK_DRAW_SEED: &[u8] = b"quick_pick_draw";

// ---------------------------------------------------------------------------
// IMPORTANT — account layout mirrors
//
// These structs MUST mirror the on-chain Anchor accounts field-for-field
// (borsh is sequential, no alignment padding). The first field of every
// struct is the 8-byte Anchor account discriminator
// (sha256("account:<Name>")[..8]) which is present in the stored data but
// not part of the logical struct.
//
// Reference: programs/mazelprotocol/src/state/lottery_state.rs and
// programs/quickpick/src/state.rs. If the programs ever change these
// layouts, update the mirrors here — the program crates are the single
// source of truth.
// ---------------------------------------------------------------------------

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct LotteryState {
    // Anchor account discriminator (8 bytes)
    _discriminator: [u8; 8],
    _authority: Pubkey,
    // pending_authority: Option<Pubkey> = 1-byte tag + 32-byte pubkey
    _pending_authority: [u8; 33],
    _switchboard_queue: Pubkey,
    _current_randomness_account: Pubkey,
    pub current_draw_id: u64,
    pub jackpot_balance: u64,
    _reserve_balance: u64,
    _insurance_balance: u64,
    _fixed_prize_balance: u64,
    _ticket_price: u64,
    _house_fee_bps: u16,
    _jackpot_cap: u64,
    _seed_amount: u64,
    _soft_cap: u64,
    _hard_cap: u64,
    pub next_draw_timestamp: i64,
    _draw_interval: i64,
    _commit_slot: u64,
    _commit_timestamp: i64,
    pub current_draw_tickets: u64,
    _total_tickets_sold: u64,
    _total_prizes_paid: u64,
    _total_prizes_committed: u64,
    pub is_draw_in_progress: bool,
    _is_awaiting_finalization: bool,
    _is_rolldown_active: bool,
    pub is_paused: bool,
    _is_funded: bool,
    _version: u8,
    _bump: u8,
    _config_timelock_end: i64,
    _pending_config_hash: [u8; 32],
    _emergency_transfer_total: u64,
    _emergency_transfer_window_start: i64,
    _max_rolldown_tickets: u64,
    _sale_target_tickets: u64,
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct DrawResult {
    // Anchor account discriminator (8 bytes)
    _discriminator: [u8; 8],
    pub draw_id: u64,
    pub winning_numbers: [u8; 6],
    _randomness_proof: [u8; 32],
    _timestamp: i64,
    pub total_tickets: u64,
    pub was_rolldown: bool,
    pub match6_win: u32,
    pub match5_win: u32,
    pub match4_win: u32,
    pub match3_win: u32,
    pub match2_win: u32,
    pub m6_prize: u64,
    pub m5_prize: u64,
    pub m4_prize: u64,
    pub m3_prize: u64,
    pub m2_prize: u64,
    _is_explicitly_finalized: bool,
    _total_committed: u64,
    _total_reclaimed: u64,
    _bump: u8,
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct QpState {
    // Anchor account discriminator (8 bytes)
    _discriminator: [u8; 8],
    pub current_draw: u64,
    _ticket_price: u64,
    _pick_count: u8,
    _number_range: u8,
    _house_fee_bps: u16,
    _draw_interval: i64,
    pub next_draw_timestamp: i64,
    pub jackpot_balance: u64,
    _soft_cap: u64,
    _hard_cap: u64,
    _seed_amount: u64,
    _match_4_prize: u64,
    _match_3_prize: u64,
    pub current_draw_tickets: u64,
    _prize_pool_balance: u64,
    _insurance_balance: u64,
    _reserve_balance: u64,
    _total_tickets_sold: u64,
    _total_prizes_paid: u64,
    _current_randomness_account: Pubkey,
    _commit_slot: u64,
    _commit_timestamp: i64,
    pub is_draw_in_progress: bool,
    _is_awaiting_finalization: bool,
    _is_rolldown_pending: bool,
    pub is_paused: bool,
    _is_funded: bool,
    _bump: u8,
    _config_timelock_end: i64,
    _pending_config_hash: [u8; 32],
    _emergency_transfer_total: u64,
    _emergency_transfer_window_start: i64,
    _sale_target_tickets: u64,
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct QpDrawResult {
    // Anchor account discriminator (8 bytes)
    _discriminator: [u8; 8],
    pub draw_id: u64,
    pub winning_numbers: [u8; 5],
    _randomness_proof: [u8; 32],
    _timestamp: i64,
    pub total_tickets: u64,
    pub was_rolldown: bool,
    pub match5_win: u32,
    pub match4_win: u32,
    pub match3_win: u32,
    pub m5_prize: u64,
    pub m4_prize: u64,
    pub m3_prize: u64,
    _is_explicitly_finalized: bool,
    _bump: u8,
}

pub struct Solana {
    rpc: RpcClient,
    cfg: BotConfig,
}

impl Solana {
    pub fn new(cfg: BotConfig) -> Self {
        let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), cfg.commitment);
        Solana { rpc, cfg }
    }

    /// Fetch an account, verify it is owned by the expected program, and
    /// deserialize it as `T`. Failing loudly on owner mismatch prevents
    /// silently parsing garbage when a PDA resolves to the wrong program.
    fn fetch_owned<T: AnchorDeserialize>(
        &self,
        pda: &Pubkey,
        expected_owner: &Pubkey,
        what: &str,
    ) -> Result<T> {
        let acc = self.rpc.get_account(pda)?;
        if acc.owner != *expected_owner {
            return Err(crate::error::Error::Anyhow(anyhow::anyhow!(
                "Account {pda} ({what}) owned by {}, expected {expected_owner}",
                acc.owner
            )));
        }
        let mut data: &[u8] = &acc.data;
        Ok(T::deserialize(&mut data)?)
    }

    pub fn fetch_main_state(&self) -> Result<LotteryState> {
        let (pda, _) = Pubkey::find_program_address(&[LOTTERY_SEED], &self.cfg.main_program_id);
        self.fetch_owned::<LotteryState>(&pda, &self.cfg.main_program_id, "lottery_state")
    }

    pub fn fetch_qp_state(&self) -> Result<QpState> {
        let (pda, _) = Pubkey::find_program_address(&[QUICK_PICK_SEED], &self.cfg.qp_program_id);
        self.fetch_owned::<QpState>(&pda, &self.cfg.qp_program_id, "quick_pick_state")
    }

    pub fn fetch_main_draw(&self, draw_id: u64) -> Result<Option<DrawResult>> {
        let (pda, _) = Pubkey::find_program_address(
            &[DRAW_SEED, &draw_id.to_le_bytes()],
            &self.cfg.main_program_id,
        );
        match self.rpc.get_account(&pda) {
            Ok(_) => Ok(Some(self.fetch_owned::<DrawResult>(
                &pda,
                &self.cfg.main_program_id,
                "main draw_result",
            )?)),
            // Only a genuinely missing account means "draw not found".
            Err(e) if is_account_not_found(&e) => Ok(None),
            // Everything else (RPC outage, rate limit, network failure) is a
            // service problem and must surface as an error, not "not found".
            Err(e) => Err(e.into()),
        }
    }

    pub fn fetch_qp_draw(&self, draw_id: u64) -> Result<Option<QpDrawResult>> {
        let (pda, _) = Pubkey::find_program_address(
            &[QUICK_PICK_DRAW_SEED, &draw_id.to_le_bytes()],
            &self.cfg.qp_program_id,
        );
        match self.rpc.get_account(&pda) {
            Ok(_) => Ok(Some(self.fetch_owned::<QpDrawResult>(
                &pda,
                &self.cfg.qp_program_id,
                "qp draw_result",
            )?)),
            // Only a genuinely missing account means "draw not found".
            Err(e) if is_account_not_found(&e) => Ok(None),
            // Everything else (RPC outage, rate limit, network failure) is a
            // service problem and must surface as an error, not "not found".
            Err(e) => Err(e.into()),
        }
    }
}

/// Returns true when an RPC error means "the account does not exist on
/// chain" (i.e. the draw has not happened yet). Every other error — RPC
/// outage, rate limit, network failure — is a service problem and must be
/// surfaced to the user instead of being masked as "draw not found".
fn is_account_not_found(err: &ClientError) -> bool {
    matches!(
        &err.kind,
        ClientErrorKind::RpcError(RpcError::ForUser(msg)) if msg.starts_with("AccountNotFound")
    ) || matches!(
        &err.kind,
        ClientErrorKind::RpcError(RpcError::RpcResponseError { message, .. })
            if message == "AccountNotFound" || message == "account not found"
    )
}

/// Format USDC lamports as a human-readable string.
pub fn format_usdc(lamports: u64) -> String {
    let usd = lamports as f64 / 1_000_000.0;
    if usd >= 1_000_000.0 {
        format!("${:.2}M", usd / 1_000_000.0)
    } else if usd >= 1_000.0 {
        format!("${:.1}K", usd / 1_000.0)
    } else if usd >= 1.0 {
        format!("${:.2}", usd)
    } else {
        format!("${:.4}", usd)
    }
}

pub fn format_countdown(target: i64) -> String {
    let now = chrono::Utc::now().timestamp();
    let diff = target - now;
    if diff <= 0 {
        return "⏰ Overdue".into();
    }
    let h = diff / 3600;
    let m = (diff % 3600) / 60;
    let s = diff % 60;
    if h > 24 {
        format!("{}d {}h {}m", h / 24, h % 24, m)
    } else if h > 0 {
        format!("{}h {}m {}s", h, m, s)
    } else if m > 0 {
        format!("{}m {}s", m, s)
    } else {
        format!("{}s", s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client_error(kind: ClientErrorKind) -> ClientError {
        ClientError { request: None, kind }
    }

    #[test]
    fn missing_account_is_not_found() {
        let err = client_error(ClientErrorKind::RpcError(RpcError::ForUser(
            "AccountNotFound: pubkey=abc".into(),
        )));
        assert!(is_account_not_found(&err));
    }

    #[test]
    fn rpc_outage_is_not_not_found() {
        let outage =
            client_error(ClientErrorKind::RpcError(RpcError::ForUser("node is unhealthy".into())));
        assert!(!is_account_not_found(&outage));
        let custom = client_error(ClientErrorKind::Custom("timeout".into()));
        assert!(!is_account_not_found(&custom));
    }
}
