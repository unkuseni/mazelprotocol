//! Command handlers for the customer bot.

use crate::config::BotConfig;
use crate::solana::{self, Solana};
use crate::store::Store;
use solana_pubkey::Pubkey;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

/// Maximum time to wait for an RPC call before returning an error.
/// Prevents a single slow RPC from hanging the entire bot.
const RPC_TIMEOUT: Duration = Duration::from_secs(10);

/// Safely truncate a wallet address for display.
///
/// SECURITY (review C3): the previous code used byte slicing
/// (`&address[..12]`), which panics when the string contains multi-byte
/// UTF-8. `/register` previously accepted arbitrary strings, so stored
/// addresses could not be assumed to be valid base58. Iterating over
/// chars is panic-free and identical to `[..12]` for valid addresses.
fn short_wallet(address: &str) -> String {
    format!("{}…", address.chars().take(12).collect::<String>())
}

/// Validate that a string is a well-formed Solana address (base58, 32 bytes).
/// SECURITY (review C3): rejects non-address input that previously caused
/// panics downstream and allowed any user to claim any address.
fn is_valid_wallet(address: &str) -> bool {
    Pubkey::from_str(address).is_ok()
}

/// Execute an async future with a timeout, returning a formatted error on timeout.
async fn with_timeout<F, T>(label: &str, future: F) -> Result<T, String>
where
    F: std::future::Future<Output = T>,
{
    tokio::time::timeout(RPC_TIMEOUT, future)
        .await
        .map_err(|_| format!("⏱️ {label} request timed out — please try again"))
}

/// Route a command to its handler and return the reply text.
pub async fn handle(
    text: &str,
    uid: u64,
    username: &str,
    chat_id: i64,
    solana: &Arc<Solana>,
    store: &Arc<Store>,
    cfg: &BotConfig,
) -> String {
    if !text.starts_with('/') {
        if chat_id > 0 {
            return format!("👋 Hi {username}! I'm the MazelProtocol bot.\n\n💳 Register and buy tickets:\n/register <address> — Link your wallet\n/help — All commands");
        }
        return String::new();
    }

    let parts: Vec<&str> = text[1..].split_whitespace().collect();
    let cmd = parts.first().map(|c| c.split('@').next().unwrap_or(c)).unwrap_or("").to_lowercase();
    let args: Vec<&str> = parts.iter().skip(1).copied().collect();

    match cmd.as_str() {
        "start" => format!("👋 Welcome to <b>MazelProtocol</b>, {username}!\n\n🎰 <b>Main Lottery</b> (6/46) — Draws every 24h\n⚡ <b>Quick Pick</b> (5/35) — Draws every 4h\n\nCommands:\n/jackpot — View jackpots\n/quickpick — Generate numbers\n/draw — Latest results\n/register — Link wallet\n/help — All commands"),
        "help" => help(),
        "jackpot" | "jp" => jackpot(solana).await,
        "draw" | "results" => draw(solana, &args).await,
        "quickpick" | "qp" => quickpick(&args),
        "prizes" | "payouts" => prizes(),
        "rules" | "howto" => rules(),
        "rolldown" | "ev" => rolldown(),
        "register" => register(store, uid, username, &args).await,
        "balance" | "bal" => balance(store, uid, solana).await,
        "stats" | "mystats" => stats(solana, store, uid).await,
        "wallet" | "fund" => wallet(cfg, store, uid).await,
        _ => format!("❓ Unknown command: /{cmd}\nType /help to see all commands."),
    }
}

fn help() -> String {
    concat!(
        "<b>🎰 MazelProtocol Commands</b>\n\n",
        "/jackpot — View current jackpots\n",
        "/draw [id] — Latest draw results\n",
        "/quickpick [count] — Generate Quick Pick numbers\n",
        "/prizes — Prize tiers & payouts\n",
        "/rules — How to play\n",
        "/rolldown — Rolldown system explained\n",
        "/register <address> — Link your wallet\n",
        "/balance — Check your balance\n",
        "/stats — Your stats\n",
        "/wallet — Deposit info\n",
        "/help — This menu"
    )
    .to_string()
}

