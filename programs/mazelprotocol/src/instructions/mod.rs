//! SolanaLotto Protocol - Instructions Module
//!
//! This module aggregates all instruction handlers for the lottery protocol.

// Admin instructions
pub mod admin;

// Initialize lottery
pub mod initialize;

// Ticket purchase
pub mod buy_ticket;

// Randomness commit (Switchboard integration)
pub mod commit_randomness;

// Draw execution (reveal and generate winning numbers)
pub mod execute_draw;

// Draw finalization (set winner counts and prizes)
pub mod finalize_draw;

// Prize claiming
pub mod claim_prize;

// Syndicate management
pub mod syndicate;

// Re-export account structs and params
pub use admin::{
    Pause, TransferAuthority, Unpause, UpdateConfig, UpdateConfigParams, WithdrawHouseFees,
};
pub use buy_ticket::{BuyTicket, BuyTicketParams};
pub use claim_prize::ClaimPrize;
pub use commit_randomness::CommitRandomness;
pub use execute_draw::ExecuteDraw;
pub use finalize_draw::{FinalizeDraw, FinalizeDrawParams};
pub use initialize::{Initialize, InitializeParams};
pub use syndicate::{
    CloseSyndicate, CreateSyndicate, CreateSyndicateParams, JoinSyndicate, JoinSyndicateParams,
    LeaveSyndicate,
};
