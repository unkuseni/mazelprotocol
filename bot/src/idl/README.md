# IDL Files for Cloudflare Worker

This directory must contain the Anchor IDL JSON files before deploying the Worker.

Wrangler bundles these at build time so the Worker can create Anchor `Program` instances
without filesystem access.

## Setup

1. **Build the Anchor programs** (from the project root):

   ```sh
   anchor build
   ```

2. **Copy the generated IDLs into this directory**:

   ```sh
   cp target/idl/mazelprotocol.json bot/src/idl/
   cp target/idl/quickpick.json bot/src/idl/
   ```

3. **Deploy the Worker**:

   ```sh
   cd bot
   npm run deploy
   ```

## Required Files

| File                   | Source                              | Description                      |
| ---------------------- | ----------------------------------- | -------------------------------- |
| `mazelprotocol.json`   | `target/idl/mazelprotocol.json`     | Main Lottery (6/46) program IDL  |
| `quickpick.json`       | `target/idl/quickpick.json`         | Quick Pick Express (5/35) IDL    |

## Notes

- If the IDL files are missing, `wrangler deploy` will fail with a module-not-found error
  pointing to the import in `worker.ts`.
- These files are `.gitignore`d by default since they are build artifacts. If you prefer to
  commit them for CI/CD convenience, remove the relevant entry from `.gitignore`.
- Whenever the on-chain program IDL changes (new instructions, accounts, etc.), you must
  re-copy the updated IDLs and redeploy the Worker.