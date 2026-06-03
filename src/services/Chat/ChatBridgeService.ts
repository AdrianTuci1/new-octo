/**
 * ChatBridgeService
 * ───────────────────────────────────────────
 * Pattern: **Bridge** (decouples agent event stream from chat consumers)
 * Re-exports the agent event bridge from hooks/useChat/bridge.
 */
export { ensureAgentEventBridge, setAssistantRegistration, deleteOwnerRegistrations, assistantRegistrations } from '../../hooks/chat/bridge';
