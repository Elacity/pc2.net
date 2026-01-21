/**
 * Cognitive Toolkit - Modular Reasoning Templates (IBM Zurich Pattern)
 * 
 * Implements cognitive tools that decompose complex requests into
 * structured reasoning steps. Based on IBM Zurich research showing
 * 40% improvement in complex task completion when using modular
 * reasoning templates.
 * 
 * Key cognitive tools:
 * - UNDERSTAND: Parse and clarify user intent
 * - PLAN: Break down tasks into steps
 * - EXECUTE: Carry out planned actions
 * - VERIFY: Confirm results match expectations
 * - REFLECT: Learn from outcomes for future interactions
 */

import { logger } from '../../../utils/logger.js';

/**
 * Cognitive tool types
 */
export type CognitiveToolType = 'UNDERSTAND' | 'PLAN' | 'EXECUTE' | 'VERIFY' | 'REFLECT';

/**
 * Configuration for cognitive tool injection
 */
export interface CognitiveToolConfig {
  // Which tools to enable
  enabledTools: CognitiveToolType[];
  
  // Verbosity level (1=minimal, 2=standard, 3=detailed)
  verbosity: 1 | 2 | 3;
  
  // Task complexity threshold for auto-activation
  complexityThreshold?: number;
}

/**
 * Task context for cognitive processing
 */
export interface TaskContext {
  userMessage: string;
  conversationHistory?: string[];
  memoryContext?: string;
  availableTools?: string[];
}

/**
 * Result from cognitive processing
 */
export interface CognitiveResult {
  tool: CognitiveToolType;
  output: string;
  metadata?: {
    complexity?: number;
    stepsIdentified?: number;
    entitiesFound?: string[];
  };
}

const DEFAULT_CONFIG: CognitiveToolConfig = {
  enabledTools: ['PLAN', 'VERIFY'],  // Reduced - UNDERSTAND was causing repetition
  verbosity: 1,  // Minimal verbosity to reduce repetition
  complexityThreshold: 4,  // Higher threshold - only activate for truly complex tasks
};

/**
 * Cognitive Toolkit
 * 
 * Provides modular reasoning templates for complex task processing.
 */
export class CognitiveToolkit {
  private config: CognitiveToolConfig;

  constructor(config: Partial<CognitiveToolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('[CognitiveToolkit] Initialized with tools:', this.config.enabledTools);
  }

  /**
   * Analyze task complexity to determine if cognitive tools should be used
   * Returns a score from 1-10
   */
  analyzeComplexity(context: TaskContext): number {
    const msg = context.userMessage.toLowerCase();
    let score = 1;
    
    // Multi-step indicators
    if (msg.includes(' and ') || msg.includes(' then ')) score += 2;
    if (msg.includes(' also ') || msg.includes(' additionally ')) score += 1;
    
    // Action keywords
    const actionWords = ['create', 'make', 'add', 'delete', 'move', 'copy', 'edit', 'modify', 'organize', 'rename'];
    const actionCount = actionWords.filter(w => msg.includes(w)).length;
    score += Math.min(actionCount, 3);
    
    // Reference complexity (pronouns, relative references)
    if (msg.includes('inside it') || msg.includes('in that') || msg.includes('that folder')) score += 1;
    if (msg.includes('inside ') || msg.includes('within ')) score += 1;
    
    // Multiple entities
    const pathMatches = msg.match(/~\/[^\s]+/g) || [];
    score += Math.min(pathMatches.length, 2);
    
    // Question complexity
    if (msg.includes('how') || msg.includes('why') || msg.includes('explain')) score += 1;
    
    // Long messages tend to be more complex
    if (msg.length > 200) score += 1;
    if (msg.length > 400) score += 1;
    
    return Math.min(score, 10);
  }

  /**
   * Check if cognitive tools should be activated for this task
   */
  shouldActivate(context: TaskContext): boolean {
    const complexity = this.analyzeComplexity(context);
    return complexity >= (this.config.complexityThreshold || 3);
  }

