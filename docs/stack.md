# ATP Engine — Technology Stack

## 1. Purpose

This document defines the official technology stack for the ATP Engine.

The stack is a project constraint.

Agents and contributors must not replace technologies defined here without an explicit architectural decision.

The project must remain **agent-agnostic**: different coding agents must be able to work on the project while following the same technological and architectural constraints.

Agent choice must never determine the project's technology stack.

---

# 2. Official Stack

| Layer                 | Technology                          |
| --------------------- | ----------------------------------- |
| Runtime               | Node.js                             |
| Language              | TypeScript                          |
| API                   | Express                             |
| Validation            | Zod                                 |
| Database              | MongoDB                             |
| ODM / Database Access | Mongoose or official MongoDB driver |
| HTTP Client           | Native `fetch` / `undici`           |
| Tests                 | Vitest                              |
| Linting               | ESLint                              |
| Formatting            | Prettier                            |
| Containerization      | Docker                              |
| Local AI              | Ollama                              |
| Remote AI             | Provider Adapter architecture       |
| Architecture          | Modular / Clean-ish Architecture    |

---

# 3. Runtime

## 3.1 Node.js

ATP runs on Node.js.

Node.js is responsible for:

- HTTP server execution;
- external source requests;
- scraping operations;
- database communication;
- AI provider communication;
- application orchestration.

The implementation must use modern Node.js APIs where practical.

---

# 4. Language

## 4.1 TypeScript

The entire application must be written in TypeScript.

JavaScript files must not be introduced into the production source tree unless there is an explicit architectural reason.

TypeScript strictness should be enabled.

Recommended baseline:

```text
strict = true
```

The project should favor explicit domain types over loosely typed objects.

Avoid:

```text
any
```

unless there is a documented and justified reason.

---

# 5. API

## 5.1 Express

Express is the HTTP API framework.

Express is responsible for:

- routing;
- HTTP request handling;
- middleware;
- request validation integration;
- response serialization;
- HTTP-level error handling.

Express must remain at the interface layer.

Domain and application logic must not depend directly on Express.

---

# 6. API Layer Boundary

The following dependency direction must be preserved:

```text
HTTP
 ↓
Application
 ↓
Domain
```

Never:

```text
Domain
 ↓
Express
```

Domain services must not receive:

```text
Request
Response
NextFunction
```

or other Express-specific objects.

---

# 7. Validation

## 7.1 Zod

Zod is the standard validation library.

It must be used to validate externally controlled data, including:

- HTTP request bodies;
- query parameters;
- route parameters;
- environment variables;
- external source responses where appropriate;
- AI responses;
- configuration.

---

# 8. Runtime Validation

TypeScript types alone are not sufficient for external data.

This is invalid:

```text
External API
    ↓
assume TypeScript interface
    ↓
use data
```

The preferred pattern is:

```text
External Data
    ↓
Zod Schema
    ↓
Validated Data
    ↓
Application
```

---

# 9. Database

## 9.1 MongoDB

MongoDB is the canonical persistence technology for ATP.

The database stores the canonical ATP catalog and associated source/provenance information.

MongoDB-specific concerns must remain isolated within the infrastructure layer.

---

# 10. Database Access

ATP may use either:

```text
Mongoose
```

or:

```text
Official MongoDB Node.js Driver
```

The final choice must be made based on actual project requirements during implementation.

The choice must not leak into the domain layer.

---

# 11. ODM / Driver Decision

The decision between Mongoose and the official driver must consider:

- schema complexity;
- domain modeling requirements;
- transaction support;
- validation needs;
- query complexity;
- performance;
- maintainability;
- TypeScript integration;
- repository implementation complexity.

The application architecture must allow the implementation to change between these approaches without rewriting domain logic.

---

# 12. Repository Boundary

Database access must be hidden behind repository interfaces.

Conceptually:

```text
Application
    ↓
GameRepository
    ↓
Mongo implementation
    ↓
MongoDB
```

The application must not directly execute MongoDB queries.

---

# 13. HTTP Client

ATP uses:

```text
fetch
```

provided by modern Node.js where sufficient.

`undici` may be used when explicit HTTP-client capabilities are required.

The project must avoid introducing multiple HTTP clients without justification.

