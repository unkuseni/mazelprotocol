use anchor_lang::prelude::*;

// Core game parameters
#[constant]
pub const TICKET_PRICE: u64 = 2_500_000; // 2.5 USDC (6 decimals)
#[constant]
pub const JACKPOT_CAP: u64 = 2_000_000_000_000; // $2,000,000 (hard cap)
#[constant]
pub const SOFT_CAP: u64 = 1_500_000_000_000; // $1,500,000 (soft cap)
#[constant]
pub const SEED_AMOUNT: u64 = 500_000_000_000; // $500,000

// Number selection parameters
#[constant]
pub const MIN_NUMBER: u8 = 1;
#[constant]
pub const MAX_NUMBER: u8 = 46;
#[constant]
pub const NUMBERS_COUNT: usize = 6;

// Draw timing
#[constant]
pub const DRAW_INTERVAL_SECONDS: i64 = 86_400; // 24 hours

// Dynamic fee tiers (basis points)
#[constant]
pub const FEE_TIER_1_BPS: u16 = 2800; // 28% for jackpot < $500k
#[constant]
pub const FEE_TIER_2_BPS: u16 = 3200; // 32% for $500k - $1M
#[constant]
pub const FEE_TIER_3_BPS: u16 = 3600; // 36% for $1M - $1.5M
#[constant]
pub const FEE_TIER_4_BPS: u16 = 4000; // 40% for jackpot > $1.5M
#[constant]
pub const ROLLDOWN_FEE_BPS: u16 = 2800; // 28% during rolldown

// Fee tier thresholds (in USDC lamports)
#[constant]
pub const FEE_THRESHOLD_1: u64 = 500_000_000_000; // $500,000
#[constant]
pub const FEE_THRESHOLD_2: u64 = 1_000_000_000_000; // $1,000,000
#[constant]
pub const FEE_THRESHOLD_3: u64 = 1_500_000_000_000; // $1,500,000

// Rolldown distribution percentages (basis points)
#[constant]
pub const FULL_ROLLDOWN_PERCENTAGE: u16 = 10_000; // 100% for hard cap rolldown
#[constant]
pub const MINI_ROLLDOWN_PERCENTAGE: u16 = 3_000; // 30% for soft cap mini-rolldown
