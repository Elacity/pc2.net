/**
 * UIMissionControl - macOS-style Mission Control overlay
 * 
 * Shows all workspaces as a horizontal strip at the top with window previews,
 * and spreads the current workspace's windows in a grid below.
 * Supports drag-to-move windows between workspaces, adding/removing workspaces,
 * and reordering workspaces.
 */

let isOpen = false;

function renderOverlay() {
    const wm = window.workspace_manager;
    if (!wm) return '';

    let html = `<div id="mission-control-overlay" class="mc-overlay">`;
    html += `<div class="mc-workspace-strip">`;

    wm.workspaces.forEach((ws, idx) => {
        const isActive = ws.id === wm.activeWorkspaceId;
        const windows = $(`.window[data-workspace="${ws.id}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
        html += `<div class="mc-workspace-thumb${isActive ? ' active' : ''}" data-workspace-id="${ws.id}" draggable="true">`;
        html += `<div class="mc-workspace-thumb-label">${ws.name}</div>`;
        html += `<div class="mc-workspace-thumb-preview">`;
        windows.each(function () {
            const $w = $(this);
            const title = $w.find('.window-head-title').text() || $w.attr('data-name') || '';
            const iconSrc = $w.find('.window-head-icon img').attr('src') || '';
            html += `<div class="mc-thumb-window" title="${html_encode(title)}">`;
            if (iconSrc) html += `<img src="${html_encode(iconSrc)}" class="mc-thumb-window-icon">`;
            html += `<span class="mc-thumb-window-title">${html_encode(title.substring(0, 12))}</span>`;
            html += `</div>`;
        });
        html += `</div>`;
        if (wm.workspaces.length > 1) {
            html += `<div class="mc-workspace-remove" data-workspace-id="${ws.id}" title="Remove workspace">&times;</div>`;
        }
        html += `</div>`;
    });

    html += `<div class="mc-workspace-add" title="Add workspace">+</div>`;
    html += `</div>`;

    // Window spread for active workspace
    html += `<div class="mc-window-spread">`;
    const activeWindows = $(`.window[data-workspace="${wm.activeWorkspaceId}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
    if (activeWindows.length === 0) {
        html += `<div class="mc-empty-label">No windows on this workspace</div>`;
    } else {
        activeWindows.each(function () {
            const $w = $(this);
            const winId = $w.attr('data-id');
            const title = $w.find('.window-head-title').text() || $w.attr('data-name') || 'Window';
            const iconSrc = $w.find('.window-head-icon img').attr('src') || '';
            const isActive = $w.hasClass('window-active');

            const width = $w.outerWidth() || 400;
            const height = $w.outerHeight() || 300;
            const maxCardW = 280;
            const maxCardH = 200;
            const scale = Math.min(maxCardW / width, maxCardH / height, 0.35);
            const cardW = Math.round(width * scale);
            const cardH = Math.round(height * scale);

            html += `<div class="mc-window-card${isActive ? ' mc-window-card-active' : ''}" data-window-id="${winId}" data-clone-scale="${scale}" draggable="true">`;
            html += `<div class="mc-window-card-preview" style="width:${cardW}px; height:${cardH}px;">`;
            html += `</div>`;
            html += `<div class="mc-window-card-label">`;
            if (iconSrc) html += `<img src="${html_encode(iconSrc)}" class="mc-window-card-icon">`;
            html += `<span>${html_encode(title)}</span>`;
            html += `</div>`;
            html += `</div>`;
        });
    }
    html += `</div>`;

    html += `</div>`;
    return html;
}

function cloneWindowsIntoCards() {
    $('.mc-window-card').each(function () {
        const winId = $(this).attr('data-window-id');
        const scale = parseFloat($(this).attr('data-clone-scale')) || 0.3;
        const $source = $(`.window[data-id="${winId}"]`);
        if ($source.length === 0) return;

        const $preview = $(this).find('.mc-window-card-preview');
        const clone = $source[0].cloneNode(true);
        clone.removeAttribute('id');
        clone.classList.remove('window-active');
        clone.classList.add('mc-window-clone');
        clone.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: ${$source.outerWidth()}px;
            height: ${$source.outerHeight()}px;
            transform: scale(${scale});
            transform-origin: top left;
            pointer-events: none;
            z-index: 1;
            display: block;
            opacity: 1;
        `;

        // Remove interactive elements from clone to prevent side effects
        $(clone).find('iframe').each(function () {
            const $iframe = $(this);
            const ph = document.createElement('div');
            ph.style.cssText = `width:100%; height:100%; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); display:flex; align-items:center; justify-content:center;`;
            const icon = $source.find('.window-head-icon img').attr('src');
            if (icon) {
                ph.innerHTML = `<img src="${icon}" style="width:32px; height:32px; opacity:0.5; filter: brightness(2);">`;
            }
            $iframe.replaceWith(ph);
        });

        $preview.append(clone);
    });
}

function openMissionControl() {
    if (isOpen) return;
    isOpen = true;

    const html = renderOverlay();
    $('body').append(html);

    cloneWindowsIntoCards();

    // Animate in
    requestAnimationFrame(() => {
        $('#mission-control-overlay').addClass('mc-visible');
    });

    bindEvents();
}

function closeMissionControl() {
    if (!isOpen) return;
    isOpen = false;
    const $overlay = $('#mission-control-overlay');
    $overlay.removeClass('mc-visible');
    setTimeout(() => $overlay.remove(), 250);
}

function toggleMissionControl() {
    if (isOpen) closeMissionControl();
    else openMissionControl();
}

function refreshOverlay() {
    if (!isOpen) return;
    const scrollPos = $('.mc-workspace-strip').scrollLeft();
    $('#mission-control-overlay').remove();
    const html = renderOverlay();
    $('body').append(html);
    cloneWindowsIntoCards();
    requestAnimationFrame(() => {
        $('#mission-control-overlay').addClass('mc-visible');
        $('.mc-workspace-strip').scrollLeft(scrollPos);
    });
    bindEvents();
}

function bindEvents() {
    const wm = window.workspace_manager;

    // Click overlay background to close
    $('#mission-control-overlay').on('click', function (e) {
        if ($(e.target).hasClass('mc-overlay') || $(e.target).hasClass('mc-window-spread')) {
            closeMissionControl();
        }
    });

    // Escape to close
    $(document).off('keydown.missioncontrol').on('keydown.missioncontrol', function (e) {
        if (e.key === 'Escape' && isOpen) {
            closeMissionControl();
        }
    });

    // Click a workspace thumbnail to switch
    $('.mc-workspace-thumb').on('click', function (e) {
        if ($(e.target).hasClass('mc-workspace-remove')) return;
        const id = parseInt($(this).attr('data-workspace-id'));
        wm.switchTo(id);
        closeMissionControl();
    });

    // Click a window card to focus and close MC
    $('.mc-window-card').on('click', function () {
        const winId = $(this).attr('data-window-id');
        closeMissionControl();
        setTimeout(() => {
            $(`.window[data-id="${winId}"]`).focusWindow();
        }, 260);
    });

    // Add workspace
    $('.mc-workspace-add').on('click', function (e) {
        e.stopPropagation();
        wm.addWorkspace();
        refreshOverlay();
    });

    // Remove workspace
    $('.mc-workspace-remove').on('click', function (e) {
        e.stopPropagation();
        const id = parseInt($(this).attr('data-workspace-id'));
        wm.removeWorkspace(id);
        refreshOverlay();
    });

    // Drag window cards to workspace thumbnails
    $('.mc-window-card').on('dragstart', function (e) {
        const winId = $(this).attr('data-window-id');
        e.originalEvent.dataTransfer.setData('text/plain', `window:${winId}`);
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        $(this).addClass('mc-dragging');
    });

    $('.mc-window-card').on('dragend', function () {
        $(this).removeClass('mc-dragging');
        $('.mc-workspace-thumb').removeClass('mc-drag-over');
    });

    // Workspace thumb drop targets
    $('.mc-workspace-thumb').on('dragover', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        $(this).addClass('mc-drag-over');
    });

    $('.mc-workspace-thumb').on('dragleave', function () {
        $(this).removeClass('mc-drag-over');
    });

    $('.mc-workspace-thumb').on('drop', function (e) {
        e.preventDefault();
        $(this).removeClass('mc-drag-over');
        const data = e.originalEvent.dataTransfer.getData('text/plain');
        if (data.startsWith('window:')) {
            const winId = data.replace('window:', '');
            const targetWsId = parseInt($(this).attr('data-workspace-id'));
            wm.moveWindowToWorkspace(winId, targetWsId);
            refreshOverlay();
        }
    });

    // Drag workspace thumbnails to reorder
    let dragThumbSrc = null;

    $('.mc-workspace-thumb').on('dragstart', function (e) {
        const data = e.originalEvent.dataTransfer.getData('text/plain');
        if (data && data.startsWith('window:')) return;
        dragThumbSrc = parseInt($(this).attr('data-workspace-id'));
        e.originalEvent.dataTransfer.setData('text/workspace', String(dragThumbSrc));
    });

    $('.mc-workspace-thumb').on('drop', function (e) {
        const wsData = e.originalEvent.dataTransfer.getData('text/workspace');
        if (wsData && dragThumbSrc !== null) {
            e.preventDefault();
            const fromId = parseInt(wsData);
            const toId = parseInt($(this).attr('data-workspace-id'));
            if (fromId !== toId) {
                const fromIdx = wm.workspaces.findIndex(w => w.id === fromId);
                const toIdx = wm.workspaces.findIndex(w => w.id === toId);
                wm.reorderWorkspaces(fromIdx, toIdx);
                refreshOverlay();
            }
            dragThumbSrc = null;
        }
    });
}

// Expose globally
window.toggleMissionControl = toggleMissionControl;
window.openMissionControl = openMissionControl;
window.closeMissionControl = closeMissionControl;

export { toggleMissionControl, openMissionControl, closeMissionControl };
