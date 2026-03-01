/**
 * UIMissionControl - macOS-style Mission Control overlay
 * 
 * Uses actual window elements (scaled + repositioned) for the spread area
 * so iframe content is visible. Transparent click-target overlays sit on top
 * to prevent app interaction and capture user clicks.
 */

let isOpen = false;
let savedWindowStates = [];
let pendingSwitchWorkspaceId = null;

function getSpreadLayout(windowCount) {
    if (windowCount === 1) return { cols: 1, scale: 0.65 };
    if (windowCount === 2) return { cols: 2, scale: 0.45 };
    if (windowCount <= 4) return { cols: 2, scale: 0.38 };
    if (windowCount <= 6) return { cols: 3, scale: 0.28 };
    return { cols: 3, scale: 0.22 };
}

function renderOverlay() {
    const wm = window.workspace_manager;
    if (!wm) return '';

    let html = `<div id="mission-control-overlay" class="mc-overlay">`;
    html += `<div class="mc-workspace-strip">`;

    wm.workspaces.forEach((ws) => {
        const isActive = ws.id === wm.activeWorkspaceId;
        const windows = $(`.window[data-workspace="${ws.id}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');

        html += `<div class="mc-workspace-thumb${isActive ? ' active' : ''}" data-workspace-id="${ws.id}" draggable="true">`;
        html += `<div class="mc-workspace-thumb-label">${ws.name}</div>`;
        html += `<div class="mc-workspace-thumb-preview">`;

        windows.each(function () {
            const $w = $(this);
            const title = $w.find('.window-head-title').text() || $w.attr('data-name') || '';
            const iconSrc = $w.find('.window-head-icon img').attr('src') || '';
            html += `<div class="mc-thumb-app" title="${html_encode(title)}">`;
            if (iconSrc) {
                html += `<img src="${html_encode(iconSrc)}" class="mc-thumb-app-icon">`;
            }
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

    const activeWindows = $(`.window[data-workspace="${wm.activeWorkspaceId}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
    html += `<div class="mc-window-spread" id="mc-window-spread">`;
    if (activeWindows.length === 0) {
        html += `<div class="mc-empty-label">No windows on this workspace</div>`;
    }
    html += `</div>`;

    html += `</div>`;
    return html;
}

function arrangeWindowsInSpread() {
    const wm = window.workspace_manager;
    if (!wm) return;

    const activeWindows = $(`.window[data-workspace="${wm.activeWorkspaceId}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
    const count = activeWindows.length;
    if (count === 0) return;

    const layout = getSpreadLayout(count);
    const stripHeight = 160;
    const labelHeight = 30;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight - stripHeight;
    const cols = layout.cols;
    const rows = Math.ceil(count / cols);
    const scale = layout.scale;

    activeWindows.each(function (i) {
        const $w = $(this);
        const winId = $w.attr('data-id');

        savedWindowStates.push({
            id: winId,
            cssText: this.style.cssText,
            zIndex: $w.css('z-index'),
        });

        const winW = $w.outerWidth() || 400;
        const winH = $w.outerHeight() || 300;
        const scaledW = winW * scale;
        const scaledH = winH * scale;

        const col = i % cols;
        const row = Math.floor(i / cols);

        const cellW = viewW / cols;
        const cellH = viewH / rows;
        const left = col * cellW + (cellW - scaledW) / 2;
        const top = stripHeight + row * cellH + (cellH - scaledH - labelHeight) / 2;

        $w.addClass('mc-spread-window');
        $w.css({
            'position': 'fixed',
            'left': left + 'px',
            'top': top + 'px',
            'width': winW + 'px',
            'height': winH + 'px',
            'transform': `scale(${scale})`,
            'transform-origin': 'top left',
            'z-index': 100000 + i,
            'transition': 'left 0.3s ease, top 0.3s ease, transform 0.3s ease',
            'border-radius': '10px',
            'box-shadow': '0 4px 20px rgba(0,0,0,0.4)',
            'pointer-events': 'none',
        });

        // Transparent click-target overlay positioned exactly over the scaled window
        const title = $w.find('.window-head-title').text() || $w.attr('data-name') || 'Window';
        const iconSrc = $w.find('.window-head-icon img').attr('src') || '';
        const clickTarget = `<div class="mc-click-target" data-window-id="${winId}" draggable="true" style="
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            width: ${scaledW}px;
            height: ${scaledH}px;
            z-index: 100100;
            cursor: pointer;
            border-radius: 10px;
        "></div>`;
        $('body').append(clickTarget);

        const labelHtml = `<div class="mc-spread-label" data-for-window="${winId}" style="
            position: fixed;
            left: ${left}px;
            top: ${top + scaledH + 6}px;
            width: ${scaledW}px;
            text-align: center;
            z-index: 100100;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        ">
            ${iconSrc ? `<img src="${html_encode(iconSrc)}" style="width:14px; height:14px;">` : ''}
            <span style="font-size: 12px; color: rgba(255,255,255,0.85); text-shadow: 0 1px 3px rgba(0,0,0,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${html_encode(title)}</span>
        </div>`;
        $('body').append(labelHtml);
    });
}

function restoreWindows() {
    $('.mc-spread-label').remove();
    $('.mc-click-target').remove();

    savedWindowStates.forEach((state) => {
        const $w = $(`.window[data-id="${state.id}"]`);
        if ($w.length === 0) return;

        $w.removeClass('mc-spread-window');
        $w[0].style.cssText = state.cssText;
        $w.css('z-index', state.zIndex);
    });

    savedWindowStates = [];
}

function openMissionControl() {
    if (isOpen) return;
    isOpen = true;
    pendingSwitchWorkspaceId = null;

    const html = renderOverlay();
    $('body').append(html);

    arrangeWindowsInSpread();

    requestAnimationFrame(() => {
        $('#mission-control-overlay').addClass('mc-visible');
    });

    bindEvents();
}

function closeMissionControl(focusWindowId) {
    if (!isOpen) return;
    isOpen = false;

    // Restore windows FIRST (puts them back to original CSS)
    restoreWindows();

    // THEN apply workspace switch if one was requested
    if (pendingSwitchWorkspaceId !== null) {
        window.workspace_manager.switchTo(pendingSwitchWorkspaceId);
        pendingSwitchWorkspaceId = null;
    }

    // Focus a specific window if requested
    if (focusWindowId) {
        setTimeout(() => {
            $(`.window[data-id="${focusWindowId}"]`).focusWindow();
        }, 50);
    }

    const $overlay = $('#mission-control-overlay');
    $overlay.removeClass('mc-visible');
    setTimeout(() => $overlay.remove(), 250);

    $(document).off('keydown.missioncontrol');
    $(document).off('click.mc-targets');
    $(document).off('mouseenter.mc-targets');
    $(document).off('mouseleave.mc-targets');
    $(document).off('dragstart.mc-targets');
    $(document).off('dragend.mc-targets');
}

function toggleMissionControl() {
    if (isOpen) closeMissionControl();
    else openMissionControl();
}

function refreshOverlay() {
    if (!isOpen) return;
    restoreWindows();
    const scrollPos = $('.mc-workspace-strip').scrollLeft();
    $('#mission-control-overlay').remove();
    const html = renderOverlay();
    $('body').append(html);
    arrangeWindowsInSpread();
    requestAnimationFrame(() => {
        $('#mission-control-overlay').addClass('mc-visible');
        $('.mc-workspace-strip').scrollLeft(scrollPos);
    });
    bindEvents();
}

function bindEvents() {
    const wm = window.workspace_manager;

    $('#mission-control-overlay').on('click', function (e) {
        if ($(e.target).hasClass('mc-overlay') || $(e.target).hasClass('mc-window-spread')) {
            closeMissionControl();
        }
    });

    $(document).off('keydown.missioncontrol').on('keydown.missioncontrol', function (e) {
        if (e.key === 'Escape' && isOpen) {
            closeMissionControl();
        }
    });

    // Click workspace thumbnail: set pending switch, then close
    $('.mc-workspace-thumb').on('click', function (e) {
        if ($(e.target).hasClass('mc-workspace-remove')) return;
        pendingSwitchWorkspaceId = parseInt($(this).attr('data-workspace-id'));
        closeMissionControl();
    });

    // Click-target overlays: close MC and focus the clicked window
    $(document).on('click.mc-targets', '.mc-click-target', function (e) {
        e.stopPropagation();
        const winId = $(this).attr('data-window-id');
        closeMissionControl(winId);
    });

    // Hover effect on click targets highlights the window beneath
    $(document).on('mouseenter.mc-targets', '.mc-click-target', function () {
        const winId = $(this).attr('data-window-id');
        $(`.window[data-id="${winId}"]`).css('box-shadow', '0 4px 24px rgba(59,130,246,0.4), 0 0 0 3px rgba(59,130,246,0.6)');
    });
    $(document).on('mouseleave.mc-targets', '.mc-click-target', function () {
        const winId = $(this).attr('data-window-id');
        $(`.window[data-id="${winId}"]`).css('box-shadow', '0 4px 20px rgba(0,0,0,0.4)');
    });

    $('.mc-workspace-add').on('click', function (e) {
        e.stopPropagation();
        wm.addWorkspace();
        refreshOverlay();
    });

    $('.mc-workspace-remove').on('click', function (e) {
        e.stopPropagation();
        const id = parseInt($(this).attr('data-workspace-id'));
        wm.removeWorkspace(id);
        refreshOverlay();
    });

    // Drag click-targets to workspace thumbnails
    $(document).on('dragstart.mc-targets', '.mc-click-target', function (e) {
        const winId = $(this).attr('data-window-id');
        e.originalEvent.dataTransfer.setData('text/plain', `window:${winId}`);
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        $(`.window[data-id="${winId}"]`).css('opacity', '0.4');
    });

    $(document).on('dragend.mc-targets', '.mc-click-target', function () {
        const winId = $(this).attr('data-window-id');
        $(`.window[data-id="${winId}"]`).css('opacity', '1');
        $('.mc-workspace-thumb').removeClass('mc-drag-over');
    });

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

window.toggleMissionControl = toggleMissionControl;
window.openMissionControl = openMissionControl;
window.closeMissionControl = closeMissionControl;

export { toggleMissionControl, openMissionControl, closeMissionControl };
