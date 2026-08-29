# ATP Engine

> Ash Twin Project — Video Game Metadata Discovery and Catalog Engine

## Overview

ATP Engine is a standalone service for discovering, classifying, normalizing, resolving, and persisting video game metadata from multiple external sources.

Its primary purpose is to build and maintain a reliable canonical catalog of video games.

ATP is designed to operate independently from any consuming application.

Applications such as Save State may use ATP as a metadata service, but ATP does not own user-specific gaming data.

---

# Core Responsibilities

ATP is responsible for:

- discovering games across multiple sources;
- searching games by terms;
- retrieving metadata for individual games;
- discovering game covers;
- filtering and ranking search results;
- classifying candidates;
- identifying duplicate or equivalent records;
- distinguishing different games with similar names;
- representing relationships between related games;
- normalizing metadata;
- persisting validated canonical information;
- enriching incomplete records;
- querying the canonical catalog.

---

# Original Scraper Baseline

The original Next.js scraper established the initial functional baseline.

It was capable of:

- searching multiple sources;
- filtering source results;
- searching game metadata by term;
- discovering game covers;
- returning a small set of filtered cover candidates;
- distinguishing games from unrelated media such as movies, anime, DLC, and promotional content.

It did not yet implement persistent catalog storage.

ATP Engine preserves these capabilities while moving them into a dedicated, extensible service architecture.

---

# Design Principles

## 1. Database First

When requesting metadata for an individual game:

```text
Request
  ↓
Database
  ↓
Sufficient?
 ├── YES → Return
 └── NO → External discovery
```

External sources should not be queried unnecessarily when sufficient canonical information already exists.

---

## 2. Deterministic First

ATP should prefer deterministic rules whenever they provide sufficient evidence.

AI exists primarily to assist with ambiguity.

```text
Deterministic processing
        ↓
Ambiguous?
   ├── NO → Continue
   └── YES → AI assistance
```

---

## 3. AI Is Optional

ATP must remain operational when no AI provider is available.

AI may assist with:

- classification;
- identity resolution;
- semantic normalization;
- conflict resolution;
- candidate ranking.

AI is never the canonical source of truth.

---

## 4. Native Fallback

Whenever an AI operation fails:

```text
AI unavailable
     ↓
Native engine
     ↓
Continue whenever possible
```

The system must not become dependent on an LLM for basic operation.

---

## 5. External Sources Are Untrusted

Source data is treated as evidence, not canonical truth.

```text
Source
  ↓
Adapter
  ↓
Normalization
  ↓
Classification
  ↓
Resolution
  ↓
Validation
  ↓
Canonical data
```

---

# Supported Catalog Concepts

ATP is expected to represent:

- games;
- releases;
- platforms;
- regions;
- developers;
- publishers;
- genres;
- alternate titles;
- external identifiers;
- relationships between related games;
- source provenance.

---

# Identity Examples

ATP must be able to distinguish:

```text
Resident Evil 4 (2005)
≠
Resident Evil 4 (2023 Remake)
```

while recognizing:

```text
The Legend of Zelda:
Breath of the Wild — Wii U
=
The Legend of Zelda:
Breath of the Wild — Nintendo Switch
```

and:

```text
Resident Evil 3 — NTSC/USA
=
Resident Evil 3 — PAL/EUR
```

when represented as regional releases of the same game.

Related versions may remain distinct:

```text
Final Fantasy Tactics
Final Fantasy Tactics: The War of the Lions
Final Fantasy Tactics: The Ivalice Chronicles
```

The engine must represent their relationship instead of blindly merging them.

---

# Search Capabilities

ATP should support:

### Game search

```text
GET /games/search?q=zelda
```

### Catalog filtering

By:

- terms;
- titles;
- release year/date;
- platforms;
- developers;
- publishers;
- genres.

### Individual game lookup

```text
GET /games/:id
```

### Cover search

```text
GET /covers/search?q=zelda
```

The exact API contract is defined in `docs/api.md`.

---

# High-Level Architecture

```text
                    ATP API
                       │
                       ▼
                 Application
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
      Domain                    AI Boundary
          │                         │
          └────────────┬────────────┘
                       ▼
                 Infrastructure
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Database     Sources      AI Providers
```

---

# AI Architecture

AI is capability-oriented rather than provider-oriented.

Possible capabilities include:

```text
GameClassifier
IdentityResolver
ConflictResolver
MetadataNormalizer
```

Providers are infrastructure implementations.

The domain must not depend on a specific provider.

---

# Development

Read the following before making architectural changes:

```text
AGENTS.md
engineering-rules.md
```

Then consult the relevant documents under:

```text
docs/
```

---

# Documentation

Architecture:

```text
docs/architecture.md
```

Domain:

```text
docs/domain-model.md
```

Discovery:

```text
docs/discovery.md
```

Classification:

```text
docs/classification.md
```

Identity:

```text
docs/identity-resolution.md
```

Sources:

```text
docs/sources.md
```

Persistence:

```text
docs/persistence.md
```

AI:

```text
docs/ai.md
```

API:

```text
docs/api.md
```

Roadmap:

```text
docs/roadmap.md
```

---

# Project Philosophy

ATP is not a scraper wrapped in an API.

It is a **knowledge engine**.

Scraping is only one mechanism used to acquire evidence.

The long-term goal is:

```text
External World
      ↓
Evidence
      ↓
Interpretation
      ↓
Identity
      ↓
Canonical Knowledge
      ↓
Persistent Catalog
```

The catalog should become increasingly useful as knowledge accumulates.

---

# Final Principle

ATP should remain useful without:

- a specific external source;
- a specific AI provider;
- a specific LLM;
- a specific consuming application.

The core of ATP is its domain and deterministic processing.

AI exists to make that core better at handling ambiguity.
