/**
 * UIWindowSystemTerminal
 * 
 * Real terminal that connects to the host system's shell.
 * Provides isolated, secure shell access per user.
 * 
 * Security:
 * - Each user gets their own sandboxed environment
 * - Working directory restricted to user's home
 * - Session authentication required
 * - Idle timeout enforced by server
 */

import UIWindow from './UIWindow.js';

// Dynamic imports for xterm.js (loaded from CDN)
const loadXterm = () => {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.Terminal && window.FitAddon) {
            resolve(window.Terminal);
            return;
        }
        
        // Load CSS
        if (!document.getElementById('xterm-css')) {
            const link = document.createElement('link');
            link.id = 'xterm-css';
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
            document.head.appendChild(link);
        }
        
        // Load xterm.js
        const loadScript = (id, src) => {
            return new Promise((res, rej) => {
                if (document.getElementById(id)) {
                    res();
                    return;
                }
                const script = document.createElement('script');
                script.id = id;
                script.src = src;
                script.onload = res;
                script.onerror = rej;
                document.head.appendChild(script);
            });
        };
        
        loadScript('xterm-js', 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js')
            .then(() => loadScript('xterm-fit-js', 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js'))
            .then(() => {
                // Wait for global to be available
                const waitForGlobal = () => {
                    if (window.Terminal && window.FitAddon) {
                        resolve(window.Terminal);
                    } else {
                        setTimeout(waitForGlobal, 50);
                    }
                };
                waitForGlobal();
            })
            .catch(reject);
    });
};

// Initialize terminal in the window
const initializeTerminal = async (el_window) => {
    const container = el_window.querySelector('.system-terminal-content');
    const statusEl = el_window.querySelector('.system-terminal-status');
    
    if (!container || !statusEl) {
        console.error('[SystemTerminal] Container or status element not found');
        return;
    }
    
    try {
        // Load xterm.js
        statusEl.textContent = 'Loading terminal...';
        await loadXterm();
        
        // Create terminal
        const terminal = new window.Terminal({
            theme: {
                background: '#1a1a2e',
                foreground: '#eee',
                cursor: '#e94560',
                cursorAccent: '#1a1a2e',
                selectionBackground: 'rgba(233, 69, 96, 0.3)',
            },
            fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            cursorBlink: true,
            cursorStyle: 'block',
            allowTransparency: true,
        });
        
        // Create fit addon
        const fitAddon = new window.FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        
        // Open terminal in container
        terminal.open(container);
        
        // Wait a bit for DOM to settle
        await new Promise(r => setTimeout(r, 100));
        fitAddon.fit();
        
        // Get WebSocket connection
        const socket = window.puter?.fs?.socket;
        
        if (!socket) {
            statusEl.textContent = 'Error: No WebSocket';
            statusEl.style.color = '#e94560';
            terminal.writeln('\x1b[31mError: WebSocket not available.\x1b[0m');
            terminal.writeln('\x1b[33mPlease ensure you are logged in.\x1b[0m');
            return;
        }
        
        // Create terminal session
        let sessionId = null;
        
        statusEl.textContent = 'Creating session...';
        
        try {
            sessionId = await new Promise((resolve, reject) => {
                const cols = terminal.cols;
                const rows = terminal.rows;
                
                console.log('[SystemTerminal] Creating session with cols:', cols, 'rows:', rows);
                
                socket.emit('terminal.create', { cols, rows }, (response) => {
                    console.log('[SystemTerminal] Create response:', response);
                    if (response?.success) {
                        resolve(response.sessionId);
                    } else {
                        reject(new Error(response?.error || 'Failed to create terminal session'));
                    }
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    reject(new Error('Terminal creation timed out'));
                }, 10000);
            });
            
            statusEl.textContent = 'Connected';
            statusEl.style.color = '#4ade80';
            console.log('[SystemTerminal] Session created:', sessionId);
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.style.color = '#e94560';
            terminal.writeln('\x1b[31mFailed to create terminal session:\x1b[0m');
            terminal.writeln('\x1b[31m' + error.message + '\x1b[0m');
            terminal.writeln('');
            terminal.writeln('\x1b[33mNote: System terminal requires node-pty on the server.\x1b[0m');
            terminal.writeln('\x1b[33mRun: cd pc2-node && npm install\x1b[0m');
            return;
        }
        
        // Handle terminal output from server
        const handleOutput = (data) => {
            if (data.sessionId === sessionId) {
                terminal.write(data.data);
            }
        };
        socket.on('terminal.output', handleOutput);
        
        // Handle terminal exit
        const handleExit = (data) => {
            if (data.sessionId === sessionId) {
                terminal.writeln('');
                terminal.writeln(`\x1b[33mProcess exited with code ${data.exitCode}\x1b[0m`);
                statusEl.textContent = 'Disconnected';
                statusEl.style.color = '#f59e0b';
                sessionId = null;
            }
        };
        socket.on('terminal.exit', handleExit);
        
        // Handle errors
        const handleError = (data) => {
            if (!data.sessionId || data.sessionId === sessionId) {
                terminal.writeln(`\x1b[31mError: ${data.error}\x1b[0m`);
            }
        };
        socket.on('terminal.error', handleError);
        
        // Send user input to server
        terminal.onData((data) => {
            if (sessionId) {
                socket.emit('terminal.data', {
                    sessionId: sessionId,
                    data: data,
                });
            }
        });
        
        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
            if (sessionId) {
                socket.emit('terminal.resize', {
                    sessionId: sessionId,
                    cols: terminal.cols,
                    rows: terminal.rows,
                });
            }
        };
        
        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(container);
        
        // Focus terminal
        terminal.focus();
        
        // Cleanup on window close
        const cleanup = () => {
            if (sessionId) {
                socket.emit('terminal.destroy', { sessionId: sessionId });
            }
            socket.off('terminal.output', handleOutput);
            socket.off('terminal.exit', handleExit);
            socket.off('terminal.error', handleError);
            resizeObserver.disconnect();
        };
        
        // Store cleanup function
        el_window.__terminalCleanup = cleanup;
        
    } catch (error) {
        console.error('[SystemTerminal] Error:', error);
        if (statusEl) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.style.color = '#e94560';
        }
    }
};