---

# 14. External HTTP Isolation

HTTP communication belongs to infrastructure.

For example:

```text
infrastructure/
└── sources/
    ├── wikipedia/
    └── steamdb/
```

Source adapters may use `fetch`/`undici`.

The domain must not know how HTTP requests are performed.

---

# 15. Testing

## 15.1 Vitest

Vitest is the standard testing framework.

Tests should cover:

- domain rules;
- classification;
- identity resolution;
- normalization;
- filtering;
- pagination;
- repositories;
- source adapters;
- AI providers;
- API behavior;
- integration flows.

---

# 16. Test Priority

The most important logic must be testable without external services.

In particular:

```text
classification
identity resolution
normalization
deduplication
filtering
pagination
```

must have deterministic tests.

---

# 17. External Services in Tests

Tests must not depend on:

- live Wikipedia;
- live SteamDB;
- a production database;
- a remote LLM;
- Ollama availability.

External integrations should be mocked, stubbed, or tested through dedicated integration suites.

---

# 18. Linting

## 18.1 ESLint

ESLint is the standard linter.

Lint rules should enforce:

- TypeScript correctness;
- unused variables;
- problematic patterns;
- import consistency;
- maintainability rules.

The lint configuration should remain compatible with the project's TypeScript setup.

---

# 19. Formatting

## 19.1 Prettier

Prettier is the standard formatter.

Formatting must not be manually enforced through subjective style decisions.

The repository should contain a shared configuration.

All agents must follow the repository's formatting configuration.

---

# 20. Containerization

## 20.1 Docker

Docker is the standard containerization technology.

Docker should be used to provide reproducible development and deployment environments.

The initial development environment should support, where appropriate:

```text
ATP Engine
MongoDB
Ollama
```

---

# 21. Docker Principle

Containers must not hide architectural boundaries.

For example, the application must not assume that MongoDB and Ollama are always running inside the same container or host.

Connection details must be configuration-driven.

---

# 22. AI Architecture

AI is an optional capability.

The ATP Engine must remain fully operational without an LLM.

This is a fundamental architectural constraint.

---

# 23. Local AI

## 23.1 Ollama

Ollama is the initial local AI runtime.

Ollama may provide models for:

- game classification;
- identity resolution;
- metadata interpretation;
- conflict resolution;
- search assistance.

The specific model is not part of the core domain architecture.

---

# 24. Remote AI

Remote AI providers must be integrated through an abstraction.

Conceptually:

```text
AIService
    ↓
AIProvider
    ├── OllamaProvider
    ├── RemoteProvider
    └── FutureProvider
```

The domain must not depend directly on Ollama or any specific remote AI provider.

---

# 25. AI Optionality

The following must always be true:

```text
LLM available
    ↓
AI-assisted pipeline

LLM unavailable
    ↓
Native pipeline
```

AI must improve the quality of results, not determine whether the engine works.

---

# 26. AI Failure

The following must not terminate normal engine operation:

- Ollama unavailable;
- remote provider unavailable;
- timeout;
- invalid model response;
- malformed JSON;
- provider rate limit;
- model loading failure.

AI failures must degrade gracefully to native logic.

---

# 27. Architecture

## 27.1 Modular / Clean-ish Architecture

ATP follows a modular architecture inspired by Clean Architecture.

The goal is not to implement Clean Architecture dogmatically.

The goal is to enforce clear dependency boundaries.

---

# 28. Dependency Direction

The preferred dependency direction is:

```text
Interfaces
    ↓
Application
    ↓
Domain

Infrastructure
    ↓
implements contracts
```

More concretely:

```text
HTTP
 │
 ▼
Application
 │
 ▼
Domain

Infrastructure ───────┐
                       │
                       ▼
                 Domain Contracts
```

---

# 29. Domain

The domain contains business concepts and rules.

Examples:

```text
Game
Release
Platform
Genre
Developer
Publisher
Source
Identity
Relationship
```

Domain code must remain independent of:

- Express;
- MongoDB;
- Mongoose;
- Ollama;
- HTTP libraries;
- filesystem;
- environment variables.

---

# 30. Application

The application layer orchestrates use cases.

Examples:

