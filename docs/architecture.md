# ATP Engine — Architecture

## 1. Purpose

This document provides a concise architectural map of the ATP Engine.

Detailed specifications for each concern live in their respective documents under `docs/`.

---

# 2. Layered Architecture

The ATP Engine follows a layered architecture with inward-pointing dependencies:

```text
Interfaces (HTTP / REST)
       ↓
Application (Use Cases / Orchestration)
       ↓
Domain (Business Rules / Entities)

Infrastructure ← implements contracts from Domain and Application
```

Dependencies must point inward. The domain must not depend on Express, MongoDB, Mongoose, Ollama, HTTP clients, or environment variables.

---

# 3. Conceptual Map

```text
┌──────────────────────────────────────────────────────┐
│                    INTERFACES                        │
│                                                      │
│  Express REST API                                    │
│  Routes / Controllers / Middleware / Schemas          │
└────────────────────────┬─────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────┐
│                  APPLICATION                         │
│                                                      │
│  SearchGames · GetGame · GetGameCover                │
│  DiscoverGames · ClassifyCandidate                   │
│  ResolveGameIdentity · EnrichGame                    │
└──────────────┬──────────────────┬────────────────────┘
               │                  │
               ↓                  ↓
┌─────────────────────┐  ┌────────────────────────────┐
│      DOMAIN         │  │       AI BOUNDARY           │
│                     │  │                             │
│  Game · Release     │  │  GameClassifier             │
│  Platform · Region  │  │  IdentityResolver           │
│  Developer          │  │  ConflictResolver           │
│  Publisher · Genre  │  │  MetadataNormalizer         │
│  Source             │  │                             │
│  Relationship       │  │  (capability interfaces)    │
│  Identity           │  │                             │
└─────────┬───────────┘  └──────────────┬──────────────┘
          └──────────────┬───────────────┘
                         ↓
┌──────────────────────────────────────────────────────┐
│                INFRASTRUCTURE                        │
│                                                      │
│  Database        Sources              AI Providers    │
│  ─────────       ─────────            ────────────    │
│  Mongoose        WikipediaAdapter     OllamaProvider  │
│  MongoGameRepo   SteamDBAdapter       RemoteProvider  │
│                  (future adapters)    (future)        │
│                                                      │
│  HTTP Client (fetch/undici)                          │
│  Configuration (Zod-validated)                       │
│  Logger                                              │
└──────────────────────────────────────────────────────┘
```

---

# 4. Core Processing Pipeline

The central data flow for game knowledge:

```text
External Sources
       ↓
Discovery (source adapters)
       ↓
Normalization
       ↓
Classification
       ↓
Identity Resolution
       ↓
Validation
       ↓
Canonical Catalog
       ↓
Enrichment (progressive)
```

Each stage is documented in its respective domain document.

---

# 5. AI Architecture

AI is an optional subsystem behind explicit capability interfaces.

```text
Operation
    ↓
Native Logic (deterministic)
    ↓
Confident?
 ├── YES → result
 └── NO
       ↓
      AI (via AIProvider)
       ↓
    Valid proposal?
     ├── YES → validate → result
     └── NO  → native fallback
```

AI must never directly mutate the database. AI produces proposals; the application validates and applies them.

See `docs/ai.md` for details.

---

# 6. Source Architecture

Each external source is isolated behind a source adapter:

```text
SourceAdapter
├── search()
├── getGame()
├── getCover()
└── capabilities
```

Source-specific logic must not leak into domain services. The domain does not know whether data came from Wikipedia, SteamDB, or any other source.

See `docs/sources.md` for details.

---

# 7. Persistence Architecture

The database stores canonical validated knowledge, not raw source data.

```text
Application / Domain
       ↓
GameRepository (contract)
       ↓
MongoGameRepository (Mongoose)
       ↓
MongoDB
```

Individual game retrieval follows database-first semantics:

```text
Request → Database → Sufficient? → YES: return
                                    NO: external discovery → normalize → validate → persist → return
```

See `docs/persistence.md` for details.

---

# 8. Identity and Classification

These are separate domain capabilities:

- **Classification** determines *what kind of entity* a candidate represents (GAME, DLC, MOVIE, etc.).
- **Identity Resolution** determines *which canonical entity* a candidate corresponds to.

Both combine deterministic rules with optional AI assistance.

See `docs/classification.md` and `docs/identity-resolution.md`.

---

# 9. Configuration

All configuration is centralized and validated with Zod at startup.

Configuration belongs to infrastructure. Domain code must not read environment variables directly.

---

# 10. Error Handling

Errors are categorized by origin:

```text
SOURCE_ERROR · AI_ERROR · VALIDATION_ERROR · PERSISTENCE_ERROR · INTERNAL_ERROR
```

External failures are isolated. One failed source does not fail the entire operation. AI failure does not fail the engine when native logic can continue.

---

# 11. Testing Strategy

- Domain logic is testable without external services.
- Source adapters use fixtures/mocks.
- AI integrations test provider adapters with mocked responses.
- Normal test suite requires no network, database, or LLM.

See `docs/roadmap.md` for phase-specific test criteria.

---

# 12. Technology Stack

| Layer         | Technology                    |
|---------------|-------------------------------|
| Runtime       | Node.js                       |
| Language      | TypeScript (strict)           |
| API           | Express                       |
| Validation    | Zod                           |
| Database      | MongoDB                       |
| DB Access     | Mongoose                      |
| HTTP Client   | fetch / undici                |
| Tests         | Vitest                        |
| Lint          | ESLint                        |
| Format        | Prettier                      |
| Containers    | Docker                        |
| Local AI      | Ollama                        |
| Remote AI     | Provider Adapter              |

See `docs/stack.md` for details.
