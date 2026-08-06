# Repository agent instructions

Read `README.md` and any relevant project documentation before changing the repository.

## Vercel build economy

- Treat each approved task as one cohesive change package.
- Complete and review all in-scope changes before updating the remote branch.
- Prefer one commit and one push per package so Vercel normally runs one Preview build.
- Do not push intermediate file-by-file changes, checkpoints, or progress-only commits.
- Collect CI and Preview findings first, then address them in one consolidated follow-up commit and push. A normal package should require no more than two pushes.
- Start a dependent PR branch only after its base branch is stable. Avoid repeatedly updating stacked branches after minor changes.
- Do not reduce required checks, review quality, or safety to save build minutes.
- Exceptions require an urgent safety/security reason or an explicit user request.
