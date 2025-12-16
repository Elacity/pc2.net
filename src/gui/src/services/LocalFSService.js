/**
 * LocalFSService - Local Filesystem Abstraction Layer
 * 
 * Provides a filesystem API that works offline using localStorage.
 * This is a temporary solution until IPFS integration is complete.
 * 
 * The DePIN team can replace the localStorage calls with IPFS calls
 * while keeping the same API interface.
 * 
 * @example
 * // Initialize for a user (call after Particle login)
 * LocalFSService.initializeUserFolders(walletAddress);
 * 
 * // Check if a path exists
 * const exists = await LocalFSService.stat('/0x1234.../Trash');
 * 
 * // Read file metadata
 * const file = await LocalFSService.stat('/0x1234.../Desktop/file.txt');
 */

const LocalFSService = {
    STORAGE_KEY: 'puter_local_fs',
    
    /**
     * Get the filesystem from localStorage
     */
    _getFS() {
        try {
            const fs = localStorage.getItem(this.STORAGE_KEY);
            return fs ? JSON.parse(fs) : {};
        } catch (e) {
            console.error('LocalFSService: Error reading filesystem', e);
            return {};
        }
    },
    
    /**
     * Save the filesystem to localStorage
     */
    _saveFS(fs) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fs));
        } catch (e) {
            console.error('LocalFSService: Error saving filesystem', e);
        }
    },
    
    /**
     * Generate a unique ID for filesystem entries
     */
    _generateId() {
        return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    /**
     * Create a folder entry
     */
    _createFolderEntry(name, path, options = {}) {
        return {
            id: options.id || this._generateId(),
            uid: options.uid || this._generateId(),
            name: name,
            path: path,
            is_dir: true,
            is_empty: options.is_empty !== false,
            type: 'directory',
            immutable: options.immutable || false,
            created: options.created || new Date().toISOString(),
            modified: options.modified || new Date().toISOString(),
            sort_by: options.sort_by || 'name',
            sort_order: options.sort_order || 'asc',
        };
    },
    
    /**
     * Initialize user folders after login
     * Call this after successful Particle authentication
     * 
     * @param {string} username - The wallet address or username
     */
    initializeUserFolders(username) {
        if (!username) {
            console.error('LocalFSService: Username required to initialize folders');
            return false;
        }
        
        const fs = this._getFS();
        const userRoot = '/' + username;
        
        // Check if already initialized
        if (fs[userRoot]) {
            console.log('LocalFSService: User folders already exist for', username);
            return true;
        }
        
        // Create default folder structure
        const defaultFolders = [
            { name: username, path: userRoot, immutable: true },
            { name: 'Desktop', path: userRoot + '/Desktop' },
            { name: 'Documents', path: userRoot + '/Documents' },
            { name: 'Pictures', path: userRoot + '/Pictures' },
            { name: 'Videos', path: userRoot + '/Videos' },
            { name: 'Public', path: userRoot + '/Public' },
            { name: 'AppData', path: userRoot + '/AppData' },
            { name: 'Trash', path: userRoot + '/Trash', is_empty: true },
        ];
        
        defaultFolders.forEach(folder => {
            fs[folder.path] = this._createFolderEntry(folder.name, folder.path, {
                immutable: folder.immutable,
                is_empty: folder.is_empty,
            });
        });
        
        this._saveFS(fs);
        console.log('LocalFSService: Initialized folders for', username);
        
        return true;
    },
    
    /**
     * Check if a path exists and return its metadata
     * Compatible with puter.fs.stat() API
     * 
     * @param {object} options - { path: string, consistency?: string }
     * @returns {Promise<object>} File/folder metadata
     */
    async stat(options) {
        const path = typeof options === 'string' ? options : options.path;
        
        if (!path) {
            throw { code: 'invalid_path', message: 'Path is required' };
        }
        
        const fs = this._getFS();
        const entry = fs[path];
        
        if (!entry) {
            throw { code: 'subject_does_not_exist', message: 'Path does not exist: ' + path };
        }
        
        return entry;
    },
    
    /**
     * Read file contents
     * For now, returns empty or mock data
     * 
     * @param {string} path - File path
     * @returns {Promise<Blob>}
     */
    async read(path) {
        const fs = this._getFS();
        const entry = fs[path];
        
        if (!entry) {
            throw { code: 'subject_does_not_exist', message: 'File does not exist: ' + path };
        }
        
        // Return stored content or empty blob
        const content = entry.content || '';
        return new Blob([content], { type: 'text/plain' });
    },
    
    /**
     * Write file contents
     * 
     * @param {string} path - File path
     * @param {string|Blob} content - File content
     * @returns {Promise<object>}
     */
    async write(path, content) {
        const fs = this._getFS();
        const pathParts = path.split('/');
        const fileName = pathParts.pop();
        const parentPath = pathParts.join('/') || '/';
        
        // Ensure parent exists
        if (!fs[parentPath]) {
            throw { code: 'parent_does_not_exist', message: 'Parent folder does not exist: ' + parentPath };
        }
        
        // Convert content to string if needed
        let contentStr = content;
        if (content instanceof Blob) {
            contentStr = await content.text();
        }
        
        // Create or update file entry
        fs[path] = {
            id: fs[path]?.id || this._generateId(),
            uid: fs[path]?.uid || this._generateId(),
            name: fileName,
            path: path,
            is_dir: false,
            type: 'file',
            content: contentStr,
            size: contentStr.length,
            created: fs[path]?.created || new Date().toISOString(),
            modified: new Date().toISOString(),
        };
        
        // Mark parent as not empty
        if (fs[parentPath]) {
            fs[parentPath].is_empty = false;
        }
        
        this._saveFS(fs);
        return fs[path];
    },
    
    /**
     * List directory contents
     * 
     * @param {string} path - Directory path
     * @returns {Promise<object[]>}
     */
    async readdir(path) {
        const fs = this._getFS();
        const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
        
        const children = Object.values(fs).filter(entry => {
            const entryDir = entry.path.substring(0, entry.path.lastIndexOf('/'));
            return entryDir === normalizedPath && entry.path !== normalizedPath;
        });
        
        return children;
    },
    
    /**
     * Create a directory
     * 
     * @param {string} path - Directory path
     * @param {object} options - Creation options
     * @returns {Promise<object>}
     */
    async mkdir(path, options = {}) {
        const fs = this._getFS();
        
        if (fs[path]) {
            if (options.overwrite) {
                // Already exists, return it
                return fs[path];
            }
            throw { code: 'path_already_exists', message: 'Path already exists: ' + path };
        }
        
        const pathParts = path.split('/');
        const name = pathParts.pop();
        
        fs[path] = this._createFolderEntry(name, path);
        this._saveFS(fs);
        
        return fs[path];
    },
    
    /**
     * Delete a file or directory
     * 
     * @param {string} path - Path to delete
     * @returns {Promise<boolean>}
     */
    async delete(path) {
        const fs = this._getFS();
        
        if (!fs[path]) {
            throw { code: 'subject_does_not_exist', message: 'Path does not exist: ' + path };
        }
        
        // Delete the entry and all children
        Object.keys(fs).forEach(key => {
            if (key === path || key.startsWith(path + '/')) {
                delete fs[key];
            }
        });
        
        this._saveFS(fs);
        return true;
    },
    
    /**
     * Check if user folders are initialized
     * 
     * @param {string} username - Username/wallet address
     * @returns {boolean}
     */
    isInitialized(username) {
        const fs = this._getFS();
        return !!fs['/' + username];
    },
    
    /**
     * Get Trash status (empty or has items)
     * 
     * @param {string} username - Username/wallet address
     * @returns {boolean} true if empty
     */
    isTrashEmpty(username) {
        const fs = this._getFS();
        const trashPath = '/' + username + '/Trash';
        const trash = fs[trashPath];
        return trash ? trash.is_empty !== false : true;
    },
    
    /**
     * Clear all local filesystem data
     * Use with caution - mainly for testing
     */
    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
        console.log('LocalFSService: Cleared all filesystem data');
    },
};

// Attach to window for global access
// This makes LocalFSService available globally regardless of how the file is loaded
window.LocalFSService = LocalFSService;
















