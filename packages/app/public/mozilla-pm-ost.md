# Mozilla Firefox PM Org — Opportunity Solution Tree

## [Outcome] Double PM productivity by November 2026

Fewer PMs reporting they feel overwhelmed. Engineering and design saying PMs are keeping up.

---

### [Opportunity] Claude Code setup intimidation

Getting started with Claude Code is intimidating for non-technical PMs and designers — not just because of the terminal, but because the whole setup feels like a developer workflow: API keys, Cursor vs CC vs terminal confusion, MCP connections.

#### [Opportunity] Terminal fear

The CLI itself feels foreign to non-developers. Named by Eduardo, Emanuela, Alejandro, Amber. Eduardo drove the CC Desktop request to Overholt specifically because of this.

##### [Solution] Claude Code Desktop rollout

In progress — Eduardo's design team is first on the list. Approval and budget ($10M) secured with engineering. Directly addresses terminal barrier.

#### [Opportunity] Tool confusion

Cursor, VS Code, Claude Code, terminal — what's approved, how do they relate, which to use? Amber: "We can use Cursor the software and plug Claude Code into it, but we can't use Cursor's own equivalent... it's hella confusing."

##### [Solution] Approved tool clarity guide

A single canonical map of approved tools, how they interact, and the setup path for each use case (prototyping vs. productivity vs. MCP). Amber's group navigated this by trial and error over multiple sessions.

#### [Opportunity] MCP setup gap

Some PMs (Ashley, Karen, Kim) have done MCP connections to Jira; many more haven't. The capability exists; the knowledge of how to do it doesn't.

##### [Solution] MCP starter pack

Pre-configured MCP connections for the tools PMs already use (Jira, Confluence, Slack) — removes the "I know this is possible but don't know how to do it" barrier.

#### [Opportunity] No prerequisite setup step in training

Meridel observed that trainings go "straight to the deep end" before people are even on the tools.

##### [Solution] Guided setup session as training prerequisite

A 1-hour "get set up" session before any skills training. Changes the entry point from "here's how to use it" to "here's how to get started."

---

### [Opportunity] Trust gap / self-built workflow problem

People have access to Claude Code but don't adopt workflows they didn't build themselves. Workflows built by someone else for their pain points don't transfer. The fluency gap is as much about trust as knowledge.

#### [Solution] Product-specific office hours

Jenny starting this — mirrors Eduardo's Monday design office hours model. Low-stakes, hands-on, people build workflows for their own pain points.

##### [Experiment] Office hours drive adoption when setup is already done

Test whether office hours move the needle for people who are set up but not adopting.

#### [Solution] AI for PM Slack channel

Async version of office hours. Jenny starting this.

#### [Solution] Peer learning groups

Amber's women's PM group is the only known grassroots peer learning community — it works because it's low-stakes and safe. Scale the peer-safety model, not the women-only part.

#### [Solution] Firefox PM OS starter repo

A starter plugin/GitHub repo (potentially forked from growth-pm-os) designed for Firefox PM work. Easy to activate, clear path to customize, everyone can contribute back to the source.

##### [Experiment] PMs will adopt a repo they didn't build if it's easy to personalize

The hypothesis to test before investing in the repo build.

#### [Solution] Hands-on product-wide session

Diana's design 2-hour session described as "AMAZING" by Amber. Summer 2024 Chambers ChatGPT training as precedent. Creates shared vocabulary and baseline. Pair with tool setup rather than starting in the deep end.

---

### [Opportunity] Manager OS / 1:1 effectiveness

People managers spend significant prep time on 1:1s and have no AI-assisted system for tracking patterns, blockers, and growth across their directs.

#### [Solution] AI-assisted 1:1 prep brief

Jenny's coaching prep brief approach: AI surfaces patterns across recent 1:1 notes, flags blockers, drafts talking points. Emanuela's immediate response: "I love this."

##### [Experiment] Mozilla policy allows AI folders referencing direct reports

