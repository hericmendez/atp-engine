# ATP Engine — AI Integration

## 1. Purpose

Artificial Intelligence is an optional capability of the ATP Engine.

AI exists to improve difficult operations such as:

- game classification;
- search-result classification;
- identity resolution;
- metadata interpretation;
- conflict resolution;
- ambiguous candidate analysis.

AI is **not a required runtime dependency**.

ATP must remain fully functional when no LLM is available.

---

# 2. Fundamental Principle

The ATP Engine must be deterministic-first.

The preferred execution model is:

```text
Request
   ↓
Native logic
   ↓
Confident result?
 ├── YES → Return result
 └── NO
       ↓
      AI
       ↓
   Valid result?
 ├── YES → Use AI-assisted result
 └── NO
       ↓
   Native fallback
```

AI should be introduced where it provides meaningful value.

It should not replace deterministic logic unnecessarily.

---

# 3. AI as an Assistant

The LLM is an assistant to the engine.

It is not:

- the source of truth;
- the database;
- the identity authority;
- the classifier authority;
- the application orchestrator.

The application decides what to ask the model and whether its answer is acceptable.

---

# 4. AI Provider Abstraction

The application must depend on an AI provider contract.

Conceptually:

```text
AIProvider
├── classify()
├── resolveIdentity()
└── analyzeMetadata()
```

The exact interface should be defined according to actual use cases during implementation.

---

# 5. Providers

The initial architecture supports:

```text
OllamaProvider
RemoteAIProvider
```

Future providers may be added without modifying domain logic.

---

# 6. Ollama

Ollama is the initial local AI runtime.

The specific model must be configurable.

Example:

```text
OLLAMA_URL
OLLAMA_MODEL
```

The domain must never reference a model name directly.

---

# 7. Remote Providers

Remote LLM providers must be implemented behind the same provider abstraction.

The application should not depend directly on provider-specific SDKs.

Provider-specific SDKs belong in infrastructure.

---

# 8. Provider Selection

Provider selection belongs to configuration/application infrastructure.

Conceptually:

```text
AI_PROVIDER=ollama
```

or:

```text
AI_PROVIDER=remote
```

The use case should remain unaware of the selected provider.

---

# 9. AI Capabilities

AI may assist with the following capabilities.

## 9.1 Classification

Determine whether an external candidate represents:

```text
GAME
DLC
EXPANSION
MOVIE
TV_SHOW
ANIME
SOUNDTRACK
BOOK
HARDWARE
PROMOTIONAL
CHARACTER
FRANCHISE
PERSON
EVENT
UNKNOWN
```

---

## 9.2 Identity Resolution

Determine whether two candidates represent:

```text
SAME_GAME
DIFFERENT_GAME
RELATED_GAME
UNRESOLVED
```

with optional relationship classification.

---

## 9.3 Metadata Interpretation

AI may interpret poorly structured source data.

Examples:

- extracting release information;
- identifying edition markers;
- interpreting descriptions;
- recognizing alternate titles;
- extracting relationships.

AI output must still be validated before entering the domain.

---

## 9.4 Conflict Resolution

When sources disagree, AI may help interpret the evidence.

Example:

```text
Source A → release year 2004
Source B → release year 2005
Source C → release year 2005
```

AI may identify that:

```text
2004 = original release
2005 = regional release
```

if supported by the supplied evidence.

The AI must not invent unsupported information.

---

# 10. AI Input

The engine should send structured evidence whenever possible.

Prefer:

```text
{
  "candidate": {...},
  "existingGame": {...},
  "sources": [...]
}
```

over large uncontrolled raw documents.

Only relevant evidence should be provided.

---

# 11. Context Minimization

AI prompts should contain the minimum information necessary for the task.

Avoid sending:

- unrelated source records;
- entire HTML documents;
- unnecessary raw responses;
- sensitive configuration;
- database credentials;
- internal infrastructure details.

---

# 12. Structured Output

AI responses must use structured output.

Example:

```text
{
  "decision": "SAME_GAME",
  "confidence": 0.94,
  "relationship": null,
  "evidence": [
    "same title",
    "same original release",
    "platform difference only"
  ]
}
```

Free-form text must not be treated as an authoritative domain result.

---

# 13. Schema Validation

Every AI response must be validated using Zod before being consumed.

Pipeline:

```text
LLM
 ↓
Raw response
 ↓
Parse
 ↓
Zod validation
 ↓
Validated proposal
 ↓
Domain/application validation
 ↓
Accept or reject
```

---

# 14. AI Confidence

Confidence returned by an LLM is advisory.

For example:

```text
confidence = 0.99
```

does not automatically mean the engine must accept the decision.

Confidence must be interpreted alongside deterministic evidence.

---

# 15. Hard Evidence

Deterministic evidence has priority over AI.

Examples:

- verified external ID;
- explicit source relationship;
- known release relationship;
- explicit DLC classification.

AI cannot override hard evidence simply because its prediction differs.

---

# 16. AI Failure

AI failure includes:

- provider unavailable;
- Ollama unavailable;
- network timeout;
- rate limiting;
- malformed response;
- invalid JSON;
- invalid schema;
- model failure;
- excessive latency.

