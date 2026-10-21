# Owner issue automation

**Issue agent** runs once when a human `jmdarling` opens an issue, after the
repository variable `ISSUE_AGENT_ENABLED` is set to `true`. An outside author's
issue is skipped automatically. Labels, comments, bot posts, quoted prompts, and
issue edits grant no authority. Authorization reads the issue and collaborator
permissions from GitHub, and compares the event sender's login, ID, and account
type. An open issue is required. Workflow-dispatch runs must select `main`.

## Setup and billing

- Add repository secret **OPENAI_API_KEY** with a dedicated OpenAI project API key.
  API usage is billed separately from ChatGPT subscriptions. Configure project
  spend controls and monitor usage in your OpenAI account. Never request keys in
  issues or commit them.
- Set **ISSUE_AGENT_ENABLED=true** after reviewing the workflow. Without it the
  workflow is disabled intentionally. Subsequent owner issues start without triage.
- Optional variable **ISSUE_AGENT_MODEL**, default `gpt-5.3-codex`; choose a model
  available to your API project. The Codex CLI is pinned to 0.138.0 and the action
  is pinned to an immutable commit. Update both deliberately after reviewing changes.
- Optional **ISSUE_AGENT_TIMEOUT_MINUTES**, default `30`. Use a positive integer
  within GitHub's runner limit, preferably 10–60. Time bounds the paid attempt;
  there is no retry loop or additional automatic turn. GitHub per-issue concurrency
  serializes duplicate events. Account/runner quotas bound cross-issue concurrency;
  check the concurrency limit for your GitHub plan and disable automation when
  its usage reaches your chosen budget.
- Enable Actions permission to **Allow GitHub Actions to create and approve pull
  requests** in repository Settings → Actions → General. The workflow never approves
  or merges. Its proposal job uses repository-token contents/issues/PR write access;
  the agent job has only contents read. No release/package/settings credentials
  are passed to the agent.

## Operate

For an existing owner or outside issue, choose **Actions → Issue agent → Run workflow**,
select `main`, and enter the issue number. GitHub must report admin, maintain, or
write permission for the human sender. No label/comment command is accepted.

The agent installs the repository-pinned pnpm/Node 24 dependencies and Chromium,
reads AGENTS.md plus JSON issue data, and returns either a scoped patch and validation
report or a blocker. A fresh runner applies the patch without running proposed code,
creates `codex/issue-N`, and opens a PR linked with `Closes #N`. Only human merge
closes the issue. Material ambiguity becomes a concise issue comment. Failed jobs
post diagnostics and do not claim success. Missing API credentials fail visibly.

The fixed issue branch and existing-PR lookup prevent duplicates, including after a
PR closes. An interrupted orphan branch can be reused only if its tree matches the
same proposed patch; otherwise inspect it manually. For a failed attempt before a PR
exists, correct the blocker/issue and dispatch again. For an existing PR, follow up
there instead of generating a duplicate. Cancel through the Actions run menu; set
`ISSUE_AGENT_ENABLED=false` (or disable the workflow) to stop future attempts.
Cancellation may prevent failure reporting: inspect the cancelled run directly.
Rotate a key by replacing the secret and revoking the old key in OpenAI; cancel
active runs first. No credential values appear in verification evidence.

## Required PR CI

The normal Verify workflow runs on agent PRs. With a repository token, current
GitHub behavior places generated opened/synchronize/reopened PR workflow runs in an
**approval-required state**. A maintainer must click **Approve workflows to run**
in the PR, then confirm all three required checks actually ran. This is a human
review checkpoint, not an agent-job test substitute. If your GitHub deployment
suppresses those events entirely, do not merge: use an appropriately scoped GitHub
App token in a separately reviewed proposal-job design, or a maintainer branch
push to trigger the PR checks. Do not give that credential to the agent.

Require main branch protection and CODEOWNERS review as described in
[release operations](releases.md). The agent cannot access the separate proposal
job's token, merge PRs, publish images/releases, or change repository settings.
Workflow/instruction changes still need human review. Source checks execute with
read-only contents access and no AI/release secrets, including on fork PRs.

## End-to-end acceptance exercise

Use clearly labeled dedicated test issues/PRs; record numbers, commit/run URLs,
check results, and cleanup in [the ledger](v1.0.0-evidence.md). Do not substitute
policy unit tests for this exercise:

1. Owner opens a small, concrete documentation issue: exactly one attempt and linked
   PR; approve generated workflow runs and confirm required checks pass.
2. A separate outside account opens an issue: skipped, no paid attempt or PR.
3. Maintainer dispatches that outside issue: one scoped PR and functioning CI.
4. Rerun/redispatch the same issue: existing PR reported, no duplicate or paid attempt.
5. Use an explicitly ambiguous test issue or temporarily remove the dedicated API
   secret: blocker/failure visible, no false-success PR, issue remains open. Restore
   configuration. Never put a real key in the issue.

Official references:
[Codex action](https://github.com/openai/codex-action),
[action security](https://github.com/openai/codex-action/blob/main/docs/security.md),
[GitHub token events](https://docs.github.com/en/actions/concepts/security/github_token).
