import { invoke } from '@tauri-apps/api/core';
import type { ToolCallHandler } from './types';

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function envObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((env, [key, rawValue]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return env;
    env[normalizedKey] = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
    return env;
  }, {});
}

export const mcpServerToolCallHandler: ToolCallHandler = {
  names: ['propose_mcp_server'],
  handle: ({ registrations, toolCall }) => {
    const name = stringValue(toolCall.args?.name);
    const transport = stringValue(toolCall.args?.transport).toLowerCase() === 'sse' ? 'sse' : 'cli';
    const command = stringValue(toolCall.args?.command);
    const url = stringValue(toolCall.args?.url);
    const description = stringValue(toolCall.args?.description) || 'MCP server configured by the agent.';
    const reason = stringValue(toolCall.args?.reason) || `Am pregătit configurarea MCP pentru ${name || 'server'}.`;

    registrations.forEach((registration) => {
      registration.update((message) => ({
        ...message,
        body: message.body.trim().length > 0 ? message.body : reason
      }));
    });

    if (!name || (transport === 'cli' && !command) || (transport === 'sse' && !url)) {
      return;
    }

    void invoke('mcp_upsert_server', {
      request: {
        name,
        description,
        transport,
        command: transport === 'cli' ? command : null,
        args: transport === 'cli' ? stringArray(toolCall.args?.args) : [],
        url: transport === 'sse' ? url : null,
        env: transport === 'cli' ? envObject(toolCall.args?.env) : {},
        headers: transport === 'sse' ? envObject(toolCall.args?.headers) : {},
        disabled: false
      }
    }).then(() => {
      registrations.forEach((registration) => {
        registration.update((message) => ({
          ...message,
          body: `${message.body.trim()}\n\nServerul MCP "${name}" a fost adăugat în configurația locală.`
        }));
      });
    }).catch((error) => {
      registrations.forEach((registration) => {
        registration.update((message) => ({
          ...message,
          body: `${message.body.trim()}\n\nNu am putut salva MCP-ul: ${error instanceof Error ? error.message : String(error)}`
        }));
      });
    });
  }
};
