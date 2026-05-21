---
name: create-tab-config
description: Create new Octomus tab config TOML files from natural-language requests. Use when the user wants a new tab config, a new tab layout, or asks for a slash command to generate a tab config.
---

# create-tab-config

Create a new Octomus tab config based on what the user wants.

## Required context

- Use the `tab-configs` skill as the canonical source of truth for:
  - schema details
  - validation rules
  - examples
  - common layout patterns

## Workflow

1. Understand what the user wants to create.
2. If the user already gave enough information to build the layout, generate the TOML immediately instead of asking more questions.
3. Only ask one short follow-up question if a truly essential detail is missing, such as commands, parameters, or which pane should be focused.
4. Use the Octomus tab config directory: `~/.octomus/tab_configs/` for standard builds, or the channel-specific `~/.octomus-<channel>/tab_configs/` variant when relevant.
5. Create the `tab_configs/` subdirectory if it does not exist.
6. Write the file using a descriptive snake_case filename ending in `.toml`.
7. If the intended filename might conflict with an existing config and it is unclear whether to overwrite or create a new file, use the `ask_user_question` tool.
8. Keep the response brief and practical. Prefer either:
   - the generated TOML, or
   - a single short question, if needed.
