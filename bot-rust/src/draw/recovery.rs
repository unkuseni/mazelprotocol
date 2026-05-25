//! Stuck draw recovery.

use super::DrawResult;
use crate::config::BotConfig;
use crate::draw::{LotteryStateData, QpStateData};
use crate::error::Result;
use crate::store::{DrawPhase, Store};
use solana_client::rpc_client::RpcClient;

pub async fn handle_stuck_main_draw(
    _rpc: &RpcClient,
    _config: &BotConfig,
    lottery_state: &LotteryStateData,
    _store: &Store,
) -> Result<DrawResult> {
    let draw_id = lottery_state.current_draw_id;
    tracing::warn!(draw_id, "[main] Draw stuck in progress — manual intervention may be required");
    Ok(DrawResult { phase: DrawPhase::Error, draw_id, winning_numbers: None })
}

pub async fn handle_stuck_qp_draw(
    _rpc: &RpcClient,
    _config: &BotConfig,
    qp_state: &QpStateData,
    _store: &Store,
) -> Result<DrawResult> {
    let draw_id = qp_state.current_draw;
    tracing::warn!(draw_id, "[quickpick] Draw stuck in progress");
    Ok(DrawResult { phase: DrawPhase::Error, draw_id, winning_numbers: None })
}
