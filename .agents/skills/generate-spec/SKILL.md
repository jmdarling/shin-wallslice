---
name: generate-spec
description: Collaboratively write a new version spec for shin-wallslice through developer questions and answers. Use when asked to generate, draft, or refine a version spec; this workflow does not implement it.
---

# Generate a version spec

Create a lightweight Markdown spec containing one or more features and observable acceptance criteria. Build the spec with the developer through questions and answers.

## Context and version

- Read the applicable `AGENTS.md`, inspect the current project, and list existing specs in `specs/`. Read relevant previous specs for context; check code or verification evidence before treating an earlier spec as implemented.
- Use `specs/v<major>.<minor>.<patch>.md`, such as `specs/v0.1.0.md`. Honor a developer-supplied semantic version. Otherwise propose a suitable unused version during Q&A and confirm it as part of that conversation. Compare versions numerically, not lexicographically.
- Treat older filenames, including `specs/0.0.1-initial-scaffold.md`, as historical context. Do not rename or rewrite them as part of creating a new spec. Never overwrite an existing version spec silently; clarify whether the developer intends to revise it or create another version.

## Collaborative Q&A

- Begin with what is already known and ask focused questions about the missing decisions: desired features, user behavior, boundaries, and what would demonstrate success. Do not ask again about answers already available in the conversation or project.
- Ask only as many questions per round as are useful. Follow up when an answer reveals a material gap, and offer concrete choices when helpful. Keep the interaction conversational instead of presenting a fixed exhaustive questionnaire.
- Refer to `ui.excalidraw` when a feature depends on the mockups, treating them as guidelines under the project instructions.
- Resolve material uncertainties and conflicts with project instructions through Q&A. Choose routine implementation details later during implementation; do not inflate the spec with a file-level plan.
- Summarize the emerging features and acceptance criteria so the developer can correct misunderstandings. Do not invent requirements to fill unanswered questions.

## Write the spec

Use this structure, repeating the feature section as needed:

```markdown
# v0.1.0 — Short version title

Status: ready

One or two sentences describing this version's purpose.

## Feature: Short feature name

Describe the intended user behavior and any essential constraints.

### Acceptance criteria

- [ ] An observable outcome that can be verified.
- [ ] Another outcome, including relevant failure behavior.
```

- Define the changes introduced by this version. Include explicit exclusions or technical constraints only when needed to prevent a material misunderstanding.
- Make each criterion specific enough to verify, with all checkboxes initially unchecked. Avoid prescribing internal implementation unless required by the developer or project constraints.
- Use `draft` while material questions remain. If the developer asks to save unfinished work, save a draft and record its open questions. Do not treat silence or elapsed time as an answer.
- Once Q&A has resolved the material decisions and the spec is implementable, save it with status `ready` automatically. No separate approval of the final draft is required. Reserve `implemented` for the implementation workflow after verification.
- Finish with the saved spec path, its status, and a brief description of its features. Do not start implementation unless the developer also requests it.