async fn jackpot(solana: &Solana) -> String {
    with_timeout("Jackpot query", async {
        match (solana.fetch_main_state(), solana.fetch_qp_state()) {
            (Ok(m), Ok(q)) => {
                let main_status = if m.is_paused {
                    "⏸ Paused"
                } else if m.is_draw_in_progress {
                    "🔒 In progress"
                } else {
                    "🟢 Open"
                };
                let qp_status = if q.is_paused {
                    "⏸ Paused"
                } else if q.is_draw_in_progress {
                    "🔒 In progress"
                } else {
                    "🟢 Open"
                };
                format!(
                    "<b>🎰 Main Lottery (6/46)</b>\nDraw #{main_draw} • {main_status}\n💰 Jackpot: {main_jackpot}\n🎟 Tickets: {main_tickets}\n⏳ Next draw: {main_countdown}\n\n<b>⚡ Quick Pick (5/35)</b>\nDraw #{qp_draw} • {qp_status}\n💰 Jackpot: {qp_jackpot}\n🎟 Tickets: {qp_tickets}\n⏳ Next draw: {qp_countdown}\n\nUse /quickpick to get random numbers!",
                    main_draw = m.current_draw_id,
                    main_status = main_status,
                    main_jackpot = solana::format_usdc(m.jackpot_balance),
                    main_tickets = m.current_draw_tickets,
                    main_countdown = solana::format_countdown(m.next_draw_timestamp),
                    qp_draw = q.current_draw,
                    qp_status = qp_status,
                    qp_jackpot = solana::format_usdc(q.jackpot_balance),
                    qp_tickets = q.current_draw_tickets,
                    qp_countdown = solana::format_countdown(q.next_draw_timestamp),
                )
            }
            (Err(e), _) => format!("❌ Main lottery error: {e}"),
            (_, Err(e)) => format!("❌ Quick Pick error: {e}"),
        }
    }).await.unwrap_or_else(|e| e)
}

