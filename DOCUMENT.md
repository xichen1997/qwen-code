# Qwen CLI Assistant: Q&A Summary

## 1. What does `prompts.ts` do?
- **Answer:**
  - Defines and exports functions that generate system prompts (instructions) for the AI agent.
  - `getCoreSystemPrompt`: Generates the main system prompt, setting rules and guidelines for the agent’s behavior.
  - `getCompressionPrompt`: Provides a prompt for summarizing chat history into a structured XML snapshot for memory management.

## 2. What does `gemini.tsx` do?
- **Answer:**
  - Main entry point for the CLI application.
  - Handles startup, configuration, authentication, sandboxing, and launching either the interactive UI or non-interactive mode.
  - Manages extension loading, error handling, and cleanup.

## 3. Workflow Graph for CLI
- **Answer:**
  - Provided a Mermaid diagram showing the flow from startup, through configuration, mode selection, and eventual exit.

## 4. Where is the React/Ink UI file?
- **Answer:**
  - The main UI is in `packages/cli/src/ui/App.tsx`, which defines `AppWrapper` and `App` components for the interactive CLI.

## 5. Explain `App.tsx` and its workflow
- **Answer:**
  - `AppWrapper` provides context and renders `App`.
  - `App` manages state, effects, and UI logic for authentication, themes, editor, user input, and more.
  - Workflow graph provided, showing initialization, dialogs, main loop, and exit.

## 6. Main Interaction Part
- **Answer:**
  - Handles user input, displays assistant responses, and provides real-time feedback.
  - Components: `LoadingIndicator`, `ContextSummaryDisplay`, `InputPrompt`.
  - Workflow: Idle → User Input → Submission → Processing → Response → Context Updates.

## 7. What happens when user submits input in InputPrompt?
- **Answer:**
  - Calls `onSubmit`, which triggers `submitQuery`.
  - Handles slash commands, shell commands, or regular questions.
  - For regular questions, sends to assistant and updates UI with the response.

## 8. Where is the assistant code for regular questions?
- **Answer:**
  - In `useGeminiStream` (packages/cli/src/ui/hooks/useGeminiStream.ts`).
  - `submitQuery` prepares and sends the query to Gemini, streams the response, and updates the UI.

## 9. Explain `useGeminiStream`
- **Answer:**
  - Custom React hook managing the lifecycle of sending queries to Gemini, handling streaming, tool calls, errors, and UI updates.
  - Returns state and functions for the UI to use.

## 10. How does it manage tool calls?
- **Answer:**
  - Receives tool call requests from Gemini.
  - Schedules and tracks tool execution with `useReactToolScheduler`.
  - Updates UI with progress and results, integrates results into the conversation, and handles errors/cancellations.

## 11. Who plans the tasks: Gemini or GeminiStream?
- **Answer:**
  - Gemini (the model) plans the tasks and tool usage.
  - `useGeminiStream` executes and manages the tasks as instructed by Gemini.

## 12. What happens if a task fails?
- **Answer:**
  - Error is added to conversation history and sent to Gemini.
  - Gemini decides how to recover (apologize, retry, ask for clarification, etc.).
  - User can also intervene.

## 13. Where is the code for Gemini’s recovery logic?
- **Answer:**
  - Not in the codebase; handled by the Gemini model (LLM) itself, which is accessed via API.

## 14. Where is the code that adds errors to history and sends to Gemini?
- **Answer:**
  - In `useGeminiStream.ts`, errors are added with `addItem` and the full history is sent to Gemini with `sendMessageStream`.

## 15. If I want to use an open-source model instead of Gemini, what should I change?
- **Answer:**
  - Replace the Gemini client and related config with your model’s client/API.
  - Adapt tool call protocol, prompt formatting, and streaming logic as needed.

## 16. What system prompt should I use for an open-source tool-calling model?
- **Answer:**
  - Edit the system prompt (in `prompts.ts` or `.md` file) to clearly describe available tools, tool call format, and expected behavior.
  - Remove Gemini-specific instructions and match your model’s requirements. 