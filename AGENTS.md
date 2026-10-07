# AGENTS.md — AI Tutor Sofia (Луник)

## Mission
Build and maintain a personalized AI tutor for Sofia, grade 7, with a strong bias toward independent thinking, short interactive practice, and evidence-based adaptation.

The product owner defines product goals and evaluates outcomes. The engineering agent should handle implementation, tests, database changes, deployment preparation, and technical validation with minimal manual work from the owner.

## Core pedagogy
Use a strict help ladder. Do not skip levels.

0. Self-check: ask the learner to inspect a specific place or explain the first step. No calculation, hint, partial product, or final answer.
1. Tiny hint: say what to check or where to start. Do not compute for the learner.
2. Specific hint: show one principle or micro-step. Do not reveal the full solution.
3. One step together: solve exactly one sub-step and ask the learner to continue.
4. Full explanation: allowed only after earlier attempts or repeated difficulty.

If a method fails, the next explanation must change method rather than merely become longer.

Never infer fixed "learning styles". Adapt only from observed evidence over multiple interactions. When evidence is insufficient, say so.

Preserve the learner's active goal during struggle follow-ups such as "не понимаю" or "покажи по-другому". Do not silently switch topic or intent.

## Subject behavior
- Math / physics: structured math, formulas, aligned column calculations, diagrams, one-step progression.
- Russian: word/sentence structure, examples, error finding, morphology/syntax diagrams.
- English: short dialogue, oral practice, examples before long theory; voice may use slower English speed.
- History: story, timeline, causes/effects.
- Geography: map logic and place -> climate/relief -> people/economy.
- Biology: process diagrams, classification, structure -> function.
- Literature: characters, motives, conflict, discussion; do not replace reading with summaries.

## Visual explanations
Prefer deterministic structured representations over decorative text:
diagram, map, timeline, table, process, structured_math, comparison, flashcards, graph, word_structure.

For accuracy-critical educational visuals, prefer deterministic components/SVG/structured layouts rather than ASCII art or free-form generated decoration.

## Architecture principles
Use a universal pipeline, not topic-specific hacks:

intent -> knowledge state -> pedagogy planner -> representation planner -> response -> critic -> learning memory -> parent analytics.

Avoid hardcoding one-off examples unless they are regression fixtures.
Keep design and pedagogy concerns separated where practical.

## Evidence and analytics
Do not save a learning observation without an observable evidence string that supports it.
Do not claim a preference, strength, weakness, motivation level, or progress state from insufficient evidence.

Parent analytics must distinguish:
- insufficient data
- early observations
- repeated pattern

Parent rules may shape tutoring but must not override safety or the core help ladder.

## Voice and multimodal
Yandex Cloud is used for AI, OCR, STT, and TTS.
- Russian TTS uses a Russian voice.
- English TTS uses an English voice and can use a separate slower speed.
- STT output should feed the same learning dialogue flow as typed text.
- Image/OCR input should support solving/explaining without bypassing the help ladder.

## Data and security
Supabase is the application database/auth layer.
Keep RLS enabled and scoped to the authenticated parent/child relationship.

Never commit secrets or real API keys.
Do not place YANDEX_API_KEY or any secret/service-role key in GitHub.
Use environment variables in Railway / local environment.
The public repository must contain only safe public configuration examples.

## Source of truth and deployment
- GitHub repository: source of truth.
- main: production branch.
- Railway: production deployment.
- Supabase: production data/auth.
- Yandex Cloud: model/speech/OCR services.

Do not use ZIP files as a normal deployment mechanism.
Do not encode or shuttle large binary images as Base64 through chat or agent context. Refer to files already stored in the repository.

## Working style
Before changing code:
1. Read only files relevant to the task.
2. Identify the general cause, not only the visible symptom.
3. Prefer the smallest architectural fix that solves the class of problem.
4. Add or adjust regression tests for the behavior.
5. Run tests, type-check, lint, and build as appropriate.
6. Keep the UI unchanged unless the task explicitly asks for visual changes.

Do not perform broad repository rewrites unless the task requires them.
Do not remove existing working functionality without a documented reason.
Do not introduce duplicate state/data layers for convenience.

## Validation commands
Use:
- npm ci
- npm test
- npx tsc --noEmit
- npm run lint
- npm run build

If an external service is required for a runtime test, distinguish clearly between:
- locally verified
- production verified
- not verified due to unavailable auth/secret/browser access

Never claim an end-to-end scenario passed if it was not actually exercised.

## Git discipline
Prefer focused commits with descriptive messages.
Do not rewrite main history.
Do not commit generated secrets, local env files, or temporary binary archives.
When a task touches database schema, include a migration in supabase/migrations and keep RLS/policies explicit.

## Product-owner interaction
The owner should not be asked to run PowerShell, copy SQL, or manually edit code when connected tools can do it.
Ask for manual action only when genuinely required: login, consent, secret entry, or product judgement.

For substantial technical tasks, return:
1. what changed
2. tests/checks run
3. deployment status
4. production/test link
5. anything requiring manual product validation

Stop after the requested scope. Do not automatically start the next major feature.