async fn draw(solana: &Solana, args: &[&str]) -> String {
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    // `/draw qp [id]` shows Quick Pick results; `/draw [id]` shows Main.
    let is_qp = args_owned.first().map(|s| s.as_str()) == Some("qp");
    let id_arg = if is_qp { args_owned.get(1) } else { args_owned.first() };

    with_timeout("Draw results", async {
        if is_qp {
            match solana.fetch_qp_state() {
                Ok(q) => {
                    let did = id_arg
                        .and_then(|a| a.parse().ok())
                        .unwrap_or(q.current_draw.saturating_sub(1));
                    match solana.fetch_qp_draw(did) {
                        Ok(Some(dr)) => {
                            let nums: Vec<String> =
                                dr.winning_numbers.iter().map(|n| n.to_string()).collect();
                            let nums_str = nums.join(", ");
                            let rd = if dr.was_rolldown { " 🎰 ROLLDOWN!" } else { "" };
                            format!(
                                "<b>⚡ Quick Pick Draw #{did}{rd}</b>\n\n🎯 Numbers: <code>{nums_str}</code>\n👥 Tickets: {tickets}\n\n🏆 Winners:\nMatch 5: {m5w} → {m5p}\nMatch 4: {m4w} → {m4p}\nMatch 3: {m3w} → {m3p}",
                                did = dr.draw_id,
                                rd = rd,
                                nums_str = nums_str,
                                tickets = dr.total_tickets,
                                m5w = dr.match5_win, m5p = solana::format_usdc(dr.m5_prize),
                                m4w = dr.match4_win, m4p = solana::format_usdc(dr.m4_prize),
                                m3w = dr.match3_win, m3p = solana::format_usdc(dr.m3_prize),
                            )
                        }
                        Ok(None) => format!("❌ Quick Pick Draw #{did} not found"),
                        Err(e) => format!("❌ Error: {e}"),
                    }
                }
                Err(e) => format!("❌ Error: {e}"),
            }
        } else {
            match solana.fetch_main_state() {
                Ok(s) => {
                    let did = id_arg
                        .and_then(|a| a.parse().ok())
                        .unwrap_or(s.current_draw_id.saturating_sub(1));
                    match solana.fetch_main_draw(did) {
                        Ok(Some(dr)) => {
                            let nums: Vec<String> =
                                dr.winning_numbers.iter().map(|n| n.to_string()).collect();
                            let nums_str = nums.join(", ");
                            let rd = if dr.was_rolldown { " 🎰 ROLLDOWN!" } else { "" };
                            format!(
                                "<b>Main Lottery Draw #{did}{rd}</b>\n\n🎯 Numbers: <code>{nums_str}</code>\n👥 Tickets: {tickets}\n\n🏆 Winners:\nMatch 6: {m6w} → {m6p}\nMatch 5: {m5w} → {m5p}\nMatch 4: {m4w} → {m4p}\nMatch 3: {m3w} → {m3p}\nMatch 2: {m2w} → {m2p}",
                                did = dr.draw_id,
                                rd = rd,
                                nums_str = nums_str,
                                tickets = dr.total_tickets,
                                m6w = dr.match6_win, m6p = solana::format_usdc(dr.m6_prize),
                                m5w = dr.match5_win, m5p = solana::format_usdc(dr.m5_prize),
                                m4w = dr.match4_win, m4p = solana::format_usdc(dr.m4_prize),
                                m3w = dr.match3_win, m3p = solana::format_usdc(dr.m3_prize),
                                m2w = dr.match2_win, m2p = solana::format_usdc(dr.m2_prize),
                            )
                        }
                        Ok(None) => format!("❌ Draw #{did} not found"),
                        Err(e) => format!("❌ Error: {e}"),
                    }
                }
                Err(e) => format!("❌ Error: {e}"),
            }
        }
    }).await.unwrap_or_else(|e| e)
}

fn quickpick(args: &[&str]) -> String {
    use rand::seq::SliceRandom;
    let count: usize = args.first().and_then(|a| a.parse().ok()).unwrap_or(1).min(10);
    let mut rng = rand::thread_rng();
    let mut result = "<b>🎲 Quick Pick Numbers (5/35)</b>\n\n".to_string();
    for i in 0..count {
        // Quick Pick Express is a 5/35 matrix — 5 unique numbers from 1..=35
        // (see programs/quickpick/src/constants.rs: QUICK_PICK_NUMBERS / QUICK_PICK_RANGE).
        let mut pool: Vec<u8> = (1..=35).collect();
        pool.shuffle(&mut rng);
        let mut nums: Vec<u8> = pool[..5].to_vec();
        nums.sort();
        let s: Vec<String> = nums.iter().map(|n| format!("{:02}", n)).collect();
        result.push_str(&format!("Ticket {}: <code>{}</code>\n", i + 1, s.join(" ")));
    }
    result.push_str("\n💡 Save these numbers and buy tickets with /register!");
    result
}

fn prizes() -> String {
    "<b>🏆 Main Lottery (6/46) Prizes</b>\n\nMatch 6: Jackpot (starts at $500K)\nMatch 5: $4,000 each\nMatch 4: $150 each\nMatch 3: $5 each\nMatch 2: Free ticket ($2.50 value)\n\n<b>⚡ Quick Pick (5/35) Prizes</b>\n\nMatch 5: Jackpot\nMatch 4: $100 each\nMatch 3: $4 each\n\n<b>Rolldown:</b> If no Match 6, jackpot rolls down to lower tiers!".to_string()
}

