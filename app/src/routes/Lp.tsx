/**
 * LP Pool — deposit USDC to seed the jackpot, earn a share of house fees.
 * Surface: deposit_lp, withdraw_lp, claim_lp_rewards.
 */

import { Coins, DollarSign, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLotteryQueryClient } from "@/lib/anchor/hooks";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	claimLpRewards,
	depositLp,
	withdrawLp,
} from "@/lib/anchor/transactions-lp-syndicate";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

const USDC_DECIMALS = 1_000_000;

export default function LpPool() {
	const { invalidateAll } = useLotteryQueryClient();
	const { open: openWallet } = useAppKit();
	const account = useAppKitAccount();
	const { connectedProvider } = useAnchorProvider();
	const [loading] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [depositAmount, setDepositAmount] = useState("");
	const [withdrawShares, setWithdrawShares] = useState("");

	const handleAction = useCallback(
		async (action: "deposit" | "withdraw" | "claim") => {
			setError(null);
			setSuccess(null);
			setActionLoading(true);
			try {
				const provider = connectedProvider;
				if (!provider) throw new Error("Wallet not connected");

				let sig: string;
				if (action === "deposit") {
					const amount = parseFloat(depositAmount);
					if (!amount || amount < 1)
						throw new Error("Minimum deposit is 1 USDC");
					sig = await depositLp(
						provider,
						Math.floor(amount * USDC_DECIMALS),
						provider.wallet.publicKey,
					);
					setDepositAmount("");
				} else if (action === "withdraw") {
					const shares = parseInt(withdrawShares, 10);
					if (!shares || shares <= 0)
						throw new Error("Enter a valid number of shares");
					sig = await withdrawLp(provider, shares, provider.wallet.publicKey);
					setWithdrawShares("");
				} else {
					sig = await claimLpRewards(provider, provider.wallet.publicKey);
				}
				setSuccess(`Done! TX: ${sig.slice(0, 8)}…`);
				invalidateAll();
			} catch (err) {
				setError(err instanceof Error ? err.message : `${action} failed`);
			} finally {
				setActionLoading(false);
			}
		},
		[connectedProvider, depositAmount, withdrawShares, invalidateAll],
	);

	if (loading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
			{/* Header */}
			<div className="mb-8 text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<Coins size={28} className="text-cyan-400" />
					<h1 className="text-3xl font-black tracking-tight text-foreground">
						LP Pool
					</h1>
				</div>
				<p className="text-sm text-muted-foreground max-w-xl mx-auto">
					Deposit USDC to seed the jackpot and earn a proportional share of
					house fees on every ticket.
				</p>
			</div>

			{account?.address ? (
				<div className="grid sm:grid-cols-2 gap-4">
					{/* Deposit */}
					<div className="glass rounded-2xl p-5">
						<div className="flex items-center gap-2 mb-1">
							<TrendingUp size={14} className="text-emerald-400" />
							<h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
								Deposit
							</h3>
						</div>
						<p className="text-[10px] text-muted-foreground mb-3">
							Min 1 USDC — earn rewards from every ticket purchase.
						</p>
						<input
							type="number"
							value={depositAmount}
							onChange={(e) => setDepositAmount(e.target.value)}
							placeholder="Amount in USDC"
							className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 mb-3"
						/>
						<Button
							onClick={() => handleAction("deposit")}
							disabled={actionLoading || !depositAmount}
							className="w-full bg-linear-to-r from-cyan-400 to-cyan-600 text-primary-foreground font-bold rounded-xl"
						>
							{actionLoading ? "Depositing…" : "Deposit USDC"}
						</Button>
					</div>

					{/* Withdraw */}
					<div className="glass rounded-2xl p-5">
						<div className="flex items-center gap-2 mb-1">
							<Wallet size={14} className="text-magenta-400" />
							<h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
								Withdraw
							</h3>
						</div>
						<p className="text-[10px] text-muted-foreground mb-3">
							Burn LP shares to withdraw your USDC. Unclaimed rewards are
							claimed automatically.
						</p>
						<input
							type="number"
							value={withdrawShares}
							onChange={(e) => setWithdrawShares(e.target.value)}
							placeholder="Shares to burn"
							className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 mb-3"
						/>
						<Button
							onClick={() => handleAction("withdraw")}
							disabled={actionLoading || !withdrawShares}
							className="w-full bg-linear-to-r from-magenta-400 to-magenta-600 text-primary-foreground font-bold rounded-xl"
						>
							{actionLoading ? "Withdrawing…" : "Withdraw"}
						</Button>
					</div>

					{/* Claim rewards */}
					<div className="glass rounded-2xl p-5 sm:col-span-2">
						<div className="flex items-center justify-between">
							<div>
								<div className="flex items-center gap-2 mb-1">
									<DollarSign size={14} className="text-gold-400" />
									<h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
										Claim Rewards
									</h3>
								</div>
								<p className="text-[10px] text-muted-foreground">
									Withdraw your accumulated share of house fees without touching
									your LP position.
								</p>
							</div>
							<Button
								onClick={() => handleAction("claim")}
								disabled={actionLoading}
								className="bg-linear-to-r from-gold-400 to-gold-600 text-primary-foreground font-bold rounded-xl px-6"
							>
								{actionLoading ? "Claiming…" : "Claim"}
							</Button>
						</div>
					</div>
				</div>
			) : (
				<div className="text-center py-12">
					<Button
						onClick={() => openWallet()}
						className="bg-linear-to-r from-cyan-400 to-cyan-600 text-primary-foreground font-bold rounded-xl px-8 py-3"
					>
						<Wallet size={18} className="mr-2" />
						Connect Wallet
					</Button>
				</div>
			)}

			{error && (
				<div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
					{error}
				</div>
			)}
			{success && (
				<div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">
					{success}
				</div>
			)}
		</div>
	);
}
