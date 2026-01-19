/**
 * Function Calling Utilities
 * Adapted from Puter's FunctionCalling.js
 * Normalizes tool definitions for different AI providers
 */
export interface NormalizedTool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: {
            type: string;
            properties?: Record<string, any>;
            required?: string[];
        };
    };
}
export interface JSONSchema {
    type: string;
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema;
    required?: string[];
}
/**
 * Normalizes a JSON schema recursively
 */
export declare const normalizeJsonSchema: (schema: JSONSchema | undefined) => JSONSchema | undefined;
/**
 * Normalizes the 'tools' object in-place.
 * Accepts an array of tools and produces a normalized object
 * that can be converted to the appropriate representation for another service.
 * Prioritizes OpenAI convention when conflicting conventions are present.
 */
export declare const normalizeToolsObject: (tools: any[]) => NormalizedTool[];
/**
 * Converts a normalized tools object to the format expected by OpenAI.
 */
export declare const makeOpenAiTools: (tools: NormalizedTool[]) => NormalizedTool[];
/**
 * Converts a normalized tools object to the format expected by Claude.
 */
export declare const makeClaudeTools: (tools: NormalizedTool[]) => any[];
//# sourceMappingURL=FunctionCalling.d.ts.map