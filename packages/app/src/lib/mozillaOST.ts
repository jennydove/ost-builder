export const MOZILLA_OST_MARKDOWN = `# Mozilla Firefox PM Org — Opportunity Solution Tree

## [Outcome] Double PM productivity by November 2026

Fewer PMs reporting they feel overwhelmed. Engineering and design saying PMs are keeping up.

### [Opportunity] Claude Code setup intimidation

Getting started with Claude Code is intimidating for non-technical PMs and designers — terminal, tool confusion, MCP connections, each a separate barrier.

#### [Opportunity] Terminal fear

The CLI itself feels foreign to non-developers. Named by Eduardo, Emanuela, Alejandro, Amber. Eduardo drove the CC Desktop request to Overholt specifically because of this.

##### [Solution] Claude Code Desktop rollout

In progress — Eduardo's design team is first on the list. Approval and budget ($10M) secured. Directly addresses terminal barrier.

#### [Opportunity] Tool confusion

Cursor, VS Code, Claude Code, terminal — what's approved, how do they relate, which to use? Amber: "We can use Cursor the software and plug Claude Code into it, but we can't use Cursor's own equivalent... it's hella confusing."

##### [Solution] Approved tool clarity guide

A single canonical map of approved tools, how they interact, and the setup path for each use case (prototyping vs. productivity vs. MCP).

#### [Opportunity] MCP setup gap

Some PMs have done MCP connections to Jira; many more haven't. The capability exists; the knowledge of how to do it doesn't.

##### [Solution] MCP starter pack

Pre-configured MCP connections for the tools PMs already use (Jira, Confluence, Slack).

#### [Opportunity] No prerequisite setup step in training

Trainings go "straight to the deep end" before people are even on the tools.

##### [Solution] Guided setup session as training prerequisite

A 1-hour "get set up" session before any skills training.

### [Opportunity] Trust gap / self-built workflow problem

People have access to Claude Code but don't adopt workflows they didn't build themselves. Fluency gap is as much about trust as knowledge.

#### [Solution] Product-specific office hours

Jenny starting this — mirrors Eduardo's Monday design office hours model.

#### [Solution] AI for PM Slack channel

Async version of office hours. Jenny starting this.

#### [Solution] Peer learning groups

Amber's women's PM group is the only known grassroots peer learning community — it works because it's low-stakes and safe. Scale the peer-safety model.

#### [Solution] Firefox PM OS starter repo

A starter plugin/GitHub repo (potentially forked from growth-pm-os) designed for Firefox PM work. Easy to activate, clear path to customize.

#### [Solution] Hands-on product-wide session

Diana's design 2-hour session described as "AMAZING" by Amber. Creates shared vocabulary and baseline.

### [Opportunity] Manager OS / 1:1 effectiveness

People managers have no AI-assisted system for tracking patterns, blockers, and growth across their directs.

#### [Solution] AI-assisted 1:1 prep brief

AI surfaces patterns across recent 1:1 notes, flags blockers, drafts talking points. Emanuela: "I love this."

##### [Experiment] Mozilla policy allows AI folders referencing direct reports

Emanuela believes (but hasn't confirmed) that policy prohibits keeping AI folders named after directs. Must resolve before piloting.

### [Opportunity] Idea-to-reality path opacity

PMs with big proposals have no clear path to get cross-team buy-in or stack ranking — large bets die in ambiguity while experiments thrive.

#### [Solution] Initiative visibility and dependency mapping

Alejandro: "The path to go from idea to reality is very unclear." AI could help with visibility, dependency mapping, or stakeholder tracking.

##### [Experiment] The gap is tooling, not org design

Needs validation — may be a structural/org issue that tooling alone can't fix.

### [Opportunity] Workflow democratization / shared repo scaling

The best AI workflows live on individual machines or in one team's repo. No system exists for deciding what's worth scaling or actually scaling it.

#### [Solution] Central context repository

Shared prompt library, templates, and workflows for common PM tasks. Amber wants this; Meridel wants this; Alex can't support the current fork model.

#### [Solution] "What's worth scaling" decision owner

Adam named this gap. Monthly show-and-tell surfaces good work but nothing moves it forward.

#### [Solution] Increase sharing cadence

Once/month "might as well not exist" (Amber). Weekly or biweekly async Slack sharing keeps pace with how fast tools are changing.

### [Opportunity] Collaboration gap in AI work

AI work is inherently solo — there's no multiplayer equivalent of Figma/FigJam for any discipline. Blocks cross-functional co-creation.

#### [Solution] Unblock the vibe-coded prototype portal

Brooke's design component library is built but blocked by SSO — sitting there undeployed.

#### [Solution] Co-vibe jam sessions

Structured sessions where a PM/design/eng trio works together in real time.

### [Opportunity] Status update and stakeholder comms overhead

PMs without team-level TPMs spend significant time on routine status updates. Amber: 1.5 hrs/week on status updates alone.

#### [Solution] Fork Betty's TPM tool → PM status-update communicator

Betty built a complete TPM tool (Jira pulls, weekly reports, Slack automation, staging). A version scoped to PM status updates could be high-leverage.

##### [Experiment] Betty's tool generalizes beyond TPM workflows

Betty built it for her specific workflow. Needs validation that the core pattern transfers to PM status reporting.

#### [Solution] AI-assisted stakeholder comms templates

Pre-loaded with context, style, and audience. Especially for recurring comms with ads partners and leadership.

### [Opportunity] PM brief quality gap

PM briefs vary enormously in quality, creating downstream waste for design, content design, and engineering.

#### [Solution] AI-assisted brief template with required inputs

A structured template that forces PM thinking (research, user need, success criteria, scope) before drafting.

#### [Solution] Brief quality rubric

Meridel's team could co-develop this. Adam explicitly named brief redefinition as a priority.

### [Opportunity] Competitive AI culture / psychological safety gap

AI adoption is landing as a performance metric rather than a capability investment — creating anxiety rather than collaborative fluency.

#### [Solution] Publish CLG AI expectations now

Amber flagged that the CLG has AI expectations nobody has seen yet. Anxiety from an invisible bar is worse than a challenging visible one.

#### [Solution] Explicit "collaborative not competitive" reframe from Adam

The tone is set at the top. If Adam frames AI adoption as team capability, not individual performance, it changes the context for everything else.

### [Opportunity] Moving from delegation to unlock

Some PMs are using AI but haven't changed how they work — speeding up existing workflows rather than rethinking the work itself.

#### [Solution] "What changed" case studies

Document before/after examples of PMs who shifted how they work, not just how fast.

#### [Solution] Office hours format shift

Instead of "here's how to do X," anchor sessions around "here's a problem I'm trying to solve — how would you approach it?"

### [Opportunity] Building / prototyping in Firefox

Setting up a local Firefox copy is a significant time investment. Amber set up local Firefox on Presidents' Day because there was no way to do it during a normal business day.

#### [Solution] Firefox local setup guide + office hours slot

A documented setup path and a dedicated office hours slot for getting local Firefox running.

##### [Experiment] Local Firefox setup is blocking more than one PM

Single source (Amber). Needs validation — may be a niche constraint rather than a widespread blocker.
`;

export const MOZILLA_OST_SOURCE_KEY = 'seeded:mozilla-pm-ost';
export const MOZILLA_OST_NAME = 'Mozilla Firefox PM Org';
