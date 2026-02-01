//! Quick Pick Express Instructions Module
//!
//! This module contains all instruction handlers for the Quick Pick Express mini-lottery.
//! Quick Pick Express is a high-frequency lottery running every 4 hours with a 5/35 matrix.
//!
//! Features:
//! - $50 main lottery spend gate requirement
//! - $1.50 ticket price
//! - Fixed prizes (Normal Mode): Match 4 = $100, Match 3 = $4
//! - Pari-mutuel prizes (Rolldown Mode): 60% to Match 4, 40% to Match 3
//! - Dynamic house fees: 30-38% based on jackpot level
//! - Soft cap: $30,000 (probabilistic rolldown)
//! - Hard cap: $50,000 (forced rolldown)

// Initialize Quick Pick Express
pub mod initialize;

// Buy Quick Pick ticket
pub mod buy_ticket;

// Commit randomness for Quick Pick draw
pub mod commit_randomness;

// Execute Quick Pick draw
pub mod execute_draw;

// Finalize Quick Pick draw with winner counts
pub mod finalize_draw;

// Claim Quick Pick prize
pub mod claim_prize;

// Re-export account structs and params from initialize
pub use initialize::{
    FundQuickPickSeed, InitializeQuickPick, InitializeQuickPickParams, PauseQuickPick,
};

// Re-export account structs and params from buy_ticket
pub use buy_ticket::{BuyQuickPickTicket, BuyQuickPickTicketParams};

// Re-export account structs from commit_randomness
pub use commit_randomness::CommitQuickPickRandomness;

// Re-export account structs from execute_draw
pub use execute_draw::ExecuteQuickPickDraw;

// Re-export account structs and params from finalize_draw
pub use finalize_draw::{FinalizeQuickPickDraw, FinalizeQuickPickDrawParams};

// Re-export account structs from claim_prize
pub use claim_prize::ClaimQuickPickPrize;
