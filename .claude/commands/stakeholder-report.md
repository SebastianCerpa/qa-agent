---
description: Produce a plain-English QA status summary for non-technical stakeholders, via the stakeholder-reporter subagent.
argument-hint: "[period, default: last 7 days]"
---

Delegate to the **`stakeholder-reporter`** subagent (via the Agent tool) to summarize QA health in `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`) over `$ARGUMENTS` (a period; default to the last 7 days if not given).

Relay the subagent's summary back to the user as-is.

**Never send or post this report anywhere (email, Slack, GitHub, etc.) on the user's behalf** — deliver the text and stop. Sending it is the user's own action, only after they've read and approved it.
