# Contributing

Use GitHub issues for bugs and scoped feature requests. Provide reproduction steps,
expected/actual behavior, version/environment, and testable success criteria. Redact
secrets, private images, and configuration. Check for existing issues and PRs first.

Install Node.js 24 and `pnpm@11.25.0`, then:

```sh
pnpm install --frozen-lockfile
pnpm test:browser:install
pnpm dev
```

Use `codex/short-description` for agent branches and a descriptive branch for human
work. Keep client/server TypeScript packages separate, use strict checks, and follow
[AGENTS.md](AGENTS.md). Version specs describe deliberate releases. Explicit
generate-spec/implement-spec requests retain their workflows and sign-off requirements.

Run `pnpm check` before proposing changes. It runs lint, formatting, explicit type
checks, server route tests, Chromium Lit tests, builds, and distribution checks.
On Linux install Chromium system dependencies with
`pnpm --filter @shin-wallslice/client exec playwright install --with-deps chromium`.
Use Fastify injection for server route tests. Add meaningful tests for changed
behavior. Container changes also need `pnpm docker:smoke IMAGE` and
`node scripts/container-persistence.mjs IMAGE`; record architecture and emulation.

Link the issue in your PR, explain resulting behavior, list checks and observed
results, and state any verification limits. Update affected documentation. Stop
for material ambiguity instead of inventing requirements. Never commit credentials
or include them in logs, issues, fixtures, or PR descriptions. Human review and
merge remain required, including agent changes to workflows and instructions.

Maintainers: see [release operations](docs/maintainers/releases.md),
and [Community Applications submission](docs/maintainers/community-applications.md).
