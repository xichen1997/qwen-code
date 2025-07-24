# Qwen Code - Command Parsing and Agent Loop Architecture

This document provides a comprehensive technical overview of how Qwen Code parses commands and implements its agent loop system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Command Parsing System](#command-parsing-system)
4. [Agent Loop Implementation](#agent-loop-implementation)  
5. [Tool Execution System](#tool-execution-system)
6. [Streaming and UI Updates](#streaming-and-ui-updates)
7. [Error Handling and State Management](#error-handling-and-state-management)
8. [Advanced Features](#advanced-features)

## Architecture Overview

Qwen Code is built as a **monorepo** with two main packages implementing a sophisticated streaming agent architecture:

- **`packages/cli/`** - CLI interface and user interaction components
- **`packages/core/`** - Core logic, AI client, and tool system

The system follows this high-level flow:
```
User Input → Command Processing → AI Generation → Tool Execution → Response Streaming → UI Updates
```

## Project Structure

### Key Entry Points
- **`packages/cli/index.ts`** - Main CLI entry point
- **`packages/cli/src/gemini.tsx`** - Core application bootstrap (`main()` function)
- **`packages/cli/src/ui/App.tsx`** - Main React component for interactive UI

### Command Processing Infrastructure
- **`packages/cli/src/config/config.ts`** - CLI argument parsing with yargs (`parseArguments()`)
- **`packages/cli/src/nonInteractiveCli.ts`** - Non-interactive mode execution (`-p` flag)
- **`packages/cli/src/services/CommandService.ts`** - Slash command management service

### Command Processors
- **`packages/cli/src/ui/hooks/slashCommandProcessor.ts`** - Slash commands (`/help`, `/clear`, `/auth`)
- **`packages/cli/src/ui/hooks/shellCommandProcessor.ts`** - Shell command execution
- **`packages/cli/src/ui/hooks/atCommandProcessor.ts`** - File reference commands (`@filename.txt`)

### Core Agent Loop
- **`packages/core/src/core/client.ts`** - Main conversation loop with Gemini
- **`packages/core/src/core/coreToolScheduler.ts`** - Tool call scheduling and execution
- **`packages/cli/src/ui/hooks/useGeminiStream.ts`** - Streaming communication with API
- **`packages/core/src/services/loopDetectionService.ts`** - Infinite loop prevention

## Command Parsing System

### CLI Argument Parsing

**File: `packages/cli/src/config/config.ts`**

The system uses **yargs** for CLI argument parsing:

```typescript
export async function parseArguments(): Promise<CliArgs> {
  const yargsInstance = yargs(hideBin(process.argv))
    .scriptName('qwen')
    .option('model', { alias: 'm', type: 'string', ... })
    .option('prompt', { alias: 'p', type: 'string', ... })
    .option('sandbox', { alias: 's', type: 'boolean', ... })
    // ... additional options
}
```

**Key CLI Options:**
- `-p/--prompt` - Non-interactive mode with direct prompt
- `-i/--prompt-interactive` - Execute prompt then continue interactively  
- `-m/--model` - Specify AI model to use
- `-s/--sandbox` - Enable sandbox execution
- `-y/--yolo` - Auto-approve all tool calls
- `-d/--debug` - Enable debug mode

### Dual Mode Operation

The application supports two execution modes:

1. **Interactive Mode** - React-based UI using Ink framework
2. **Non-Interactive Mode** - Direct execution for scripting/automation

**Mode Selection Logic:**
```typescript
const shouldBeInteractive = 
  !!argv.promptInteractive || 
  (process.stdin.isTTY && input?.length === 0);

if (shouldBeInteractive) {
  // Render React UI
  render(<AppWrapper />);
} else {
  // Run non-interactive mode
  await runNonInteractive(config, input, prompt_id);
}
```

### Command Type Processing

**File: `packages/cli/src/ui/hooks/useGeminiStream.ts`**

The system processes multiple command types through the `prepareQueryForGemini()` function:

#### 1. Slash Commands (`/command`)
```typescript
// Examples: /help, /clear, /auth, /tools, /mcp
const slashResult = await handleSlashCommand(trimmed);
if (slashResult !== false) {
  return handleSlashCommandResult(slashResult);
}
```

#### 2. At Commands (`@filename`)  
```typescript
// File reference commands like @package.json, @src/file.ts
if (isAtCommand(trimmed)) {
  return await handleAtCommand(trimmed, config, addItem);
}
```

#### 3. Shell Commands (when shell mode active)
```typescript
// Direct shell execution when shellModeActive is true
if (shellModeActive && !trimmed.startsWith('/')) {
  return handleShellCommand(trimmed);
}
```

#### 4. Regular AI Queries
```typescript
// Standard conversation with the AI model
return await submitToGemini(query);
```

### Slash Command System

**File: `packages/cli/src/ui/hooks/slashCommandProcessor.ts`**

Qwen Code implements a hybrid command system:

#### New Command System (Tree-based)
```typescript
// Hierarchical command structure with subcommands
const commands: SlashCommand[] = [
  {
    name: 'memory',
    subCommands: [
      { name: 'add', action: ... },
      { name: 'clear', action: ... }
    ]
  }
];
```

#### Legacy Command System (Flat)
```typescript
// Flat command structure for backward compatibility
const legacyCommands: LegacySlashCommand[] = [
  { name: 'docs', action: ... },
  { name: 'stats', action: ... },
  { name: 'tools', action: ... }
];
```

**Built-in Commands:**
- `/help` - Show help dialog
- `/clear` - Clear conversation history
- `/docs` - Open documentation
- `/stats [model|tools]` - Show session statistics
- `/tools [desc]` - List available tools
- `/mcp [desc|schema]` - List MCP servers and tools
- `/chat <save|resume|list> <tag>` - Manage conversation checkpoints
- `/quit` - Exit the application

## Agent Loop Implementation

### Main Conversation Loop

**File: `packages/core/src/core/client.ts`**

The `GeminiClient.sendMessageStream()` method orchestrates the complete agent loop:

```typescript
async *sendMessageStream(
  request: PartListUnion,
  signal: AbortSignal,
  prompt_id: string,
  turns: number = this.MAX_TURNS
): AsyncGenerator<ServerGeminiStreamEvent, Turn>
```

**Core Loop Features:**
- **Turn Management** - Limits recursive tool calls (max 100 turns)
- **Loop Detection** - Prevents infinite tool call cycles  
- **Chat Compression** - Auto-compresses history at 70% token limit
- **Model Fallback** - Switches to Flash model on quota errors
- **Next Speaker Detection** - Determines if model should continue

### Turn Processing

**File: `packages/core/src/core/turn.ts`**

Each conversation turn is managed by the `Turn` class:

```typescript
async *run(req: PartListUnion, signal: AbortSignal): AsyncGenerator<ServerGeminiStreamEvent>
```

**Generated Event Types:**
- `Content` - Text content chunks from AI
- `ToolCallRequest` - AI requests tool execution
- `Thought` - AI reasoning (for supported models)
- `Error` - Error conditions
- `UserCancelled` - User cancellation
- `ChatCompressed` - History compression events
- `LoopDetected` - Infinite loop detection

### Streaming Architecture

**File: `packages/cli/src/ui/hooks/useGeminiStream.ts`**

The streaming system processes events in real-time:

```typescript
const processGeminiStreamEvents = useCallback(async (
  eventStream: AsyncGenerator<ServerGeminiStreamEvent>,
  signal: AbortSignal
): Promise<StreamProcessingStatus> => {
  for await (const event of eventStream) {
    switch (event.type) {
      case ServerGeminiEventType.Content:
        // Update text display incrementally
        break;
      case ServerGeminiEventType.ToolCallRequest:
        // Schedule tool execution
        break;
      case ServerGeminiEventType.Thought:
        // Display AI reasoning
        break;
      // ... handle other event types
    }
  }
});
```

**Performance Optimizations:**
- **Message Splitting** - Large messages split at safe markdown points
- **Incremental Updates** - Text appears character by character
- **Static Rendering** - Completed messages use Ink's `<Static>` component

## Tool Execution System

### Tool Call Lifecycle

**File: `packages/core/src/core/coreToolScheduler.ts`**

Tool calls progress through a defined state machine:

```
validating → awaiting_approval → scheduled → executing → success|error|cancelled
```

**State Definitions:**
- `validating` - Checking tool parameters
- `awaiting_approval` - Waiting for user confirmation
- `scheduled` - Queued for execution
- `executing` - Currently running
- `success` - Completed successfully
- `error` - Failed with error
- `cancelled` - User cancelled

### Tool Scheduler Features

```typescript
export class CoreToolScheduler {
  async scheduleTools(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
    toolRegistry: ToolRegistry,
    approvalMode: ApprovalMode,
    getPreferredEditor?: () => EditorType | undefined
  ): Promise<ToolCallResponseInfo[]>
}
```

**Key Capabilities:**
- **Validation** - Parameter validation against tool schemas
- **Approval Flow** - User confirmation for destructive operations
- **Parallel Execution** - Multiple tools can run concurrently
- **Error Handling** - Proper error capture and reporting
- **Live Output** - Real-time output streaming for long-running tools

### Tool Registry

**File: `packages/core/src/tools/tool-registry.ts`**

The tool system supports multiple tool sources:

1. **Built-in Tools** - Core functionality (file operations, shell, web search)
2. **MCP Tools** - Model Context Protocol servers
3. **Extension Tools** - From loaded extensions

**Tool Categories:**
- **File Operations** - Read, Edit, Write, Glob, Grep
- **Shell Execution** - Bash command execution
- **Web Operations** - WebFetch, WebSearch
- **Development** - Git operations, project management  
- **Utility** - TodoWrite, NotebookRead/Edit

## Streaming and UI Updates

### React Integration

**File: `packages/cli/src/ui/hooks/useGeminiStream.ts`**

The streaming system integrates with React through custom hooks:

```typescript
export const useGeminiStream = (
  geminiClient: GeminiClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  // ... other parameters
) => {
  const [streamingState, setStreamingState] = useState<StreamingState>(StreamingState.Idle);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  // ... state management
};
```

### UI State Management

**Streaming States:**
- `Idle` - Waiting for user input
- `Responding` - AI is generating response
- `WaitingForConfirmation` - Tool approval needed

**History Management:**
```typescript
interface HistoryItem {
  id: number;
  type: MessageType;
  text?: string;
  // ... type-specific properties
}
```

**Message Types:**
- `USER` - User messages
- `GEMINI` - AI responses
- `TOOL_GROUP` - Tool execution groups
- `ERROR` - Error messages
- `INFO` - System information
- `STATS` - Usage statistics

## Error Handling and State Management

### Error Handling Strategy

**Authentication Errors:**
```typescript
if (error instanceof UnauthorizedError) {
  onAuthError();
  return;
}
```

**API Errors:**
```typescript
const errorMessage = parseAndFormatApiError(error);
addItem({
  type: MessageType.ERROR,
  text: errorMessage
}, Date.now());
```

**Tool Errors:**
```typescript
// Tool errors are captured and fed back to the model
const toolResponse: ToolCallResponseInfo = {
  request: toolRequest,
  response: { error: errorMessage },
  durationMs: executionTime
};
```

### State Management

**Abort Handling:**
```typescript
// User can cancel operations with ESC key
useInput((input, key) => {
  if (key.escape && streamingState === StreamingState.Responding) {
    abortControllerRef.current?.abort();
    turnCancelledRef.current = true;
  }
});
```

**Memory Management:**
```typescript
// Automatic chat compression at 70% token limit
if (tokenCount > (tokenLimit * COMPRESSION_TOKEN_THRESHOLD)) {
  const compressed = await this.tryCompressChat(prompt_id, false);
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, compression: compressed };
  }
}
```

## Advanced Features

### Loop Detection

**File: `packages/core/src/services/loopDetectionService.ts`**

```typescript
export class LoopDetectionService {
  checkForLoop(toolCall: ToolCallRequestInfo): boolean {
    // Detects repeated tool calls with same parameters
    // Prevents infinite execution cycles
  }
}
```

### Chat Compression

**File: `packages/core/src/core/client.ts`**

```typescript
async tryCompressChat(prompt_id: string, force: boolean = false): Promise<ChatCompressionInfo | null> {
  // Uses AI to summarize chat history
  // Maintains context while reducing token count
  // Keeps most recent 30% of conversation
}
```

### Model Fallback

```typescript
private async handleFlashFallback(authType?: string, error?: unknown): Promise<string | null> {
  // Automatically switches to Flash model on quota errors
  // Transparent to user experience
  // Logs model switches for monitoring
}
```

### Checkpointing System

**File: `packages/core/src/core/logger.ts`**

```typescript
async saveCheckpoint(history: Content[], tag: string): Promise<void> {
  // Saves conversation state for later restoration
  // Includes chat history and file states
  // Enables /chat resume functionality
}
```

### Memory System

**File: `packages/cli/src/config/config.ts`**

```typescript
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService
): Promise<{ memoryContent: string; fileCount: number }> {
  // Loads QWEN.md files from project hierarchy
  // Provides contextual information to AI
  // Includes project structure and guidelines
}
```

## Complete Flow Summary

1. **Initialization**
   - Parse CLI arguments with yargs
   - Load settings and extensions
   - Initialize Config object
   - Set up authentication

2. **Mode Selection**
   - Interactive: Render React UI with Ink
   - Non-interactive: Direct execution

3. **User Input Processing**
   - Capture input through text buffer
   - Process different command types
   - Validate and prepare for AI

4. **AI Generation**
   - Stream request to Gemini API
   - Process streaming events
   - Handle tool call requests

5. **Tool Execution**
   - Schedule and validate tools
   - Request user approval if needed
   - Execute tools with live output
   - Format results for AI

6. **Response Completion**
   - Submit tool results back to AI
   - Continue conversation if needed
   - Update UI with final state

7. **State Management**
   - Maintain conversation history
   - Handle errors and cancellations
   - Compress context when needed
   - Save checkpoints for restoration

This architecture provides a robust, streaming-based agent system that can handle complex multi-turn conversations with tool execution while maintaining excellent user experience and system reliability.