```text
SearchGames
GetGame
GetGameCover
ResolveGameIdentity
ClassifyCandidate
EnrichGame
DiscoverGames
```

Application services coordinate domain logic and infrastructure contracts.

---

# 31. Infrastructure

Infrastructure contains technical implementations.

Examples:

```text
MongoGameRepository
WikipediaAdapter
SteamDBAdapter
OllamaProvider
RemoteAIProvider
HttpClient
```

Infrastructure may depend on frameworks and libraries.

Domain must not.

---

# 32. Interfaces

Interfaces expose the system externally.

Initial interface:

```text
REST API
```

Future interfaces may include:

```text
CLI
worker
message queue
scheduled jobs
```

Adding an interface must not require rewriting domain logic.

---

# 33. Suggested Project Structure

The exact directory layout may evolve, but the architecture should resemble:

```text
src/
├── domain/
│   ├── game/
│   ├── release/
│   ├── identity/
│   ├── classification/
│   └── shared/
│
├── application/
│   ├── games/
│   ├── discovery/
│   ├── classification/
│   ├── identity/
│   └── covers/
│
├── infrastructure/
│   ├── database/
│   ├── sources/
│   │   ├── wikipedia/
│   │   └── steamdb/
│   ├── ai/
│   │   ├── ollama/
│   │   └── remote/
│   └── http/
│
└── interfaces/
    └── http/
        ├── routes/
        ├── controllers/
        ├── middleware/
        └── schemas/
```

This structure is a guideline, not a reason to create unnecessary abstractions.

---

# 34. Configuration

Configuration must be centralized and validated with Zod.

Examples:

```text
PORT
MONGODB_URI
OLLAMA_URL
OLLAMA_MODEL
AI_PROVIDER
SOURCE_TIMEOUT
```

Application code should not read `process.env` throughout the codebase.

Prefer:

```text
config
```

as the single configuration boundary.

---

# 35. Environment Separation

Environment-specific values must not be hardcoded.

Examples:

```text
development
test
production
```

must be configurable without changing application source code.

---

# 36. Secrets

Secrets must never be committed to the repository.

Examples:

```text
API keys
database credentials
provider credentials
tokens
```

must be supplied through environment/configuration mechanisms.

---

# 37. Technology Replacement

Technology replacement should be possible at infrastructure boundaries.

For example:

```text
Mongoose
    ↓
MongoDB Driver
```

should not require rewriting:

```text
Game
IdentityResolver
Classifier
SearchGames
```

Likewise:

```text
Ollama
    ↓
Remote LLM
```

should not require rewriting domain logic.

---

# 38. What Agents Must Not Do

Agents must not independently replace:

```text
Express
MongoDB
TypeScript
Vitest
Zod
Docker
```

with alternatives simply because they prefer them.

Agents must not introduce:

```text
NestJS
Fastify
Prisma
PostgreSQL
Jest
Yup
Axios
```

as replacements without an explicit architectural decision.

---

# 39. Dependency Introduction

New dependencies should be introduced only when they provide clear value.

Before adding a dependency, determine whether the requirement can reasonably be satisfied using:

- existing dependencies;
- Node.js built-ins;
- existing project abstractions.

Avoid dependency proliferation.

---

# 40. Architecture Over Framework

Framework code must remain replaceable.

The project should be designed around:

```text
domain rules
use cases
contracts
```

rather than around Express, Mongoose, or Ollama APIs.

---

# 41. Core Principle

The ATP Engine must remain useful without AI.

The ATP Engine must remain maintainable without a specific external provider.

The ATP Engine must remain understandable without knowledge of a specific coding agent.

The intended architecture is therefore:

```text
                 ┌──────────────────────┐
                 │     ATP ENGINE       │
                 │                      │
                 │      DOMAIN          │
                 │                      │
                 │ Classification       │
                 │ Identity             │
                 │ Games                │
                 │ Releases             │
                 │ Relationships        │
                 └──────────┬───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Database       Sources          AI
              │             │             │
           MongoDB       Wikipedia      Ollama
                         SteamDB        Remote
              │             │             │
              └─────────────┼─────────────┘
                            │
                         Express
                            │
                          REST
```

The technology stack serves the architecture.

It must never become the architecture.