  /**
   * Get the UNDERSTAND template
   * Helps parse and clarify user intent
   */
  getUnderstandTemplate(context: TaskContext): string {
    if (this.config.verbosity === 1) {
      return `<UNDERSTAND>
Parse request: What does the user want? What entities are involved?
</UNDERSTAND>`;
    }
    
    if (this.config.verbosity === 2) {
      return `<UNDERSTAND>
Before acting, parse the user's request:
1. GOAL: What is the primary objective?
2. ENTITIES: What files, folders, or paths are mentioned?
3. CONTEXT: Any references to previous actions ("inside it", "that folder")?
4. CONSTRAINTS: Any specific requirements or restrictions?

User message: "${context.userMessage.substring(0, 200)}${context.userMessage.length > 200 ? '...' : ''}"
</UNDERSTAND>`;
    }
    
    // Verbosity 3 - detailed
    return `<UNDERSTAND>
Carefully analyze the user's request before proceeding:

1. PRIMARY GOAL
   - What is the user trying to accomplish?
   - Is this a question, a task, or a combination?

2. ENTITY EXTRACTION
   - Files mentioned: [list any file names or types]
   - Folders mentioned: [list any folder names or paths]
   - Paths involved: [list explicit paths like ~/Desktop/...]

3. CONTEXTUAL REFERENCES
   - Does "it", "that", "this" refer to something from memory?
   - Any relative references ("inside", "within", "next to")?

4. IMPLICIT REQUIREMENTS
   - What isn't said but is expected?
   - Any common patterns or conventions to follow?

5. EDGE CASES
   - What could go wrong?
   - Any ambiguities to clarify?

User message: "${context.userMessage}"

${context.memoryContext ? `Memory context available: ${context.memoryContext.substring(0, 200)}...` : 'No memory context available.'}
</UNDERSTAND>`;
  }

  /**
   * Get the PLAN template
   * Helps break down tasks into executable steps
   */
  getPlanTemplate(context: TaskContext): string {
    if (this.config.verbosity === 1) {
      return `<PLAN>
Steps to complete this task:
1. [First action]
2. [Second action if needed]
3. [Final confirmation]
</PLAN>`;
    }
    
    if (this.config.verbosity === 2) {
      return `<PLAN>
Based on understanding, create an execution plan:

STEPS:
1. [What to do first - usually read/understand current state]
2. [Main action - create, modify, or query]
3. [Follow-up actions if multi-step]
4. [Verify and confirm completion]

TOOLS NEEDED:
- [List tools that will be used: create_folder, write_file, etc.]

DEPENDENCIES:
- [Any step that depends on another - e.g., can't write to folder until folder exists]
</PLAN>`;
    }
    
    // Verbosity 3 - detailed
    return `<PLAN>
Create a detailed execution plan:

## STEP BREAKDOWN

| Step | Action | Tool | Path/Args | Depends On |
|------|--------|------|-----------|------------|
| 1    | [action] | [tool] | [path] | - |
| 2    | [action] | [tool] | [path] | Step 1 |
| ...  | ... | ... | ... | ... |

## VALIDATION CHECKPOINTS
- After Step 1: [What should be true?]
- After Step 2: [What should be true?]
- Final: [How to confirm success?]

## ROLLBACK PLAN
If any step fails:
- [What to do to recover?]
- [Any cleanup needed?]

## RESOURCE REQUIREMENTS
- Files to read: [list]
- Files to create: [list]
- Folders to create: [list]

Available tools: ${context.availableTools?.join(', ') || 'filesystem tools'}
</PLAN>`;
  }

  /**
   * Get the EXECUTE template
   * Guides action execution
   */
  getExecuteTemplate(_context: TaskContext): string {
    return `<EXECUTE>
Now executing the plan:

CURRENT STEP: [step number and description]
TOOL CALL: [tool name with arguments]
EXPECTED RESULT: [what should happen]

After each tool execution:
- Check if result matches expected
- Update plan if needed
- Proceed to next step
</EXECUTE>`;
  }

  /**
   * Get the VERIFY template
   * Confirms results match expectations
   */
  getVerifyTemplate(context: TaskContext): string {
    if (this.config.verbosity === 1) {
      return `<VERIFY>
Confirm: Did all actions complete successfully? Does the result match user's request?
</VERIFY>`;
    }
    
    return `<VERIFY>
Verification checklist:

1. COMPLETION CHECK
   [ ] All planned steps executed
   [ ] No errors in tool results
   [ ] All files/folders created as expected

2. REQUIREMENT CHECK
   [ ] Original request satisfied
   [ ] Paths are correct (using ~ not /~)
   [ ] Content matches expectations

3. STATE CHECK
   [ ] File system in expected state
   [ ] No unintended side effects
   [ ] User can find created items

Original request: "${context.userMessage.substring(0, 150)}..."
</VERIFY>`;
  }

  /**
   * Get the REFLECT template
   * Learn from outcomes
   */
  getReflectTemplate(_context: TaskContext): string {
    return `<REFLECT>
Post-task reflection:

WHAT WORKED WELL:
- [Successful patterns to remember]

WHAT COULD IMPROVE:
- [Any inefficiencies or issues]

LEARNINGS:
- [Key insights for future similar tasks]

MEMORY UPDATE:
- [What should be remembered for follow-up requests]
</REFLECT>`;
  }

