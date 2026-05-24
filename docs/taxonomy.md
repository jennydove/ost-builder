# OST Builder — Taxonomy

The vocabulary used in the app, the database, and these docs. Establishes one canonical name per concept so the codebase, API, and UI copy stop drifting.

Status: **draft, awaiting review** (alongside `docs/rbac.md`). Migrating the codebase to this vocabulary is its own follow-up phase — Phase H proposed.

## Why this exists

Today the codebase uses "share" for two unrelated things: (a) the artifact the user creates, and (b) the action of giving someone access to it. That confusion shows up in `share_members` (who has access to a share), `share_comments` (comments on a share), `share-store-item.mts` (the artifact handler), and "Share button" (the action). When the same word means both the noun and the verb, the model gets tangled.

Domain-Driven Design says: name the aggregate after the thing it actually is. The thing is a **tree** (an Opportunity Solution Tree). The action is **share**. Two words for two concepts.

## Core nouns

| Term | Definition | Notes |
|---|---|---|
| **Tree** | One Opportunity Solution Tree. The unit of creation, ownership, sharing, and persistence. | Currently called `share` in the DB and `Share` / `StoredShare` in code. Phase H renames. |
| **Card** | A single node in a tree. | Already canonical. |
| **Card type** | One of: Outcome, Opportunity, Solution, Experiment. | Defines hierarchy: Outcome → Opportunity → Solution → Experiment. |
| **Outcome** | Top of the tree. The measurable result the team is targeting. | One per tree, typically. |
| **Opportunity** | A user need or problem under an outcome. | Many per outcome. |
| **Solution** | A bet on how to address an opportunity. | Many per opportunity. |
| **Experiment** | A test that validates a solution. | Many per solution. |
| **Organization (org)** | A group of users sharing a domain or company affiliation, used as a unit for domain-restricted tree visibility. | New in Phase G. Replaces hardcoded `'mozilla'` string. |
| **Tree member** | A user who has been granted explicit access to a tree, with a role. | Currently `share_members`. Distinct from "anyone in the org who can view via domain restriction." |
| **Comment** | A user-authored note attached to a card within a tree. | Stored separately from card content. |

## Core verbs

| Term | Definition |
|---|---|
| **Create** (a tree) | New tree, current user becomes owner. |
| **Open** (a tree) | Load a tree into the editor — from the library or via link. |
| **Edit** (a tree) | Modify any card content, metadata, or visibility. |
| **Share** (a tree) | Change visibility, invite specific tree members, copy the link. The verb that gives others access. |
| **Comment** (on a card) | Author a comment row tied to a card in the active tree. |
| **Invite** | Add a user as a tree member with a specific role. |
| **Revoke** | Remove a tree member. |

## Visibility (and how it composes with members)

Three independent dimensions stack to produce who can see a tree.

### Visibility setting (one of three)

| Value | Means |
|---|---|
| **`link-public`** | Anyone with the link can view, no sign-in required. (Currently `'public'` in the DB.) |
| **`domain-restricted`** | Anyone signed in and a member of the tree's organization can view. Requires the tree to have an `org_id` and the viewer to be in `org_members` for that org. (Currently `'mozilla'`; Phase G renames.) |
| **`restricted`** | Only explicit tree members can view. No org required — works for personal trees too. (Currently `'private'`.) |

### Tree members (independent of visibility)

Tree members are explicit per-person grants. They **overlay** the visibility setting — a tree member always has at least their assigned role, regardless of visibility.

- `restricted` tree + tree members = exactly the named people (Google Docs "Restricted" mode)
- `domain-restricted` tree + tree members = anyone in the org, with specific people pinned to specific roles (an editor in a viewer-by-default org)
- `link-public` tree + tree members = anyone with the link gets viewer; pinned members get their assigned role

### Why this composition matters

Today the codebase implicitly assumes "restricted = private = no org needed" and "company-limited = needs org." That's coincidentally true but accidentally tangled. The right model is:

- **Org** is a property of the tree (which org owns it, if any).
- **Visibility** is a property of the tree (the default access level).
- **Members** are a property of the tree (the explicit grants).

This decoupling means: a personal-domain user (no org) can still create a `restricted` tree and share it with specific people. A Mozilla user can create a `link-public` tree that anyone can view but only certain people can edit. Etc.

## Naming conventions for code

Going forward (and as Phase H rename target):

| Layer | Today | Target |
|---|---|---|
| DB table | `shares` | `trees` |
| DB table | `share_members` | `tree_members` |
| DB table | `share_comments` | `tree_comments` |
| API path | `/api/share/store` | `/api/tree` |
| API path | `/api/share/store/:id` | `/api/tree/:id` |
| API path | `/api/share/store/:id/comments` | `/api/tree/:id/comments` |
| TypeScript types | `StoredShare`, `ShareRole`, `ShareVisibility` | `Tree`, `TreeRole`, `TreeVisibility` |
| URL slug | `/s/:id` | Keep `/s/:id` (short, in the wild) — but treat it as "/s for shared tree" |
| Local-storage key | `cloud:<id>` | `tree:<id>` |
| Store fields | `activeCloudShareId`, `activeIsOwner` | `activeTreeId`, `activeIsOwner` |

UI copy stays human-friendly: "Share this tree," "Invite people," "Make link-public."

## Out of scope (named here so we don't conflate)

- **Project** — not used. Avoid; use "tree" instead.
- **Document** — not used. Avoid.
- **Workspace** — not used. If we ever group multiple trees, define it then.
- **Board** — sometimes used by users informally (the canvas looks like a board). UI may call the canvas a board for clarity. The DB-level entity is still a tree.
