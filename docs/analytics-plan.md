# PostHog Analytics Plan

Status: approved, not yet implemented.

## Goal

Answer two questions:

1. **What's broken?** — catch errors before clients tell me (or worse, don't).
2. **What gets used?** — invest engineering time in features clients actually touch; deprecate the rest.

**Out of scope:** conversion funnels, acquisition attribution, retention cohorts, A/B tests. ost-builder is a personal/client tool, not a growth product.

## Setup

- **PostHog Cloud (US), free tier.** 1M events/mo is ~100× headroom at this scale. Self-hosting not worth the ops cost.
- **`posthog-js`** in `packages/app`. Autocapture **off** — too noisy and risks capturing card text. Manual events only.
- **`posthog-node`** in `netlify/functions/`. Server-side capture for auth, share, and comment events. More reliable than client-side; harder to spoof or block.
- **`posthog-node`** in `packages/cli` for CLI command events.
- **Identify** users by Supabase user ID after sign-in; anonymous distinctId before. Set `$email` and `$name` from Supabase profile so I can debug "Sarah's tree won't load."

## Privacy (non-negotiable)

Clients trust me with their product thinking. Defaults must protect that.

- **No session replay.** Recording card text = recording strategy. Hard no.
- **No URL capture.** Tree IDs in paths (`/tree/<id>`) leak content links.
- **No card/comment content as event properties** — IDs, counts, roles, and lengths only (e.g. `comment_length: 120`, never the text).
- **Upfront consent modal** on first sign-in. Plain-language explanation, [Allow] / [Decline]. Decline persists. Toggle lives in account settings.
- **Server-side events also gated** on the user's consent flag — server reads the setting before capturing.
- **CLI opt-out:** `--no-analytics` flag and `OST_NO_ANALYTICS=1` env var.

## Events

### Error signal (highest priority)

| Event | Where | Properties |
|---|---|---|
| `error.client` | global error boundary + `window.onerror` | `message`, `stack` (sanitized), `route_kind` (no IDs) |
| `error.api` | each Netlify function on 4xx/5xx | `endpoint`, `status`, `error_code`, `user_role` |
| `perf.canvas_slow` | canvas pan handler if frame >50ms sustained 3s | `node_count`, `card_count` |

Canvas re-render perf is flagged as fragile in CLAUDE.md — this catches regressions in the wild.

### Feature signal (roadmap input)

| Event | Trigger | Notes |
|---|---|---|
| `tree.created` | new tree | server-side; count by user |
| `tree.opened` | tree view loaded | `node_count`, `role` (owner/editor/viewer) |
| `card.created` / `card.updated` / `card.deleted` | mutation | `card_type` only |
| `comment.created` | new comment | server-side; `is_first_in_thread`, `comment_length` |
| `share.invite_sent` | invite-by-email submit | `role_invited` |
| `share.invite_accepted` | first `resolveRole` match after invite | confirms invite flow works end-to-end |
| `share.link_copied` | copy general-access link | |
| `cli.command` | CLI invocation | `command` (list/upload/download), `success` |
| `cli.auth_token_used` | PAT used in a CLI command | confirms PATs are still in use, not rotting |
| `editor.opened` | lazy chunk loads | confirms lazy-load is paying off |

### Explicitly NOT tracking

- Keystrokes, drags, every click (autocapture off)
- Page views by URL (sensitive IDs)
- Time-on-page (low signal here)

## Dashboards

Three, no more.

1. **Health** — last 7 days of `error.*` and `perf.canvas_slow`, grouped by endpoint/route. Glance daily.
2. **Feature use** — per-event count over 30 days, with users-using-feature %. Review monthly when planning.
3. **Per-user activity** — table of users × last-active × tree count × error count. Triage when someone reports a problem.

## Implementation order

Each step below is a separate PR (per the PR/push rule in `CLAUDE.md` — these touch functions and user-facing flows).

1. PostHog project + API keys in env (`VITE_POSTHOG_KEY`, `POSTHOG_KEY` for server).
2. `packages/app/src/lib/analytics.ts` — typed `track(event, props)` wrapper. No-op if key absent (keeps tests + local clean). Consent-gated.
3. Auth flow: identify on Supabase login, reset on logout.
4. Upfront consent modal + account-settings toggle. Persist consent per user.
5. Error boundary + `window.onerror` → `error.client`; per-function 4xx/5xx → `error.api`.
6. Feature events at the ~10 sites in the table above.
7. CLI events (`posthog-node` + opt-out flags).
8. Build the 3 dashboards in PostHog UI.

## Open questions

None for the plan itself. Implementation-time questions (e.g. exact wording of consent modal copy) get decided in the relevant PR.