  /**
   * Build cognitive prompt injection based on task complexity
   * Returns the appropriate cognitive templates to inject
   */
  buildCognitivePrompt(context: TaskContext): string {
    if (!this.shouldActivate(context)) {
      logger.debug('[CognitiveToolkit] Task below complexity threshold, skipping cognitive tools');
      return '';
    }
    
    const sections: string[] = [];
    
    // Add enabled tools in order
    for (const tool of this.config.enabledTools) {
      switch (tool) {
        case 'UNDERSTAND':
          sections.push(this.getUnderstandTemplate(context));
          break;
        case 'PLAN':
          sections.push(this.getPlanTemplate(context));
          break;
        case 'EXECUTE':
          sections.push(this.getExecuteTemplate(context));
          break;
        case 'VERIFY':
          sections.push(this.getVerifyTemplate(context));
          break;
        case 'REFLECT':
          sections.push(this.getReflectTemplate(context));
          break;
      }
    }
    
    if (sections.length === 0) {
      return '';
    }
    
    const complexity = this.analyzeComplexity(context);
    logger.info('[CognitiveToolkit] Cognitive tools activated:', {
      complexity,
      tools: this.config.enabledTools,
    });
    
    return `<COGNITIVE_FRAMEWORK>
This is a complex task (complexity: ${complexity}/10). Use the following structured reasoning:

${sections.join('\n\n')}

Apply these frameworks in order before and during task execution.
</COGNITIVE_FRAMEWORK>`;
  }

  /**
   * Get a simplified cognitive prompt for token-constrained scenarios
   */
  buildMinimalCognitivePrompt(context: TaskContext): string {
    if (!this.shouldActivate(context)) {
      return '';
    }
    
    return `<COGNITIVE>
For complex tasks: 1) UNDERSTAND the request 2) PLAN the steps 3) EXECUTE tools 4) VERIFY results
</COGNITIVE>`;
  }

  /**
   * Process a task through cognitive analysis
   * Returns structured analysis results
   */
  analyzeTask(context: TaskContext): CognitiveResult[] {
    const results: CognitiveResult[] = [];
    const complexity = this.analyzeComplexity(context);
    
    // UNDERSTAND phase
    if (this.config.enabledTools.includes('UNDERSTAND')) {
      const entities = this.extractEntities(context.userMessage);
      results.push({
        tool: 'UNDERSTAND',
        output: `Task complexity: ${complexity}/10. ${entities.length} entities identified.`,
        metadata: {
          complexity,
          entitiesFound: entities,
        },
      });
    }
    
    // PLAN phase
    if (this.config.enabledTools.includes('PLAN')) {
      const steps = this.estimateSteps(context.userMessage);
      results.push({
        tool: 'PLAN',
        output: `Estimated ${steps} steps required for this task.`,
        metadata: {
          stepsIdentified: steps,
        },
      });
    }
    
    return results;
  }

  /**
   * Extract entities (files, folders, paths) from message
   */
  private extractEntities(message: string): string[] {
    const entities: string[] = [];
    
    // Extract paths
    const pathMatches = message.match(/~\/[\w\-\/\.]+/g) || [];
    entities.push(...pathMatches);
    
    // Extract quoted names
    const quotedMatches = message.match(/"([^"]+)"|'([^']+)'/g) || [];
    entities.push(...quotedMatches.map(m => m.replace(/["']/g, '')));
    
    // Extract folder/file references
    const folderMatches = message.match(/(?:folder|directory)\s+(?:called|named)?\s*(\w+)/gi) || [];
    entities.push(...folderMatches);
    
    const fileMatches = message.match(/(?:file)\s+(?:called|named)?\s*(\w+\.?\w*)/gi) || [];
    entities.push(...fileMatches);
    
    return [...new Set(entities)]; // Dedupe
  }

  /**
   * Estimate number of steps required
   */
  private estimateSteps(message: string): number {
    const msg = message.toLowerCase();
    let steps = 1;
    
    // Count action verbs
    const actions = ['create', 'make', 'add', 'delete', 'move', 'copy', 'edit', 'modify', 'rename', 'read', 'list', 'organize'];
    for (const action of actions) {
      const count = (msg.match(new RegExp(action, 'g')) || []).length;
      steps += count;
    }
    
    // Count "and"/"then" connectors
    steps += (msg.match(/\band\b/g) || []).length;
    steps += (msg.match(/\bthen\b/g) || []).length;
    
    return Math.min(steps, 10);
  }
}

export default CognitiveToolkit;
