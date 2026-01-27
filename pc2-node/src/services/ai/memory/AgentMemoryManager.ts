/**
 * Agent Memory Manager
 * 
 * Manages per-agent isolated memory following Clawdbot patterns.
 * Each agent has its own workspace with:
 * - MEMORY.md: Long-term curated knowledge
 * - memory/YYYY-MM-DD.md: Daily notes
 * - memory.db: Vector store for semantic search (future)
 * 
 * SECURITY: All paths are scoped to wallet and agent for isolation.
 */

import { FilesystemManager } from '../../../storage/filesystem.js';
import { logger } from '../../../utils/logger.js';

/**
 * Memory entry structure
 */
export interface MemoryEntry {
  timestamp: string;
  category: string;
  fact: string;
  source?: string;
}

/**
 * Daily note structure
 */
export interface DailyNote {
  date: string;
  entries: MemoryEntry[];
}

/**
 * Agent memory context for injection into system prompt
 */
export interface AgentMemoryContext {
  longTermMemory: string;       // Contents of MEMORY.md
  recentNotes: DailyNote[];     // Last N days of daily notes
  todayNotes: string;           // Today's notes content
}

/**
 * Configuration for memory manager
 */
export interface AgentMemoryConfig {
  // Number of recent daily notes to load
  recentDaysToLoad: number;
  
  // Maximum entries per daily note before consolidation
  maxDailyEntries: number;
  
  // Maximum length of MEMORY.md before pruning
  maxMemoryLength: number;
}

const DEFAULT_CONFIG: AgentMemoryConfig = {
  recentDaysToLoad: 3,
  maxDailyEntries: 50,
  maxMemoryLength: 10000,
};

/**
 * Sanitize identifier to prevent path traversal attacks
 * Only allows alphanumeric, hyphens, underscores, and periods
 */
