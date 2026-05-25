-- Seed data for development / demo
-- Run after schema.sql:
--   npx wrangler d1 execute mazel-chat --file=./db/seed.sql

INSERT OR IGNORE INTO messages (id, syndicate_id, sender, sender_short, text, type, role, is_pinned, created_at)
VALUES
  ('seed_sys_1', 'alpha-lottery-dao', 'system', 'System', 'Welcome to the syndicate chat! Coordinate strategy and discuss plays here.', 'system', NULL, 0, 1716500000000),
  ('seed_msg_1', 'alpha-lottery-dao', '7xKXabc123456789def9fGh', '7xKX...9fGh', 'Hey team! Rolldown window is getting close — the prize pool is growing with no jackpot hit in 8 draws.', 'message', 'manager', 1, 1716501800000),
  ('seed_msg_2', 'alpha-lottery-dao', '3mNPabc123456789def2wVd', '3mNP...2wVd', 'Nice catch. We should increase our ticket allocation for the next draw.', 'message', 'member', 0, 1716502400000),
  ('seed_msg_3', 'alpha-lottery-dao', '9bQRabc123456789def5tLe', '9bQR...5tLe', 'Agreed. I can contribute an extra 5 USDC this round.', 'message', 'member', 0, 1716503600000),

  ('seed_qp_sys_1', 'diamond-hands-club', 'system', 'System', 'Welcome to Diamond Hands Club! 💎', 'system', NULL, 0, 1716500000000),
  ('seed_qp_msg_1', 'diamond-hands-club', '4jWSabc123456789def8kMn', '4jWS...8kMn', 'HODLing strong! When is the next rolldown expected?', 'message', 'manager', 0, 1716501800000),
  ('seed_qp_msg_2', 'diamond-hands-club', '6cYTabc123456789def1pAo', '6cYT...1pAo', 'Should hit soft cap in the next couple draws based on current ticket volume.', 'message', 'member', 0, 1716503000000);
