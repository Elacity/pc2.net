/**
 * UIMissionControl - macOS-style Mission Control overlay
 * 
 * Shows all workspaces as a horizontal strip at the top with real window previews,
 * and spreads the current workspace's windows in an adaptive grid below.
 * Supports drag-to-move windows between workspaces, adding/removing workspaces,
 * and reordering workspaces.
 */

let isOpen = false;

function getSpreadScale(windowCount, winWidth, winHeight) {
    const viewW = window.innerWidth - 80;
    const viewH = window.innerHeight - 200;

    if (windowCount === 1) {
        return Math.min(viewW * 0.7 / winWidth, viewH * 0.7 / winHeight, 0.85);
    }
    if (windowCount === 2) {
        return Math.min(viewW * 0.45 / winWidth, viewH * 0.6 / winHeight, 0.55);
    }
    if (windowCount <= 4) {
        return Math.min(viewW * 0.4 / winWidth, viewH * 0.4 / winHeight, 0.4);
    }
    if (windowCount <= 6) {
        return Math.min(viewW * 0.3 / winWidth, viewH * 0.35 / winHeight, 0.32);
    }
    return Math.min(viewW * 0.25 / winWidth, viewH * 0.3 / winHeight, 0.25);
}

function getThumbScale(windowCount, winWidth, winHeight) {
    const thumbW = 180;
    const thumbH = 70;
    const perWindow = windowCount > 1 ? 0.45 : 0.8;
    return Math.min(thumbW * perWindow / winWidth, thumbH * perWindow / winHeight, 0.12);
}

function renderOverlay() {
    const wm = window.workspace_manager;
    if (!wm) return '';

    let html = `<div id="mission-control-overlay" class="mc-overlay">`;
    html += `<div class="mc-workspace-strip">`;

    wm.workspaces.forEach((ws) => {
        const isActive = ws.id === wm.activeWorkspaceId;
        html += `<div class="mc-workspace-thumb${isActive ? ' active' : ''}" data-workspace-id="${ws.id}" draggable="true">`;
        html += `<div class="mc-workspace-thumb-label">${ws.name}</div>`;
        html += `<div class="mc-workspace-thumb-preview" data-workspace-id="${ws.id}">`;
        html += `</div>`;
        if (wm.workspaces.length > 1) {
            html += `<div class="mc-workspace-remove" data-workspace-id="${ws.id}" title="Remove workspace">&times;</div>`;
        }
        html += `</div>`;
    });

    html += `<div class="mc-workspace-add" title="Add workspace">+</div>`;
    html += `</div>`;

    // Window spread for active workspace
    const activeWindows = $(`.window[data-workspace="${wm.activeWorkspaceId}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
    const windowCount = activeWindows.length;
    const spreadClass = windowCount === 1 ? 'mc-spread-single' : windowCount === 2 ? 'mc-spread-double' : windowCount <= 4 ? 'mc-spread-quad' : 'mc-spread-many';

    html += `<div class="mc-window-spread ${spreadClass}">`;
    if (windowCount === 0) {
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
            const scale = getSpreadScale(windowCount, width, height);
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

function cloneWindowElement($source, scale) {
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

    $(clone).find('iframe').each(function () {
        const ph = document.createElement('div');
        ph.style.cssText = `width:100%; height:100%; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); display:flex; align-items:center; justify-content:center;`;
        const icon = $source.find('.window-head-icon img').attr('src');
        if (icon) {
            ph.innerHTML = `<img src="${icon}" style="width:32px; height:32px; opacity:0.5; filter: brightness(2);">`;
        }
        $(this).replaceWith(ph);
    });

    return clone;
}

function cloneWindowsIntoCards() {
    // Clone windows into spread cards
    $('.mc-window-card').each(function () {
        const winId = $(this).attr('data-window-id');
        const scale = parseFloat($(this).attr('data-clone-scale')) || 0.3;
        const $source = $(`.window[data-id="${winId}"]`);
        if ($source.length === 0) return;

        const $preview = $(this).find('.mc-window-card-preview');
        $preview.append(cloneWindowElement($source, scale));
    });
}

function cloneWindowsIntoThumbs() {
    const wm = window.workspace_manager;
    if (!wm) return;

    wm.workspaces.forEach((ws) => {
        const $thumbPreview = $(`.mc-workspace-thumb-preview[data-workspace-id="${ws.id}"]`);
        if ($thumbPreview.length === 0) return;

        const windows = $(`.window[data-workspace="${ws.id}"]`).not('[data-is_minimized="true"]').not('[data-is_minimized="1"]');
        const count = windows.length;
        if (count === 0) return;

        const thumbW = $thumbPreview.width() || 180;
        const thumbH = $thumbPreview.height() || 70;

        windows.each(function (i) {
            const $w = $(this);
            const width = $w.outerWidth() || 400;
            const height = $w.outerHeight() || 300;
            const scale = getThumbScale(count, width, height);
            const scaledW = width * scale;
            const scaledH = height * scale;

            const clone = cloneWindowElement($w, scale);

            // Position windows within the thumbnail
            let left, top;
            if (count === 1) {
                left = (thumbW - scaledW) / 2;
                top = (thumbH - scaledH) / 2;
            } else if (count === 2) {
                left = i === 0 ? thumbW * 0.08 : thumbW * 0.48;
                top = (thumbH - scaledH) / 2;
            } else {
                const cols = Math.min(count, 3);
                const row = Math.floor(i / cols);
                const col = i % cols;
                const cellW = thumbW / cols;
                const cellH = thumbH / Math.ceil(count / cols);
                left = col * cellW + (cellW - scaledW) / 2;
                top = row * cellH + (cellH - scaledH) / 2;
            }

            clone.style.left = `${Math.max(0, left)}px`;
            clone.style.top = `${Math.max(0, top)}px`;

            $thumbPreview.append(clone);
        });
    });
}

function openMissionControl() {
    if (isOpen) return;
    isOpen = true;

    const html = renderOverlay();
    $('body').append(html);

    cloneWindowsIntoCards();
    cloneWindowsIntoThumbs();

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
    cloneWindowsIntoThumbs();
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

    $('.mc-workspace-thumb').on('click', function (e) {
        if ($(e.target).hasClass('mc-workspace-remove')) return;
        const id = parseInt($(this).attr('data-workspace-id'));
        wm.switchTo(id);
        closeMissionControl();
    });

    $('.mc-window-card').on('click', function () {
        const winId = $(this).attr('data-window-id');
        closeMissionControl();
        setTimeout(() => {
            $(`.window[data-id="${winId}"]`).focusWindow();
        }, 260);
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
