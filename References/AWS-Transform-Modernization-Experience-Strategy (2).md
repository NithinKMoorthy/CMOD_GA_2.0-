## AWS Transform Modernization Experience Strategy

## Objective

Define a cohesive modernization experience across AWS Transform Custom and Continuous Modernization that makes ATX’s specialization visible and progressively earns customers’ trust to delegate more complex work.

### North Star

**AWS Transform should feel like one specialized modernization system that understands the customer’s objective, accumulates knowledge about their software estate, guides the work with expert judgment, makes its competence visible, and progressively earns the right to take on more consequential modernization.**

> **Goal-oriented. Purpose-built. Expert-guided. Trustworthy.**

---

## Why ATX Must Win

Developers can already use general-purpose coding agents such as Claude Code or Codex to analyze repositories, identify technical debt, and perform many modernization tasks. The customer decision is therefore increasingly **build vs. buy**:

ATX needs to justify the **buy** decision in two ways:

**1. Win on outcomes**\
As modernization becomes more complex, heterogeneous, organization-specific, and continuous, ATX should demonstrate better modernization economics and quality through **lower total cost, faster completion, greater accuracy and completeness, stronger validation, and higher reliability at scale.**

**2. Win on experience**\
ATX should make that specialization perceptible. It should understand the modernization objective and software context, guide the customer toward the right decisions, make progress and risk visible, preserve knowledge and modernization state, and provide confidence as customers delegate increasingly consequential work.

> **ATX must both produce specialized modernization outcomes and feel like the specialized system responsible for producing them.**

---

## Two Modernization Motions

**Custom: Known modernization objective**\
Optimized for bounded transformation campaigns where the target state is understood and the customer needs to define, validate, and repeat a transformation across codebases.

**Known need → prove → validate → campaign → scale**

**Continuous Modernization: Ongoing estate improvement**\
Optimized for continuously understanding an estate, identifying what should be modernized, driving remediation, validating outcomes, and reassessing as the environment evolves.

**Connect → understand → prioritize → remediate → validate → reassess**

---

## Where the Experience Falls Short

### 1. ATX does not yet feel like one modernization system

Custom, CM, web, chat, CLI, and non-interactive execution expose related capabilities through different interaction models, terminology, navigation, and state. Customers may need to understand ATX’s internal product structure before they can accomplish their goal.

### 2. Continuous Modernization does not yet operate as a continuous lifecycle

CM can identify findings and execute available remediations, but the workflow can break as findings move toward resolution. If no remediation exists, the path forward is unclear. If remediation succeeds, customers can still lack visibility into what changed, which branch was created, whether validation succeeded, and what should happen next.

> **CM should continuously move findings toward resolution, not just continuously discover them.**

### 3. Custom is too capability-oriented instead of goal-oriented

Custom can surface Transformation Definitions and implementation choices before sufficiently understanding the application and recommending a modernization path. The developer is asked to map their problem onto ATX’s capabilities rather than having ATX diagnose the need and bring forward the right capability.

### 4. ATX capabilities are constrained by product boundaries

CM cannot currently create custom analyses, custom remediations, or Transformation Definitions when predefined capabilities are insufficient. Likewise, a transformation proven through Custom does not naturally transition into continuous estate-wide operation through CM.

### 5. Application understanding and modernization state do not consistently persist

Repository understanding, decisions, transformations, branches, validation results, unresolved issues, and next actions do not consistently form one durable modernization history across sessions and surfaces.

### 6. ATX’s competence is stronger than the experience makes visible

Progress, reasoning, risk, validation, errors, permissions, and recovery are surfaced unevenly, making the product feel less specialized and mature than the modernization capability underneath it.

---

## Strategic Experience Priorities

### 1. Orient ATX around the modernization goal

Understand the objective and relevant software first, then bring forward the appropriate analysis, transformation, remediation, or execution capability.

### 2. Create an expert-guided modernization experience

Recommend what should happen next, provide sensible defaults, explain meaningful tradeoffs, and involve the customer where human judgment is genuinely required.

### 3. Build persistent application and estate understanding

Each interaction should build on what ATX already knows and preserve both software context and the state of modernization work already performed.

### 4. Make ATX’s competence visible

Clearly communicate what ATX understands, recommends, is doing, has completed, validated, and expects to happen next.

### 5. Modernize the ATX developer interface

Provide professional workflow orientation, modernization-native information design, navigation, progress feedback, recovery, permissions, and consistent interaction patterns across Custom and CM.

### 6. Make Custom and CM feel like one ATX experience

Developers should not need to understand whether a task belongs to `atx`, `atx custom def exec`, or `atx ct`. They should enter one ATX experience, state the modernization objective, and access the appropriate capability through a consistent interaction model.

CLI and web should hand off cleanly. Work proven in Custom should be able to move naturally into CM for ongoing estate-wide operation, while non-interactive execution should feel like another mode of the same ATX system rather than a separate product path.

---

## Near-Term Focus

Prioritize:

- **Goal-first entry and sequencing**
- **Clear resolution paths for CM findings**
- **Custom analysis, remediation, and TD creation from CM when needed**
- **Persistent modernization state and session continuity**
- **Clear post-execution branch, validation, status, and next-step visibility**
- **Unified interactive access across** `atx`**,** `atx custom def exec`**, and** `atx ct`
- **Clean CLI ↔ web handoffs**
- **Professional TUI progress, recovery, errors, and operational tooling**

> **The goal is not one workflow. It is one specialized modernization system with distinct motions, shared context, and continuous trust.**