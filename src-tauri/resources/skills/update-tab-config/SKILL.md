---
name: update-tab-config
description: Update existing Octomus tab config TOML files from natural-language edit requests. Use when the user wants to modify a tab config that already exists or when editing a tab config file already open in Octomus.
---

# update-tab-config

Update an existing Octomus tab config in place.

## Required context

- Use the `tab-configs` skill as the canonical source of truth for:
  - schema details
  - validation rules
  - examples
  - common layout patterns

## Workflow

1. Read the existing tab config file before making changes.
2. Understand the requested edit.
3. If the request already contains the needed change, edit immediately instead of asking extra questions.
4. If a truly essential detail is missing or ambiguous, ask one short follow-up question before editing. Do not guess about layout changes, command changes, parameters, or close-time behavior.
5. Make sure you are editing the tab config that belongs to the user's current Octomus build/channel rather than assuming a single hardcoded base directory, then update it so it remains valid according to the `tab-configs` schema.
6. Preserve the user's existing structure and naming where possible unless the requested change requires restructuring.
7. Keep the response brief and practical.
