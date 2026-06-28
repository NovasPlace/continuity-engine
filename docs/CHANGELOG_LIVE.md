# CHANGELOG_LIVE.md

## Development Log

### 2026-06-28 - Security review note
- Local Defender alert was a false positive on the PowerShell archive-download workflow, not a confirmed threat in the repo.
- The scanned report content was mostly system/context text and conversation fragments, which explains why it looked scary without proving malicious code.
- Repo source scan did not show a malware signature or an obvious payload in first-party files.
- Desktop ZIPs inspected as workspace exports, not executables: `cross-session-memory.zip` is a normal repo export and `cross-session-memory (2).zip` is a fuller workspace snapshot.
- `.codex-remote-attachments/` only contains JPEG screenshots used in the review thread.