async function UIWindowSystemTerminal(options = {}) {
    const width = options.width || 800;
    const height = options.height || 500;
    
    // Create window content
    const windowContent = `
        <div class="system-terminal-container" style="width: 100%; height: 100%; background: #1a1a2e; display: flex; flex-direction: column;">
            <div class="system-terminal-header" style="padding: 8px 12px; background: #16213e; color: #e94560; font-size: 12px; font-family: monospace; display: flex; justify-content: space-between; align-items: center;">
                <span>System Terminal (PC2 Node)</span>
                <span class="system-terminal-status" style="color: #888;">Initializing...</span>
            </div>
            <div class="system-terminal-content" style="flex: 1; padding: 4px; min-height: 300px;"></div>
        </div>
    `;
    
    // Create the window
    const el_window = await UIWindow({
        title: 'System Terminal',
        icon: null,
        uid: null,
        is_dir: false,
        body_content: windowContent,
        has_head: true,
        selectable_body: false,
        allow_context_menu: false,
        is_resizable: true,
        is_draggable: true,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        is_visible: true,
        width: width,
        height: height,
        backdrop: false,
        close_on_backdrop_click: false,
        window_class: 'window-system-terminal',
        body_css: {
            padding: '0',
            overflow: 'hidden',
            height: '100%',
        },
        onAppend: function(el) {
            // Initialize terminal after window is appended
            console.log('[SystemTerminal] Window appended, initializing terminal...');
            initializeTerminal(el);
        },
        on_close: function() {
            // Cleanup terminal
            const el = this.$el?.[0] || this;
            if (el.__terminalCleanup) {
                el.__terminalCleanup();
            }
        },
    });
    
    return el_window;
}

export default UIWindowSystemTerminal;
