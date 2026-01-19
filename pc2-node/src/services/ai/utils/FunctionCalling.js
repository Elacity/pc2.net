/**
 * Function Calling Utilities
 * Adapted from Puter's FunctionCalling.js
 * Normalizes tool definitions for different AI providers
 */
/**
 * Normalizes a JSON schema recursively
 */
export const normalizeJsonSchema = (schema) => {
    if (!schema)
        return schema;
    if (schema.type === 'object') {
        if (!schema.properties) {
            return schema;
        }
        const keys = Object.keys(schema.properties);
        for (const key of keys) {
            schema.properties[key] = normalizeJsonSchema(schema.properties[key]);
        }
    }
    if (schema.type === 'array') {
        if (!schema.items) {
            schema.items = { type: 'string' };
        }
        else {
            schema.items = normalizeJsonSchema(schema.items);
        }
    }
    return schema;
};
/**
 * Normalizes the 'tools' object in-place.
 * Accepts an array of tools and produces a normalized object
 * that can be converted to the appropriate representation for another service.
 * Prioritizes OpenAI convention when conflicting conventions are present.
 */
export const normalizeToolsObject = (tools) => {
    for (let i = 0; i < tools.length; i++) {
        const tool = tools[i];
        let normalizedTool = {
            type: 'function',
            function: {
                name: '',
                parameters: { type: 'object' }
            }
        };
        const normalizeFunction = (fn) => {
            const normalFn = {};
            let parameters = fn.parameters || fn.input_schema;
            normalFn.parameters = (parameters ?? { type: 'object', properties: {} });
            if (parameters?.properties) {
                parameters = normalizeJsonSchema(parameters);
            }
            if (fn.name) {
                normalFn.name = fn.name;
            }
            if (fn.description) {
                normalFn.description = fn.description;
            }
            return normalFn;
        };
        if (tool.input_schema) {
            normalizedTool = {
                type: 'function',
                function: normalizeFunction(tool),
            };
        }
        else if (tool.type === 'function') {
            normalizedTool = {
                type: 'function',
                function: normalizeFunction(tool.function),
            };
        }
        else {
            normalizedTool = {
                type: 'function',
                function: normalizeFunction(tool),
            };
        }
        tools[i] = normalizedTool;
    }
    return tools;
};
/**
 * Converts a normalized tools object to the format expected by OpenAI.
 */
export const makeOpenAiTools = (tools) => {
    return tools;
};
/**
 * Converts a normalized tools object to the format expected by Claude.
 */
export const makeClaudeTools = (tools) => {
    if (!tools)
        return undefined;
    return tools.map(tool => {
        const { name, description, parameters } = tool.function;
        return {
            name,
            description,
            input_schema: parameters,
        };
    });
};
//# sourceMappingURL=FunctionCalling.js.map