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
export const normalizeSingleMessage = (
  message: string | any,
  params: { role?: string } = {}
): NormalizedMessage => {
  params = Object.assign({ role: 'user' }, params);

  if (typeof message === 'string') {
    message = {
      content: [message],
    };
  }

  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('each message must be a string or object');
  }

  if (!message.role) {
    message.role = params.role;
  }

  if (!message.content) {
    if (message.tool_calls) {
      message.content = [];
      for (let i = 0; i < message.tool_calls.length; i++) {
        const toolCall = message.tool_calls[i];
        message.content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments,
        });
      }
      delete message.tool_calls;
    } else {
      throw new Error('each message must have a \'content\' property');
    }
  }

  if (!Array.isArray(message.content)) {
    message.content = [message.content];
  }

  // Coerce each content block into an object
  for (let i = 0; i < message.content.length; i++) {
    if (typeof message.content[i] === 'string') {
      message.content[i] = {
        type: 'text',
        text: message.content[i],
      };
    }
    if (!message || typeof message.content[i] !== 'object' || Array.isArray(message.content[i])) {
      throw new Error('each message content item must be a string or object');
    }
    if (typeof message.content[i].text === 'string' && !message.content[i].type) {
      message.content[i].type = 'text';
    }
  }

  // Remove "text" properties from content blocks with type=tool_use
  for (let i = 0; i < message.content.length; i++) {
    if (message.content[i].type !== 'tool_use') {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(message.content[i], 'text')) {
      delete message.content[i].text;
    }
  }

  return message as NormalizedMessage;
};

/**
 * Normalizes an array of messages by applying normalizeSingleMessage to each,
 * then splits messages with multiple content blocks into separate messages,
 * and finally merges consecutive messages from the same role.
 */
export const normalizeMessages = (
  messages: (string | any)[],
  params: { role?: string } = {}
): NormalizedMessage[] => {
  const normalized: NormalizedMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    normalized.push(normalizeSingleMessage(messages[i], params));
  }

  // Split messages with tool_use content into separate messages
  let separated: NormalizedMessage[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const message = normalized[i];
    const separatedMessages: NormalizedMessage[] = [];
    for (let j = 0; j < message.content.length; j++) {
      if (message.content[j].type === 'tool_result') {
        separatedMessages.push({
          ...message,
          content: [message.content[j]],
        });
      } else {
        separatedMessages.push({
          ...message,
          content: [message.content[j]],
        });
      }
    }
    separated.push(...separatedMessages);
  }

  // If multiple messages are from the same role, merge them
  const merged: NormalizedMessage[] = [];
  let currentRole: string | null = null;
  for (let i = 0; i < separated.length; i++) {
    if (currentRole === separated[i].role) {
      merged[merged.length - 1].content.push(...separated[i].content);
    } else {
      merged.push(separated[i]);
      currentRole = separated[i].role;
    }
  }

  return merged;
};

/**
 * Separates system messages from other messages in the array.
 */
export const extractAndRemoveSystemMessages = (
  messages: NormalizedMessage[]
): [NormalizedMessage[], NormalizedMessage[]] => {
  const systemMessages: NormalizedMessage[] = [];
  const newMessages: NormalizedMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') {
      systemMessages.push(messages[i]);
    } else {
      newMessages.push(messages[i]);
    }
  }
  return [systemMessages, newMessages];
};

/**
 * Extracts all text content from messages, handling various message formats.
 */
export const extractText = (messages: (string | any)[]): string => {
  return messages.map(m => {
    if (typeof m === 'string') {
      return m;
    }
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return '';
    }
    if (Array.isArray(m.content)) {
      return m.content.map((c: any) => c.text || '').join(' ');
    }
    if (typeof m.content === 'string') {
      return m.content;
    } else {
      const isTextType = m.content?.type === 'text' ||
        !Object.prototype.hasOwnProperty.call(m.content, 'type');
      if (isTextType) {
        if (typeof m.content?.text !== 'string') {
          throw new Error('text content must be a string');
        }
        return m.content.text;
      }
      return '';
    }
  }).join(' ');
};

