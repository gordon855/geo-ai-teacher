# Manual publication checklist and commands

For the complete Windows workflow (including browser-based private repository
creation without gh), use [NEXT-STEPS.zh-CN.md](NEXT-STEPS.zh-CN.md).
Git is available in the acceptance environment; GitHub CLI was not detected.
The optional gh commands below require separately installing/authenticating gh.

No Git metadata was present in the supplied directory. There is no local history
to inspect or preserve here. The maintainer confirmed no original history exists;
this is not a historical scan pass. If another clone is later found,
audit every reachable commit and tag (including deleted files) before importing
it. Never force-push or rewrite remote history without explicit owner approval.

Project-owned work is licensed under Apache-2.0 following the owner declaration.
Public upload is not authorized by that license decision. Review the scope in
RIGHTS-CONFIRMATION.md and remaining checks in OPEN-SOURCE-AUDIT.md. Inspect
docs/RELEASE-FILES.json, SECURITY-SCAN.json and all pending changes. The private
originals, .env, caches, logs, databases and backups must remain excluded.
The following commands are instructions only; they were not executed.

```powershell
git init -b main
# Set repository-local name/email to the maintainer's verified choices before commit.
git add .
git status --short
git diff --cached --stat
git diff --cached --check
git ls-files .env .private-originals .audit .playwright-cli output .data
# The command above must list nothing. Review staged content before committing.
git ls-files backups
# At most an intentional empty .gitkeep placeholder, never backup data.
git commit -m "chore: prepare GeoAI Teacher 21.7 open source edition"
# Create PRIVATE first. Only run if the intended repo does not already exist.
gh repo create gordon855/geo-ai-teacher --private --source=. --remote=origin
git push -u origin main
```

For an existing repository, inspect its history and remote first; do not replace
it with a new root commit or force-push. Once the owner explicitly approves
publication, change visibility through GitHub and create a release using
docs/RELEASE-NOTES-21.7.md. Preserve LICENSE, NOTICE and third-party notices;
keep book illustrations and other excluded private material out of the release.
The suggested first preview tag is v21.7.0-oss.1 with Pre-release selected;
the application package version stays 21.7.0. Tag the commit actually verified
by CI. Inspect Actions logs/artifacts as well as source before making public.
