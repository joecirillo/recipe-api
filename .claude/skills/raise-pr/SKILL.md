---
name: raise-pr
description: Reviews the current diff with the api-reviewer subagent, then opens a GitHub PR with the review findings included in the description. Invoke explicitly with /raise-pr.
disable-model-invocation: true
---

You are raising a pull request for the current branch's changes. Follow these steps
in order — do not skip the review step even if the diff looks small or obviously correct.

1. Run `git status` and `git diff` (against the base branch, typically `main`) to see
   the full scope of changes.
2. Run the project's lint and test commands (see CLAUDE.md) and confirm they pass. If
   either fails, stop and report the failure — do not proceed to review or PR creation.
3. Invoke the `api-reviewer` subagent against this diff.
4. If api-reviewer reports any **blocking issues**, stop. Report them back and do not
   create the PR. Fixing blocking issues is not part of this skill — that's a separate
   step; this skill only reviews and raises.
5. If there are no blocking issues (should-fix items and notes are fine to include,
   not fine to block on), draft the PR:
   - Title: concise, imperative mood, matches the resource/piece being migrated
   - Body:
     - What changed and why (reference the source recipe-service files if this is a
       migration PR)
     - A "Review notes" section listing any should-fix items or notes from
       api-reviewer, so the human reviewer sees them without re-running the review
     - Reference the originating issue if one exists (`Closes #N`)
6. Create the PR via `gh pr create` (confirm the base branch first — don't assume `main`
   without checking). Do not merge it. Do not mark it ready-for-review if it was drafted
   as a draft — leave that decision to the human reviewer.
7. Report the PR URL back.

This skill produces a PR for human review — it does not replace that review. Its job
is to make sure the PR that lands in front of the human reviewer has already had the
obvious issues caught.
