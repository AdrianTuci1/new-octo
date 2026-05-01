# 🐙 Octomus Launcher
> A next-generation, autonomous AI-native launcher shell built with **Tauri**, **Rust**, and **React**.

Octomus is more than a launcher; it's an intelligent agent orchestrator inspired by the architecture of Warp. It bridges the gap between Large Language Models and your local system through a high-performance, resilient agent harness.

---

## 🚀 Advanced AI Capabilities

### 🧠 Agent Harness & Autonomous Loops
At the core of Octomus is the **Agent Harness**, a robust Rust-based execution environment that enables:
- **Iterative Tool-Use**: Beyond simple chat, the agent can execute local commands, read files, and iterate based on system feedback.
- **Resilient Streaming**: Advanced event-driven communication between the Rust backend and React frontend with built-in retry logic.
- **Stateful Orchestration**: Comprehensive management of conversation history and tool execution states.
- *See more in [Autonomous Agent Loop](docs/06_autonomous_agent_loop.md) and [Agent Harness](src-tauri/src/ai/harness.rs).*

### 🔌 MCP (Model Context Protocol) Integration
Octomus implements the **Model Context Protocol**, allowing the agent to extend its capabilities dynamically:
- **Server Orchestration**: Manage multiple MCP servers (stdio/SSE) to provide the agent with specialized tools (SQL, Google Search, local filesystem, etc.).
- **Dynamic Context**: Inject real-time data from external sources directly into the LLM's reasoning process.
- *See more in [MCP Integration Guide](docs/05_mcp_integration.md).*

### 💡 Intelligent Guidance & Predict
The UI is designed to be proactive, not just reactive:
- **Agent Tips**: Passive, contextual suggestions that help users discover advanced features and terminal shortcuts.
- **Predictive UI**: Anticipates the next command or question based on the current terminal output and git context.
- *See more in [Predict & Tips Documentation](docs/07_predict_and_tips.md).*

---

## 🏗️ Technical Architecture

- **Backend**: Rust + Tauri (for system-level access and high-performance AI orchestration).
- **Frontend**: React + Vite (for a premium, low-latency spotlight interface).
- **Inter-process**: Custom event-sinking system for real-time AI token streaming and tool-call lifecycle management.

---

## 📚 Deep Dive Documentation

Explore our internal architectural guides:
- [01 Chain of Thought](docs/01_chain_of_thought.md)
- [02 Tool Call Lifecycle](docs/02_tool_call_lifecycle.md)
- [03 Conversation Exchange Model](docs/03_conversation_exchange_model.md)
- [05 MCP Integration](docs/05_mcp_integration.md)
- [06 Autonomous Agent Loop](docs/06_autonomous_agent_loop.md)
- [07 Predict & Agent Tips](docs/07_predict_and_tips.md)

---

## 🛠️ Development Setup

### First Run
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment**:
   Copy `.env.example` to `.env` and configure your AI provider (OpenAI/Anthropic compatible).

3. **Start Development**:
   ```bash
   npm run dev:app
   ```

### Useful Commands
- `npm run dev:app` - Runs the Tauri app in the foreground.
- `npm run tauri -- dev` - Raw Tauri dev command.
- `npm run logs` - Tails the development logs.

### Prerequisites
- [Rust Toolchain](https://rustup.rs/) (cargo & rustc)
- Node.js (v18+)

---

Developed with ❤️ by the Octomus Team.