AI failure must never make the entire engine fail when native logic can continue.

---

# 17. Fallback

The fallback strategy is mandatory.

```text
Native
  ↓
AI assistance
  ↓
AI fails
  ↓
Native result
```

The exact fallback behavior depends on the use case.

For classification:

```text
AI unavailable
    ↓
native classifier
```

For identity resolution:

```text
AI unavailable
    ↓
native resolver
    ↓
UNRESOLVED if ambiguous
```

The engine must never replace uncertainty with a guess.

---

# 18. AI Must Not Mutate Persistence

AI providers must not directly access repositories.

Forbidden:

```text
AI
 ↓
MongoDB
```

Required:

```text
AI
 ↓
Proposal
 ↓
Application
 ↓
Validation
 ↓
Repository
 ↓
MongoDB
```

---

# 19. AI-Assisted Classification

Recommended flow:

```text
Candidate
   ↓
Native classifier
   ↓
Confident?
 ├── YES → classification
 └── NO
       ↓
      AI
       ↓
    Validate
       ↓
 classification
```

---

# 20. AI-Assisted Identity Resolution

Recommended flow:

```text
Candidate
   ↓
Find possible existing games
   ↓
Native identity resolver
   ↓
Confident?
 ├── YES → decision
 └── NO
       ↓
      AI
       ↓
    Validate
       ↓
   Decision
```

---

# 21. Candidate Retrieval Before AI

AI should not be asked to compare a candidate against the entire database.

The application must first retrieve a manageable set of plausible candidates.

Example:

```text
"Resident Evil 4"
       ↓
candidate lookup
       ↓
Resident Evil 4 (2005)
Resident Evil 4 (2023)
Resident Evil 4 VR
       ↓
AI comparison
```

This keeps AI focused and reduces cost/latency.

---

# 22. AI and Search Ranking

AI may assist in ranking search candidates when native relevance scoring is insufficient.

However, pagination should operate on a stable ranked candidate set.

The engine must avoid generating a different ordering on every request merely because an LLM produced a slightly different response.

---

# 23. AI Determinism

Where practical, AI-assisted decisions should use:

- deterministic prompts;
- structured output;
- low randomness;
- stable model configuration.

AI output should be treated as potentially nondeterministic.

The architecture must tolerate that.

---

# 24. AI Caching

AI results may be cached when the input evidence is stable.

Potential cache key:

```text
task
+
candidate IDs
+
relevant metadata hash
+
model
+
prompt/version
```

Changing the model or prompt version should invalidate the relevant cache.

---

# 25. Prompt Versioning

Prompts are part of the AI implementation.

Important prompts should be versioned.

Example:

```text
classification-v1
identity-resolution-v1
metadata-analysis-v1
```

This makes AI behavior reproducible and auditable.

---

# 26. Observability

AI operations should expose metrics such as:

```text
provider
model
operation
latency
success/failure
fallback triggered
validation failure
```

Do not log sensitive provider credentials.

---

# 27. AI Cost Control

Remote AI usage should be minimized.

The engine should:

1. use native logic first;
2. query the database before external discovery;
3. retrieve plausible candidates before comparison;
4. send minimal evidence;
5. cache reusable results;
6. avoid repeated AI calls for the same decision.

---

# 28. AI Privacy

The engine should never send unnecessary internal data to remote providers.

Only evidence required for the AI task should be transmitted.

---

# 29. AI Model Independence

No domain rule may depend on the capabilities of a specific model.

Replacing:

```text
Model A
```

with:

```text
Model B
```

must not require rewriting the domain.

---

# 30. AI Disable Mode

The engine must support AI being disabled.

Conceptually:

```text
AI_ENABLED=false
```

In this mode:

```text
Native classification
Native identity resolution
Native metadata processing
```

must continue operating.

---

# 31. AI Testing

AI integrations must be tested at multiple levels.

### Unit tests

Use mocked providers.

### Integration tests

Test provider adapters separately.

### Contract tests

Ensure provider responses conform to expected schemas.

### Evaluation tests

Use a fixed corpus of ambiguous game cases to evaluate AI-assisted decisions.

---

# 32. AI Evaluation Dataset

ATP should eventually maintain a dataset containing known difficult cases.

Examples:

```text
Resident Evil 4 (2005) vs Resident Evil 4 (2023)

Breath of the Wild Wii U vs Switch

Final Fantasy Tactics vs
The War of the Lions

NTSC-USA vs PAL-EUR
```

Each fixture should contain the expected domain decision.

This dataset becomes a regression suite for identity resolution.

---

# 33. AI Is Not Required for Correctness

A successful ATP implementation must be able to pass its core domain tests without any LLM.

AI is an enhancement layer.

If removing AI causes the engine to become unusable, the architecture is incorrect.

---

# 34. Core Principle

The relationship between ATP and AI is:

```text
             ATP ENGINE
                  │
        ┌─────────┴─────────┐
        │                   │
    Native Logic          AI
        │                   │
        └─────────┬─────────┘
                  │
              Decision
                  │
              Validation
                  │
              Persistence
```

**ATP makes the decision. AI helps ATP make difficult decisions.**
