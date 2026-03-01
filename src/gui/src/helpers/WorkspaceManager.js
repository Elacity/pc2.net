/**
 * WorkspaceManager - Virtual Desktops / Spaces for PC2
 * 
 * Manages multiple workspaces (virtual desktops). Each window is assigned
 * to a workspace via its data-workspace attribute. Switching workspaces
 * hides/shows the appropriate windows.
 */

class WorkspaceManager {
    constructor() {
        this.workspaces = [{ id: 1, name: 'Desktop 1' }];
        this.activeWorkspaceId = 1;
        this._nextId = 2;
        this._listeners = {};
    }

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }

    _emit(event, data) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(cb => cb(data));
        }
    }

    getActiveWorkspace() {
        return this.workspaces.find(w => w.id === this.activeWorkspaceId);
    }

    getWorkspaceById(id) {
        return this.workspaces.find(w => w.id === id);
    }

    getWindowsForWorkspace(id) {
        return $(`.window[data-workspace="${id}"]`);
    }

    switchTo(id) {
        if (id === this.activeWorkspaceId) return;
        if (!this.getWorkspaceById(id)) return;

        const prevId = this.activeWorkspaceId;
        this.activeWorkspaceId = id;

        // Hide windows from previous workspace (fast, no animation)
        $(`.window[data-workspace="${prevId}"]`).each(function () {
            if ($(this).attr('data-is_minimized') === 'true' || $(this).attr('data-is_minimized') === '1') return;
            $(this).css('display', 'none');
            $(this).attr('data-workspace-hidden', 'true');
        });

        // Show windows on new workspace
        $(`.window[data-workspace="${id}"]`).each(function () {
            if ($(this).attr('data-is_minimized') === 'true' || $(this).attr('data-is_minimized') === '1') return;
            $(this).css('display', 'block');
            $(this).removeAttr('data-workspace-hidden');
        });

        // Focus the topmost window on the new workspace
        const windowsOnTarget = $(`.window[data-workspace="${id}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
        if (windowsOnTarget.length > 0) {
            let topWindow = null;
            let topZ = -1;
            windowsOnTarget.each(function () {
                const z = parseInt($(this).css('z-index')) || 0;
                if (z > topZ) {
                    topZ = z;
                    topWindow = this;
                }
            });
            if (topWindow) {
                $(topWindow).focusWindow();
            }
        } else {
            // No windows — deactivate all
            $('.window').removeClass('window-active');
            $('.taskbar-item').removeClass('taskbar-item-active');
        }

        this._emit('switch', { from: prevId, to: id });
    }

    addWorkspace(name) {
        const id = this._nextId++;
        const ws = { id, name: name || `Desktop ${id}` };
        this.workspaces.push(ws);
        this._emit('add', ws);
        return ws;
    }

    removeWorkspace(id) {
        if (this.workspaces.length <= 1) return;
        const idx = this.workspaces.findIndex(w => w.id === id);
        if (idx === -1) return;

        // Move windows from removed workspace to adjacent one
        const targetIdx = idx > 0 ? idx - 1 : 1;
        const targetId = this.workspaces[targetIdx].id;

        $(`.window[data-workspace="${id}"]`).attr('data-workspace', targetId);

        this.workspaces.splice(idx, 1);

        // If we removed the active workspace, switch to the target
        if (this.activeWorkspaceId === id) {
            this.activeWorkspaceId = targetId;
            // Show windows on the new active workspace
            $(`.window[data-workspace="${targetId}"]`).each(function () {
                if ($(this).attr('data-is_minimized') === 'true' || $(this).attr('data-is_minimized') === '1') return;
                $(this).css('display', 'block');
                $(this).removeAttr('data-workspace-hidden');
            });
        }

        this._emit('remove', { id, movedTo: targetId });
    }

    reorderWorkspaces(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.workspaces.length) return;
        if (toIndex < 0 || toIndex >= this.workspaces.length) return;
        const [ws] = this.workspaces.splice(fromIndex, 1);
        this.workspaces.splice(toIndex, 0, ws);
        this._emit('reorder', { workspaces: this.workspaces });
    }

    moveWindowToWorkspace(windowDataId, workspaceId) {
        if (!this.getWorkspaceById(workspaceId)) return;
        const $win = $(`.window[data-id="${windowDataId}"]`);
        if ($win.length === 0) return;

        $win.attr('data-workspace', workspaceId);

        // If moving to a different workspace than active, hide the window
        if (workspaceId !== this.activeWorkspaceId) {
            if ($win.attr('data-is_minimized') !== 'true' && $win.attr('data-is_minimized') !== '1') {
                $win.css('display', 'none');
                $win.attr('data-workspace-hidden', 'true');
            }
        } else {
            // Moving to current workspace — show it
            if ($win.attr('data-is_minimized') !== 'true' && $win.attr('data-is_minimized') !== '1') {
                $win.css('display', 'block');
                $win.removeAttr('data-workspace-hidden');
            }
        }

        this._emit('moveWindow', { windowId: windowDataId, workspaceId });
    }

    switchToNext() {
        const idx = this.workspaces.findIndex(w => w.id === this.activeWorkspaceId);
        if (idx < this.workspaces.length - 1) {
            this.switchTo(this.workspaces[idx + 1].id);
        }
    }

    switchToPrevious() {
        const idx = this.workspaces.findIndex(w => w.id === this.activeWorkspaceId);
        if (idx > 0) {
            this.switchTo(this.workspaces[idx - 1].id);
        }
    }

    moveActiveWindowToNext() {
        const $active = $('.window-active');
        if ($active.length === 0) return;
        const idx = this.workspaces.findIndex(w => w.id === this.activeWorkspaceId);
        if (idx < this.workspaces.length - 1) {
            this.moveWindowToWorkspace($active.attr('data-id'), this.workspaces[idx + 1].id);
        }
    }

    moveActiveWindowToPrevious() {
        const $active = $('.window-active');
        if ($active.length === 0) return;
        const idx = this.workspaces.findIndex(w => w.id === this.activeWorkspaceId);
        if (idx > 0) {
            this.moveWindowToWorkspace($active.attr('data-id'), this.workspaces[idx - 1].id);
        }
    }
}

export default WorkspaceManager;
