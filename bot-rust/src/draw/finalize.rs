//! Phase 4: Finalize draw.

use crate::config::BotConfig;
use crate::error::Result;
use crate::indexer::{MainWinnerCounts, QpWinnerCounts};
use anchor_lang::AnchorSerialize;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_signature::Signature;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub struct FinalizeResult {
    pub signature: Signature,
}

#[derive(AnchorSerialize)]
pub struct WcMain {
    pub match6: u32,
    pub match5: u32,
    pub match4: u32,
    pub match3: u32,
    pub match2: u32,
}
#[derive(AnchorSerialize)]
pub struct WcQp {
    pub match5: u32,
    pub match4: u32,
    pub match3: u32,
}

pub async fn finalize_main_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    wc: &MainWinnerCounts,
    hash: &[u8; 32],
    nonce: u64,
) -> Result<FinalizeResult> {
    let (lottery_state, _) = config.main_lottery_state_pda();
    let (draw_result, _) = config.main_draw_result_pda(draw_id);

    let mut data = discriminator("finalize_draw").to_vec();
    WcMain {
        match6: wc.match6,
        match5: wc.match5,
        match4: wc.match4,
        match3: wc.match3,
        match2: wc.match2,
    }
    .serialize(&mut data)
    .map_err(|e| crate::error::BotError::Draw(e.to_string()))?;
    data.extend_from_slice(hash);
    data.extend_from_slice(&nonce.to_le_bytes());

    let mut account_metas = vec![
        meta(config.authority.pubkey(), true, true),
        meta(lottery_state, false, true),
        meta(draw_result, false, true),
    ];

    // The on-chain FinalizeDraw context declares a positional optional tail:
    // lp_pool, lp_pool_usdc, prize_pool_usdc, insurance_pool_usdc, token_program.
    // They must be supplied all-or-none. Provide them whenever the LP pool
    // exists so jackpot re-seeding and insurance-backed shortfalls work.
    let (lp_pool, _) = config.main_lp_pool_pda();
    if rpc.get_account(&lp_pool).is_ok() {
        let (lp_pool_usdc, _) = config.main_lp_pool_usdc_pda();
        let (prize_pool_usdc, _) = config.main_prize_pool_usdc_pda();
        let (insurance_pool_usdc, _) = config.main_insurance_pool_usdc_pda();
        account_metas.extend([
            meta(lp_pool, false, true),
            meta(lp_pool_usdc, false, true),
            meta(prize_pool_usdc, false, true),
            meta(insurance_pool_usdc, false, true),
            meta(crate::config::SPL_TOKEN_PROGRAM_ID, false, false),
        ]);
    } else {
        tracing::warn!(
            draw_id,
            "LP pool account not found; finalizing without LP/insurance accounts \
             (a draw requiring insurance funds will fail on-chain and need manual recovery)"
        );
    }

    let ix = Instruction { program_id: config.main_program_id, accounts: account_metas, data };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref()],
        bh,
    );
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(FinalizeResult { signature: sig })
}

pub async fn finalize_qp_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    wc: &QpWinnerCounts,
    hash: &[u8; 32],
    nonce: u64,
) -> Result<FinalizeResult> {
    let (qp_state, _) = config.qp_state_pda();
    let (lottery_state, _) = config.main_lottery_state_pda();
    let (draw_result, _) = config.qp_draw_result_pda(draw_id);

    let mut data = discriminator("finalize_draw").to_vec();
    WcQp { match5: wc.match5, match4: wc.match4, match3: wc.match3 }
        .serialize(&mut data)
        .map_err(|e| crate::error::BotError::Draw(e.to_string()))?;
    data.extend_from_slice(hash);
    data.extend_from_slice(&nonce.to_le_bytes());

    let ix = Instruction {
        program_id: config.qp_program_id,
        accounts: vec![
            meta(config.authority.pubkey(), true, true),
            meta(lottery_state, false, false),
            meta(qp_state, false, true),
            meta(draw_result, false, true),
        ],
        data,
    };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref()],
        bh,
    );
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(FinalizeResult { signature: sig })
}

fn discriminator(name: &str) -> [u8; 8] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"global:");
    h.update(name.as_bytes());
    let mut d = [0u8; 8];
    d.copy_from_slice(&h.finalize()[..8]);
    d
}

fn meta(pubkey: Pubkey, is_signer: bool, is_writable: bool) -> solana_instruction::AccountMeta {
    solana_instruction::AccountMeta { pubkey, is_signer, is_writable }
}
