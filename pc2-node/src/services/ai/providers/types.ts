/**
 * Shared type definitions for AI provider implementations.
 *
 * Extracted from OllamaProvider.ts per Phase 2-A (ticket
 * .cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-A-TYPES-EXTRACTION.md).
 *
 * These types describe the common shape of chat completions across every
 * provider (Ollama, Claude, Gemini, xAI, OpenAI). They have zero runtime
 * dependencies — this file compiles to nothing at the JS level and exists
 * only to give the TypeScript compiler a shared vocabulary.
 *
 * If you need to add a new field that is provider-specific (e.g. Ollama's
 * `think_blocks`), keep it inside that provider's own file. This file is
 * for the common contract only.
 */

export interface ChatModel {
  id: string;
  name: string;
  max_tokens: number;
  costs_currency: string;
  costs: {
    tokens: number;
    input_token: number;
    output_token: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

export interface CompleteArguments {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  tools?: any[];
  max_tokens?: number;
  temperature?: number;
}

export interface PerformanceMetrics {
  tokensPerSecond: number;
  evalCount: number;
  evalDurationMs: number;
  promptEvalDurationMs?: number;
}

export interface ChatCompletion {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  done: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  performance?: PerformanceMetrics;
}
