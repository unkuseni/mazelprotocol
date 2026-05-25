//! Solana RPC queries — read-only lottery state fetchers.

use crate::config::BotConfig;
use crate::error::Result;
use anchor_lang::AnchorDeserialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

pub const LOTTERY_SEED: &[u8] = b"lottery";
pub const DRAW_SEED: &[u8] = b"draw";
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
pub const QUICK_PICK_DRAW_SEED: &[u8] = b"quick_pick_draw";

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct LotteryState {
    pub authority: Pubkey,
    _p0: Pubkey,
    _p1: Pubkey,
    _p2: Pubkey,
    pub current_draw_id: u64,
    _pads: [u8; 84],
    pub current_draw_tickets: u64,
    _pad: u64,
    pub is_draw_in_progress: bool,
    _pad2: bool,
    _pad3: bool,
    pub is_paused: bool,
    _pad4: bool,
    _pad5: u8,
    _pad6: u8,
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct DrawResult {
    pub draw_id: u64,
    pub winning_numbers: [u8; 8],
    pub _proof: [u8; 32],
    pub _ts: i64,
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
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct QpState {
    pub current_draw: u64,
    _pads: [u8; 88],
    pub current_draw_tickets: u64,
    _more: [u8; 48],
    pub is_draw_in_progress: bool,
    _p2: bool,
    _p3: bool,
    pub is_paused: bool,
    _p4: bool,
    _p5: u8,
}

#[derive(AnchorDeserialize, Debug, Clone)]
pub struct QpDrawResult {
    pub draw_id: u64,
    pub winning_numbers: [u8; 8],
    _pad: [u8; 40],
    pub match5_win: u32,
    pub match4_win: u32,
    pub match3_win: u32,
    pub m5_prize: u64,
    pub m4_prize: u64,
    pub m3_prize: u64,
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

    pub fn fetch_main_state(&self) -> Result<LotteryState> {
        let (pda, _) = Pubkey::find_program_address(&[LOTTERY_SEED], &self.cfg.main_program_id);
        let acc = self.rpc.get_account(&pda)?;
        let mut data: &[u8] = &acc.data;
        Ok(LotteryState::deserialize(&mut data)?)
    }

    pub fn fetch_qp_state(&self) -> Result<QpState> {
        let (pda, _) = Pubkey::find_program_address(&[QUICK_PICK_SEED], &self.cfg.qp_program_id);
        let acc = self.rpc.get_account(&pda)?;
        let mut data: &[u8] = &acc.data;
        Ok(QpState::deserialize(&mut data)?)
    }

    pub fn fetch_main_draw(&self, draw_id: u64) -> Result<Option<DrawResult>> {
        let (pda, _) = Pubkey::find_program_address(
            &[DRAW_SEED, &draw_id.to_le_bytes()],
            &self.cfg.main_program_id,
        );
        match self.rpc.get_account(&pda) {
            Ok(acc) => {
                let mut data: &[u8] = &acc.data;
                Ok(Some(DrawResult::deserialize(&mut data)?))
            }
            Err(_) => Ok(None),
        }
    }

    pub fn fetch_qp_draw(&self, draw_id: u64) -> Result<Option<QpDrawResult>> {
        let (pda, _) = Pubkey::find_program_address(
            &[QUICK_PICK_DRAW_SEED, &draw_id.to_le_bytes()],
            &self.cfg.qp_program_id,
        );
        match self.rpc.get_account(&pda) {
            Ok(acc) => {
                let mut data: &[u8] = &acc.data;
                Ok(Some(QpDrawResult::deserialize(&mut data)?))
            }
            Err(_) => Ok(None),
        }
    }
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