function sanitizePathComponent(value: string, name: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required and must be a string`);
  }
  
  // Check for path traversal attempts
  if (value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new Error(`${name} contains invalid path characters`);
  }
  
  // Only allow safe characters (alphanumeric, hyphen, underscore, period)
  const sanitized = value.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (sanitized !== value) {
    logger.warn(`[Security] ${name} contained invalid characters, sanitized:`, { original: value, sanitized });
  }
  
  if (sanitized.length === 0) {
    throw new Error(`${name} is empty after sanitization`);
  }
  
  return sanitized;
}

/**
 * Agent Memory Manager
 * 
 * Provides isolated memory management for each agent.
 * All operations are scoped to the agent's workspace.
 */
export class AgentMemoryManager {
  private config: AgentMemoryConfig;
  private agentWorkspace: string;

  constructor(
    private filesystem: FilesystemManager,
    private walletAddress: string,
    private agentId: string,
    config: Partial<AgentMemoryConfig> = {}
  ) {
    // Sanitize inputs to prevent path traversal attacks
    const safeWallet = sanitizePathComponent(walletAddress, 'walletAddress');
    const safeAgentId = sanitizePathComponent(agentId, 'agentId');
    
    this.walletAddress = safeWallet;
    this.agentId = safeAgentId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Agent workspace path: /walletAddress/pc2/agents/{agentId}/
    this.agentWorkspace = `/${safeWallet}/pc2/agents/${safeAgentId}`;
    
    logger.info('[AgentMemoryManager] Initialized', {
      wallet: walletAddress.substring(0, 10) + '...',
      agent: agentId,
      workspace: this.agentWorkspace,
    });
  }

  /**
   * Get the path to MEMORY.md for this agent
   */
  private getMemoryPath(): string {
    return `${this.agentWorkspace}/MEMORY.md`;
  }

  /**
   * Get the path to a daily note
   */
  private getDailyNotePath(date: string): string {
    return `${this.agentWorkspace}/memory/${date}.md`;
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Ensure the agent workspace exists
   */
  async ensureWorkspace(): Promise<void> {
    const memoryDir = `${this.agentWorkspace}/memory`;
    try {
      await this.filesystem.createDirectory(this.agentWorkspace, this.walletAddress);
      await this.filesystem.createDirectory(memoryDir, this.walletAddress);
    } catch {
      // Directories may already exist
    }
  }

  /**
   * Load long-term memory (MEMORY.md)
   */
  async loadLongTermMemory(): Promise<string> {
    try {
      const buffer = await this.filesystem.readFile(
        this.getMemoryPath(),
        this.walletAddress
      );
      return buffer?.toString('utf-8') || '';
    } catch {
      // File doesn't exist yet
      return '';
    }
  }

  /**
   * Load a daily note by date
   */
  async loadDailyNote(date: string): Promise<string> {
    try {
      const buffer = await this.filesystem.readFile(
        this.getDailyNotePath(date),
        this.walletAddress
      );
      return buffer?.toString('utf-8') || '';
    } catch {
      return '';
    }
  }

  /**
   * Load recent daily notes (last N days)
   */
  async loadRecentNotes(): Promise<DailyNote[]> {
    const notes: DailyNote[] = [];
    const today = new Date();
    
    for (let i = 0; i < this.config.recentDaysToLoad; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const content = await this.loadDailyNote(dateStr);
      if (content) {
        notes.push({
          date: dateStr,
          entries: this.parseNoteEntries(content),
        });
      }
    }
    
    return notes;
  }

  /**
   * Parse memory entries from note content
   */
  private parseNoteEntries(content: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Format: - [YYYY-MM-DD HH:MM] [category] fact
      const match = line.match(/^- \[(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}[:\d{2}]*)\]\s*(?:\[([^\]]+)\])?\s*(.+)$/);
      if (match) {
        entries.push({
          timestamp: match[1],
          category: match[2] || 'note',
          fact: match[3],
        });
      }
    }
    
    return entries;
  }

  /**
   * Append a note to today's daily notes
   */
  async appendDailyNote(fact: string, category: string = 'note'): Promise<void> {
    await this.ensureWorkspace();
    
    const today = this.getToday();
    const notePath = this.getDailyNotePath(today);
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Load existing content
    let content = await this.loadDailyNote(today);
    
    // Add header if new file
    if (!content) {
      content = `# Daily Notes - ${today}\n\n`;
    }
    
    // Append new entry
    const entry = `- [${timestamp}] [${category}] ${fact}\n`;
    content += entry;
    
    // Write back
    await this.filesystem.writeFile(
      notePath,
      content,
      this.walletAddress,
      { mimeType: 'text/markdown' }
    );
    
    logger.info('[AgentMemoryManager] Appended daily note', {
      agent: this.agentId,
      category,
      factLength: fact.length,
    });
  }

  /**
   * Update long-term memory (MEMORY.md)
   * Adds a new fact to the appropriate category section
   */
  async updateMemory(fact: string, category: string = 'fact'): Promise<void> {
    await this.ensureWorkspace();
    
    const memoryPath = this.getMemoryPath();
    const timestamp = this.getToday();
    
    // Load existing memory
    let content = await this.loadLongTermMemory();
    
    // Initialize if empty
    if (!content) {
      content = `# ${this.agentId} Memory\n\nPersistent knowledge for this agent.\n\n`;
    }
    
    // Format new entry
    const categoryHeader = `## ${this.capitalizeFirst(category)}s\n`;
    const newEntry = `- [${timestamp}] ${fact}\n`;
    
    // Check if category section exists
    if (content.includes(categoryHeader)) {
      // Find insertion point (after category header, before next section)
      const lines = content.split('\n');
      const categoryIndex = lines.findIndex(line => line === categoryHeader.trim());
      
      if (categoryIndex !== -1) {
        // Find next section or end
        let insertIndex = categoryIndex + 1;
        while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
          insertIndex++;
        }
        // Insert before next section
        lines.splice(insertIndex, 0, newEntry.trim());
        content = lines.join('\n');
      } else {
        content += newEntry;
      }
    } else {
      // Add new category section
      content += `\n${categoryHeader}${newEntry}`;
    }
    
    // Prune if too long
    if (content.length > this.config.maxMemoryLength) {
      content = this.pruneMemory(content);
    }
    
    // Write back
    await this.filesystem.writeFile(
      memoryPath,
      content,
      this.walletAddress,
      { mimeType: 'text/markdown' }
    );
    
    // Also append to daily notes for tracking
    await this.appendDailyNote(fact, category);
    
    logger.info('[AgentMemoryManager] Updated long-term memory', {
      agent: this.agentId,
      category,
      memoryLength: content.length,
    });
  }

  /**
   * Prune memory to stay within size limits
   * Removes oldest entries while preserving structure
   */
  private pruneMemory(content: string): string {
    const lines = content.split('\n');
    const pruned: string[] = [];
    let inSection = false;
    let sectionEntries: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // New section - flush previous with limit
        if (sectionEntries.length > 0) {
          // Keep only last 10 entries per section
          pruned.push(...sectionEntries.slice(-10));
          sectionEntries = [];
        }
        pruned.push(line);
        inSection = true;
      } else if (line.startsWith('- [')) {
        sectionEntries.push(line);
      } else {
        // Header or empty line
        if (sectionEntries.length > 0) {
          pruned.push(...sectionEntries.slice(-10));
          sectionEntries = [];
        }
        pruned.push(line);
      }
    }
    
    // Flush final section
    if (sectionEntries.length > 0) {
      pruned.push(...sectionEntries.slice(-10));
    }
    
    return pruned.join('\n');
  }

  /**
   * Load full memory context for injection into system prompt
   */
  async loadMemoryContext(): Promise<AgentMemoryContext> {
    const [longTermMemory, recentNotes] = await Promise.all([
      this.loadLongTermMemory(),
      this.loadRecentNotes(),
    ]);
    
    const todayNotes = await this.loadDailyNote(this.getToday());
    
    return {
      longTermMemory,
      recentNotes,
      todayNotes,
    };
  }

  /**
   * Build a memory context string for system prompt injection
   */
  async buildContextString(): Promise<string> {
    const context = await this.loadMemoryContext();
    const parts: string[] = [];
    
    // Long-term memory
    if (context.longTermMemory) {
      parts.push('<MEMORY>');
      parts.push(context.longTermMemory);
      parts.push('</MEMORY>');
    }
    
    // Recent daily notes
    if (context.recentNotes.length > 0) {
      parts.push('\n<RECENT_NOTES>');
      for (const note of context.recentNotes) {
        parts.push(`\n### ${note.date}`);
        for (const entry of note.entries.slice(-5)) { // Last 5 per day
          parts.push(`- [${entry.category}] ${entry.fact}`);
        }
      }
      parts.push('</RECENT_NOTES>');
    }
    
    return parts.join('\n');
  }

  /**
   * Search memory for relevant entries (keyword-based)
   * Returns matching entries from both long-term memory and daily notes
   */
  async searchMemory(query: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);
    
    // Search long-term memory
    const longTermContent = await this.loadLongTermMemory();
    const longTermEntries = this.parseNoteEntries(longTermContent);
    
    for (const entry of longTermEntries) {
      const factLower = entry.fact.toLowerCase();
      if (keywords.some(k => factLower.includes(k))) {
        results.push(entry);
      }
    }
    
    // Search recent daily notes
    const recentNotes = await this.loadRecentNotes();
    for (const note of recentNotes) {
      for (const entry of note.entries) {
        const factLower = entry.fact.toLowerCase();
        if (keywords.some(k => factLower.includes(k))) {
          results.push(entry);
        }
      }
    }
    
    // Deduplicate and limit
    const seen = new Set<string>();
    return results.filter(e => {
      const key = `${e.timestamp}-${e.fact}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }

  /**
   * Capitalize first letter of string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Get workspace path
   */
  getWorkspacePath(): string {
    return this.agentWorkspace;
  }
}
