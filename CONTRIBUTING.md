# Contributing to MazelProtocol

Thank you for your interest in contributing to MazelProtocol! We welcome contributions from everyone in the community. This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Security Considerations](#security-considerations)
- [Community](#community)

## 📜 Code of Conduct

We expect all contributors to adhere to our Code of Conduct. Please be respectful, considerate, and collaborative in all interactions related to this project.

## 🚀 Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) 18+ and pnpm/yarn
- [Git](https://git-scm.com/)

### Setting Up the Development Environment

1. **Fork the Repository**
   ```bash
   # Fork the repository on GitHub
   # Clone your fork locally
   git clone https://github.com/YOUR_USERNAME/mazelprotocol.git
   cd mazelprotocol
   ```

2. **Install Dependencies**
   ```bash
   # Install JavaScript/TypeScript dependencies
   pnpm install
   
   # Install Rust dependencies
   anchor build  # This will also install necessary Rust crates
   ```

3. **Set Up Local Network**
   ```bash
   # Start a local Solana validator
   solana-test-validator
   
   # In another terminal, deploy programs locally
   anchor deploy
   ```

## 📁 Project Structure

```
mazelprotocol/
├── programs/                    # Solana smart contracts
│   ├── mazelprotocol/          # Main lottery program (6/46 matrix)
│   └── quickpick/              # Quick Pick Express program (5/35 matrix)
├── app/                        # Web frontend (TanStack + React)
├── bot/                        # Draw lifecycle bot (Cloudflare Worker)
├── tests/                      # Integration tests
├── migrations/                 # Deployment scripts
├── docs/                       # Documentation
└── node_modules/               # Dependencies
```

### Key Components
- **Smart Contracts**: Rust programs built with Anchor framework
- **Frontend**: React application with TanStack Router
- **Bot**: Cloudflare Worker handling draw lifecycle
- **Tests**: TypeScript integration tests using Anchor client

## 🔄 Development Workflow

### Branch Strategy
- `main`: Stable, production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features or improvements
- `bugfix/*`: Bug fixes
- `release/*`: Release preparation

### Creating a New Feature
1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. Make your changes with clear, focused commits.

3. Ensure all tests pass:
   ```bash
   anchor test
   cd app && pnpm test
   cd bot && pnpm typecheck
   ```

4. Push your branch and create a pull request.

## 🔧 Pull Request Process

1. **Fill out the PR template** with all requested information
2. **Link related issues** using GitHub keywords (Fixes #123, Closes #456)
3. **Ensure CI passes** - all tests must pass
4. **Request review** from maintainers
5. **Address review feedback** promptly
6. **Keep PRs focused** - one feature or fix per PR

### PR Checklist
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if applicable)
- [ ] Code follows project standards
- [ ] No breaking changes (or clearly documented if intentional)
- [ ] Security considerations addressed

## 📝 Coding Standards

### Rust (Smart Contracts)
- Follow Rust Style Guide and Clippy recommendations
- Use `cargo fmt` for formatting
- Run `cargo clippy -- -D warnings` before committing
- Document public functions and structs
- Use appropriate error types from `errors.rs`
- Avoid unsafe code unless absolutely necessary

### TypeScript/JavaScript
- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Run `pnpm lint` before committing

### Solana/Anchor Specific
- Use PDAs (Program Derived Addresses) appropriately
- Follow Anchor account validation patterns
- Implement proper CPI (Cross-Program Invocation) safety
- Use constant-time operations where security-critical

## 🧪 Testing

### Smart Contract Tests
```bash
# Run all tests
anchor test

# Run specific test file
anchor test --test mazelprotocol

# Run with verbose output
anchor test --verbose
```

### Frontend Tests
```bash
cd app
pnpm test          # Run unit tests
pnpm test:coverage # Run with coverage
```

### Bot Tests
```bash
cd bot
pnpm typecheck     # TypeScript type checking
```

### Writing Tests
- Test both success and failure paths
- Include edge cases and boundary conditions
- Mock external dependencies where appropriate
- For smart contracts, test account validation and security checks

## 🔒 Security Considerations

MazelProtocol handles real financial transactions. Security is paramount.

### Critical Areas
1. **Randomness Generation**: Uses Switchboard TEEs with commit-reveal pattern
2. **Prize Distribution**: Must be mathematically correct and tamper-proof
3. **Account Validation**: Proper PDA derivations and signer checks
4. **Access Control**: Authority checks for admin functions

### Security Guidelines
- Never modify security-critical code without thorough review
- Add tests for any security-related changes
- Document security assumptions and guarantees
- Follow the principle of least privilege
- Use constant-time comparisons for sensitive operations

### Reporting Security Issues
Please report security vulnerabilities to **security@mazelprotocol.io**. Do not disclose publicly until the issue has been addressed.

## 🤝 Community

### Getting Help
- **Discord**: Join our community at https://discord.gg/mazelprotocol
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check the `docs/` directory for detailed guides

### Recognition
All contributors will be recognized in:
- Project README (for significant contributions)
- Release notes
- Community announcements

### Becoming a Maintainer
Consistent, high-quality contributions may lead to an invitation to become a maintainer. Maintainers are expected to:
- Review pull requests
- Help triage issues
- Guide new contributors
- Participate in project planning

## 📄 License

By contributing to MazelProtocol, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to making decentralized lottery fairer and more transparent! 🎰

*The MazelProtocol Team*