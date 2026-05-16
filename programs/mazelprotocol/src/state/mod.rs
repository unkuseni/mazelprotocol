//! MazelProtocol - State Structures
//!
//! This module defines all account structures (state) for the lottery protocol,
//! organized into logical submodules for maintainability.

// Submodule declarations
pub mod draw_result;
pub mod enums_types;
pub mod lottery_state;
pub mod quickpick;
pub mod syndicate;
pub mod syndicate_wars;
pub mod tickets;

// Re-export everything for backward compatibility
pub use draw_result::*;
pub use enums_types::*;
pub use lottery_state::*;
pub use quickpick::*;
pub use syndicate::*;
pub use syndicate_wars::*;
pub use tickets::*;