fn rules() -> String {
    "<b>📖 How to Play</b>\n\n1️⃣ Pick 6 numbers from 1–46 (or use /quickpick)\n2️⃣ Buy tickets before cutoff (1h before draw)\n3️⃣ Draws run every 24h for Main, every 4h for QP\n4️⃣ Match numbers to win prizes\n5️⃣ Rolldown: Unwon jackpots roll down to lower tiers\n\n🎯 The more you match, the more you win!\n🔐 Fully on-chain, provably fair via Switchboard VRF.".to_string()
}

fn rolldown() -> String {
    "<b>🎰 Rolldown System</b>\n\nWhen nobody matches all 6 numbers, the jackpot doesn't sit idle — it <b>rolls down</b> to lower prize tiers!\n\nMatch 5: +25% of jackpot\nMatch 4: +35% of jackpot\nMatch 3: +40% of jackpot\n\nThis creates predictable <b>+EV windows</b> when the jackpot is large. Check /jackpot to see current EV!\n\n📊 Rolldown is triggered automatically after each draw with no jackpot winner.".to_string()
}

async fn register(store: &Store, uid: u64, username: &str, args: &[&str]) -> String {
    let wallet = match args.first() {
        // SECURITY (review C3): require a structurally valid Solana address,
        // not just "32+ characters". Invalid input previously flowed into
        // byte-sliced formatting and panicked the bot process.
        Some(w) if is_valid_wallet(w) => *w,
        _ => return "❌ Usage: /register <SOLANA_WALLET_ADDRESS>\n\nThat doesn't look like a valid Solana address. Example: /register 7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF".to_string(),
    };
    match store.register_user(uid, username, wallet) {
        Ok(rec) => format!(
            "✅ Registered!\n\nWallet: <code>{}</code>\nUser: {}\n\nUse /balance to check funds.",
            rec.wallet_address, rec.username
        ),
        Err(e) => format!("❌ Error: {e}"),
    }
}

async fn balance(store: &Store, uid: u64, solana: &Solana) -> String {
    match store.get_user(uid) {
        Some(u) => {
            match solana.fetch_main_state() {
                Ok(s) => format!(
                    "<b>💰 Your Account</b>\n\nWallet: <code>{}</code>\nCurrent Draw: #{}\nTickets this draw: {}\n\nUse /quickpick to get numbers,\nthen buy tickets on the dApp!",
                    short_wallet(&u.wallet_address), s.current_draw_id, s.current_draw_tickets
                ),
                Err(e) => format!("❌ Error fetching state: {e}"),
            }
        }
        None => "❌ Not registered. Use /register <SOLANA_WALLET_ADDRESS> first.".to_string(),
    }
}

async fn stats(solana: &Solana, store: &Store, uid: u64) -> String {
    let user = store.get_user(uid);
    match solana.fetch_main_state() {
        Ok(s) => {
            let did = s.current_draw_id;
            let reg = user
                .map(|u| {
                    format!(
                        "\nWallet: <code>{}</code>\nRegistered: {}",
                        short_wallet(&u.wallet_address),
                        &u.registered_at[..10]
                    )
                })
                .unwrap_or_default();
            format!(
                "<b>📊 Lottery Info</b>\n\nCurrent Draw: #{did}\nTickets Sold: {}\nStatus: {}{reg}\n\nUse /draw to see latest results!",
                s.current_draw_tickets,
                if s.is_paused { "Paused" } else if s.is_draw_in_progress { "In Progress" } else { "Open" },
            )
        }
        Err(e) => format!("❌ Error: {e}"),
    }
}

async fn wallet(cfg: &BotConfig, store: &Store, uid: u64) -> String {
    let user = store.get_user(uid);
    let addr = user.map(|u| u.wallet_address).unwrap_or_else(|| "Not registered".to_string());
    format!(
        "<b>💳 Wallet</b>\n\nYour wallet: <code>{addr}</code>\n\nTo deposit, send USDC (mint <code>{mint}</code>) to your wallet address above.\nThe bot will track your balance.\n\nUse /register to link a different wallet.",
        mint = short_wallet(&cfg.usdc_mint.to_string()),
    )
}
