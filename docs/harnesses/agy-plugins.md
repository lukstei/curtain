---
source: https://antigravity.google/docs/plugins.md
lastUpdated: 2026-09-23
---

# Plugins

Plugins package reusable skills, background subagents, linting rules, Model Context Protocol (MCP) servers, and lifecycle hooks into a single deployable asset.

## Directory structure

A plugin is a directory containing a required manifest file (`plugin.json`) and optional subdirectories for different customization types:

```
plugins/<plugin-name>/
├── plugin.json       # Required marker and manifest file
├── mcp_config.json   # Optional MCP server definitions
├── hooks.json        # Optional hooks definition
├── skills/           # Optional skills directory
│   └── <skill-name>/
│       └── SKILL.md
├── agents/           # Optional subagent definition templates
│   └── <agent-name>.md
└── rules/            # Optional rules directory
    └── <rule-name>.md
```

### Manifest file (`plugin.json`)

Every plugin requires a `plugin.json` file at its root to identify the directory as a plugin and define its metadata:

```
{
  "$schema": "https://antigravity.google/schemas/v1/plugin.json",
  "name": "my-custom-plugin",
  "description": "A brief description of what my plugin does."
}
```

#### Field reference

| Field | Type | Required | Description |
| :-- | :-- | :-- | :-- |
| `name` | String | **Yes** (CLI) / Optional (2.0 & IDE) | The unique, machine-readable name of the plugin (matches `^[a-zA-Z0-9-_]+$`). Required when managing plugins via Antigravity CLI commands; defaults to the folder name if omitted in Antigravity 2.0 or Antigravity IDE. |
| `description` | String | No | A brief human-readable description of the plugin’s purpose, displayed in plugin listings. |

#### Automatic validation

To enable automatic autocomplete and validation in editors like VS Code or JetBrains IDEs, include the `$schema` key pointing to the official schema URL:

```
"$schema": "https://antigravity.google/schemas/v1/plugin.json"
```

#### Full JSON Schema

```
{
  "$schema": "https://antigravity.google/schemas/v1/plugin.json",
  "title": "Antigravity Plugin Manifest",
  "description": "Schema for Antigravity plugin manifest files (plugin.json)",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The unique, machine-readable name of the plugin. Must contain only alphanumeric characters, hyphens, and underscores.",
      "pattern": "^[a-zA-Z0-9-_]+$"
    },
    "description": {
      "type": "string",
      "description": "A brief human-readable description of the plugin's purpose and capabilities."
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
```

### Supported components

A plugin can contain any of the following components:

*   `skills/`: subdirectories containing a `SKILL.md` file with instructions for the agent.
*   `agents/`: markdown files defining custom subagents and persona configurations.
*   `rules/`: markdown files defining behavioral constraints or style guidelines.
*   `mcp_config.json`: declarations connecting Antigravity to external tool servers.
*   `hooks.json`: event handlers executing shell commands before or after tool calls.

## Managing plugins by surface

Follow the instructions below to install and manage plugins on your preferred surface:

*   [Antigravity 2.0](#tab-panel-38)
*   [Antigravity CLI](#tab-panel-39)
*   [Antigravity IDE](#tab-panel-40)

### Bundled plugins

Antigravity 2.0 provides curated plugins created by Google that you can install directly from the application interface:

1.  Open the **Customizations** panel.
2.  Browse available plugins and select **Install**.
3.  To learn more about available Google plugins, refer to the [Build with Google](/docs/build-with-google) guide.

### Manual plugin installation

You can install custom plugins by placing their directories in either of the following locations:

*   **Workspace level**: place your plugin folder in `.agents/plugins/` at the root of your workspace. The plugin activates only when working in that project.
*   **Global level**: place your plugin folder in `~/.gemini/config/plugins/`. The plugin activates across all workspaces on your workstation.

### CLI plugin management

The Antigravity CLI exposes the `agy plugin` subcommand pipeline to manage extensions:

*   **List installed plugins**: list all active packages and their loaded components:
    
    ```
    agy plugin list
    ```
    
*   **Install a plugin**: stage a local package directory into your profile:
    
    ```
    agy plugin install /path/to/local/plugin
    ```
    
*   **Enable or disable a plugin**: toggle a plugin without removing its files:
    
    ```
    agy plugin disable <plugin_name>
    agy plugin enable <plugin_name>
    ```
    
*   **Uninstall a plugin**: remove the plugin files and clean up configuration registries:
    
    ```
    agy plugin uninstall <plugin_name>
    ```
    

### CLI filesystem location

When installed, the CLI stages plugin assets in your global configuration directory:

```
~/.gemini/antigravity-cli/plugins/<plugin_name>/
```

### Next steps

*   [Migration from Gemini CLI](/docs/cli/gcli-migration)
*   [Troubleshooting](/docs/cli/troubleshooting)
*   [Permissions & Sandbox](/docs/sandbox?tab=cli)

### Standalone IDE plugin installation

In the standalone Antigravity IDE, plugins can be loaded locally or globally:

*   **Workspace level**: save plugin folders to `.agents/plugins/` in your project root.
*   **Global level**: save plugin folders to `~/.gemini/config/plugins/` to activate them across all IDE windows.
*   **Editor settings**: access the **Customizations** dropdown from the agent side panel to review active plugin components and inspect loaded skills.