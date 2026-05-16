/**
 * Program setup helpers for MazelProtocol Draw Lifecycle Bot.
 *
 * Creates Anchor Program instances for the main lottery and Quick Pick Express.
 * Called on every Worker invocation since Workers are stateless.
 */

import {
  Connection,
  Keypair,
  type PublicKey,
} from "@solana/web3.js";
import {
  Program,
  AnchorProvider,
  Wallet,
  setProvider,
} from "@coral-xyz/anchor";
import type { BotConfig } from "./config";

// IDL Imports — Embedded at build time by wrangler's bundler
import mainIDL from "./idl/mazelprotocol.json";
import qpIDL from "./idl/quickpick.json";

/**
 * Create Anchor programs for both the main lottery and Quick Pick Express.
 */
export function createPrograms(
  config: BotConfig,
  connection: Connection,
): {
  mainProgram: Program<any>;
  qpProgram: Program<any>;
  provider: AnchorProvider;
} {
  const wallet = new Wallet(config.authorityKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: config.commitment,
    preflightCommitment: config.commitment,
  });
  setProvider(provider);

  const mainProgram = new Program(mainIDL as any, provider);
  const qpProgram = new Program(qpIDL as any, provider);

  return { mainProgram, qpProgram, provider };
}