Emanuela believes (but hasn't confirmed) that policy prohibits keeping AI folders named after directs. Unconfirmed — no written policy found in Confluence. Must resolve before piloting.

---

### [Opportunity] Idea-to-reality path opacity

PMs with big proposals have no clear path to get cross-team buy-in or stack ranking — large bets die in ambiguity while experiments thrive.

#### [Solution] Initiative visibility and dependency mapping

Alejandro: "The path to go from idea to reality is very unclear." At SurveyMonkey there was structured initiative ranking with declared dependencies — teams knew they were on the hook. AI could help with visibility and stakeholder tracking.

##### [Experiment] The gap is tooling, not org design

Needs validation — this may be a structural/org issue that tooling alone can't fix.

---

### [Opportunity] Workflow democratization / shared repo scaling

The best AI workflows live on individual machines or in one team's repo. No system exists for deciding what's worth scaling or actually scaling it.

#### [Solution] Central context repository

Shared prompt library, templates, and workflows for common PM tasks. Amber wants this; Meridel wants this; Alex can't support the current fork model. One authoritative source that any tool can pull from.

##### [Experiment] A central repo reduces per-PM context setup time

Test with one team before building for org-wide use.

#### [Solution] "What's worth scaling" decision owner

Adam named this gap. Monthly show-and-tell surfaces good work but nothing moves it forward. Jenny's role during the engagement could be this owner.

#### [Solution] Increase sharing cadence

Once/month "might as well not exist" (Amber). Weekly or biweekly async Slack sharing paired with monthly live sessions keeps pace with how fast tools are changing.

---

### [Opportunity] Collaboration gap in AI work

AI work is inherently solo — there's no multiplayer equivalent of Figma/FigJam for any discipline. Blocks cross-functional integration and team co-creation.

#### [Solution] Unblock the vibe-coded prototype portal

Brooke's design component library is built but blocked by SSO — sitting there undeployed. Unblocking it creates the first shared cross-functional AI artifact layer.

#### [Solution] Co-vibe jam sessions

Structured sessions where a PM/design/eng trio works together in real time. Test what teams produce together vs. individually.

---

### [Opportunity] Status update and stakeholder comms overhead

PMs without team-level TPMs spend significant time on routine status updates — work that's largely formulaic and ripe for automation. Amber: 1.5 hrs/week on status updates alone.

#### [Solution] Fork Betty's TPM tool → PM status-update communicator

Betty built a complete TPM tool (Jira pulls, weekly reports, Slack automation, staging). A version scoped to weekly/sprint status updates for PMs without TPM coverage could be high-leverage.

##### [Experiment] Betty's tool generalizes beyond TPM workflows

Betty built it for her specific workflow. Needs validation that the core pattern transfers to PM status reporting without significant rebuilding.

#### [Solution] AI-assisted stakeholder comms templates

Pre-loaded with context, style, and audience — PM reviews and sends. Especially for recurring comms with specific audiences (ads partners, leadership).

---

### [Opportunity] PM brief quality gap

PM briefs vary enormously in quality, creating downstream waste for design, content design, and engineering. Over-reliance on AI is producing verbose, low-signal briefs.

#### [Solution] AI-assisted brief template with required inputs

A structured template that prompts PMs for research, user need, success criteria, and scope — forces the thinking before drafting. AI helps write; the structure ensures it's complete.

##### [Experiment] Structured input forces better thinking before AI drafts

Hypothesis: if the template requires specific inputs, PMs can't skip to "write me a brief for X."

#### [Solution] Brief quality rubric

Meridel's team could co-develop this. Shared definition of "what a good brief looks like" means feedback is less personal and the bar is visible. Adam explicitly named brief redefinition as a priority.

---

### [Opportunity] Competitive AI culture / psychological safety gap

AI adoption is landing as a performance metric rather than a capability investment — creating anxiety and competition rather than collaborative fluency.

#### [Solution] Publish CLG AI expectations now

Whatever the standard is, PMs should see it. Amber flagged that the CLG has AI expectations nobody has seen yet. Anxiety from an invisible bar is worse than a challenging visible one.

#### [Solution] Explicit "collaborative not competitive" reframe from Adam

The tone is set at the top. If Adam frames AI adoption as team capability, not individual performance, it changes the context for everything else.

#### [Solution] Office hours and peer groups as psychological safety infrastructure

Amber's group and Eduardo's office hours work partly because they're low-stakes. Scale this model intentionally — not as AI training, but as safe experimentation space.

---

### [Opportunity] Moving from delegation to unlock

Some PMs are using AI but haven't changed how they work — they're speeding up existing workflows rather than rethinking the work itself. AI becomes a faster treadmill, not a different path.

#### [Solution] "What changed" case studies

Document before/after examples of PMs who shifted how they work, not just how fast — Alejandro's write-first-then-refine workflow, Betty's TPM tool, Stormy as staffing coverage. Make the mental model shift visible.

#### [Solution] Office hours format shift

Instead of "here's how to do X," anchor sessions around "here's a problem I'm trying to solve — how would you approach it?" Forces rethinking the work, not just using the tool faster.

---

### [Opportunity] Building / prototyping in Firefox

For PMs and designers who want to prototype or build against Firefox directly, setting up a local Firefox copy is a significant time investment. Amber set up local Firefox on Presidents' Day because there was no way to do it during a normal business day.

#### [Solution] Firefox local setup guide + office hours slot

A documented setup path and a dedicated office hours slot for getting local Firefox running. Reduces the activation energy from "a full day" to something manageable.

##### [Experiment] Local Firefox setup is blocking more than one PM

Single source (Amber). Needs validation — may be a niche constraint rather than a widespread blocker.
