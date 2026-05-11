---
name: open-settings-file
description: Use this skill when the user wants to inspect or edit a local Octomus configuration file such as settings, keybindings, tab config, or MCP config.
---

# open-settings-file

- First identify which config file is needed.
- Prefer Octomus paths under `~/.octomus`.
- Common targets:
  - `~/.octomus/settings.toml`
  - `~/.octomus/keybindings.yaml`
  - `~/.octomus/.mcp.json`
  - `~/.octomus/tab_configs/startup_config.toml`
  - `~/.octomus/tab_configs/my_tab_config.toml`
- If the user is unsure, map the intent to the most likely file and explain why.
