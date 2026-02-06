//! SolanaLotto Protocol - Instructions Module
//!
//! This module aggregates all instruction handlers for the lottery protocol.

// Admin instructions
pub mod admin;

// Initialize lottery
pub mod initialize;

// Ticket purchase
pub mod buy_ticket;

// Bulk ticket purchase
pub mod buy_bulk;

// Bulk prize claiming
pub mod claim_bulk_prize;

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

// Syndicate Wars competition
pub mod syndicate_wars;

// Re-export account structs and params from admin
pub use admin::{
    AcceptAuthority, CancelAuthorityTransfer, CancelDraw, CheckSolvency, EmergencyFundTransfer,
    ForceFinalizeDraw, FundSource, Pause, ProposeAuthority, TransferAuthority, Unpause,
    UpdateConfig, UpdateConfigParams, WithdrawHouseFees,
};

// Re-export account structs and params from initialize
pub use initialize::{AddReserveFunds, FundSeed, Initialize, InitializeParams};

// Re-export account structs and params from ticket operations
pub use buy_bulk::{BuyBulk, BuyBulkParams};
pub use buy_ticket::{BuyTicket, BuyTicketParams};
pub use claim_bulk_prize::{ClaimAllBulkPrizes, ClaimBulkPrize, ClaimBulkPrizeParams};
pub use claim_prize::ClaimPrize;

// Re-export account structs from randomness and draw operations
pub use commit_randomness::CommitRandomness;
pub use execute_draw::ExecuteDraw;
pub use finalize_draw::{FinalizeDraw, FinalizeDrawParams};

// Re-export account structs and params from syndicate operations
pub use syndicate::{
    BuySyndicateTickets, BuySyndicateTicketsParams, ClaimSyndicateMemberPrize,
    ClaimSyndicateMemberPrizeParams, CloseSyndicate, CreateSyndicate, CreateSyndicateParams,
    CreateSyndicateTicket, DistributeSyndicatePrize, DistributeSyndicatePrizeParams, JoinSyndicate,
    JoinSyndicateParams, LeaveSyndicate, RemoveSyndicateMember, RemoveSyndicateMemberParams,
    TransferSyndicateCreator, TransferSyndicateCreatorParams, UpdateSyndicateConfig,
    UpdateSyndicateConfigParams, WithdrawCreatorContribution,
};

// Re-export account structs and params from syndicate wars operations
pub use syndicate_wars::{
    ClaimSyndicateWarsPrize, ClaimSyndicateWarsPrizeParams, DistributeSyndicateWarsPrizes,
    DistributeSyndicateWarsPrizesParams, FinalizeSyndicateWars, InitializeSyndicateWars,
    InitializeSyndicateWarsParams, RegisterForSyndicateWars, UpdateSyndicateWarsStats,
    UpdateSyndicateWarsStatsParams,
};
