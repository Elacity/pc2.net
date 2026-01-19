/**
 * Message Utilities
 * Adapted from Puter's Messages.js
 * Normalizes messages for different AI providers
 */
export interface MessageContent {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
}
export interface NormalizedMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: MessageContent[];
}
/**
 * Normalizes a single message into a standardized format with role and content array.
 */
export declare const normalizeSingleMessage: (message: string | any, params?: {
    role?: string;
}) => NormalizedMessage;
/**
 * Normalizes an array of messages by applying normalizeSingleMessage to each,
 * then splits messages with multiple content blocks into separate messages,
 * and finally merges consecutive messages from the same role.
 */
export declare const normalizeMessages: (messages: (string | any)[], params?: {
    role?: string;
}) => NormalizedMessage[];
/**
 * Separates system messages from other messages in the array.
 */
export declare const extractAndRemoveSystemMessages: (messages: NormalizedMessage[]) => [NormalizedMessage[], NormalizedMessage[]];
/**
 * Extracts all text content from messages, handling various message formats.
 */
export declare const extractText: (messages: (string | any)[]) => string;
//# sourceMappingURL=Messages.d.ts.map