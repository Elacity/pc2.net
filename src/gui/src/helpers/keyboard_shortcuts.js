/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * Keyboard Shortcuts Handler
 * Implements global keyboard shortcuts for improved productivity
 */

import UIWindowSearch from '../UI/UIWindowSearch.js';

/**
 * Initialize keyboard shortcuts
 */
function initKeyboardShortcuts() {
    // Prevent shortcuts when user is typing in inputs, textareas, or contenteditable elements
    const isInputFocused = () => {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable ||
            activeElement.closest('.item-name-editor') !== null
        );
    };

    // Detect Cmd (Mac) vs Ctrl (Windows/Linux)
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? 'metaKey' : 'ctrlKey';
    const modifierName = isMac ? 'Cmd' : 'Ctrl';

    // Global keyboard event handler
    document.addEventListener('keydown', async (e) => {
        // Skip if user is typing in an input field
        if (isInputFocused()) {
            // Allow some shortcuts even in inputs (like Cmd+A for select all)
            if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
                return; // Let browser handle select all
            }
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                // Cmd+K / Ctrl+K should work even in inputs (common pattern)
                e.preventDefault();
                e.stopPropagation();
                // Use window.UIWindowSearch if available, otherwise use imported function
                if (window.UIWindowSearch) {
                    window.UIWindowSearch();
                } else {
                    UIWindowSearch();
                }
                return;
            }
            return;
        }

        // Cmd+K / Ctrl+K: Open Search
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            // Use imported UIWindowSearch directly
            UIWindowSearch();
            return;
        }

        // Cmd+N / Ctrl+N: New File
        if (e.key === 'n' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const itemContainer = activeWindow.find('.item-container, .window-body.item-container').first();
                if (itemContainer.length > 0) {
                    const currentPath = itemContainer.attr('data-path') || window.home_path || '/';
                    if (window.create_file) {
                        await window.create_file({
                            dirname: currentPath,
                            append_to_element: itemContainer,
                            name: 'New File.txt'
                        });
                    }
                }
            }
            return;
        }

        // Cmd+Shift+N / Ctrl+Shift+N: New Folder
        if (e.key === 'N' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const itemContainer = activeWindow.find('.item-container, .window-body.item-container').first();
                if (itemContainer.length > 0) {
                    const currentPath = itemContainer.attr('data-path') || window.home_path || '/';
                    if (window.create_folder) {
                        await window.create_folder(currentPath, itemContainer);
                    }
                }
            }
            return;
        }

        // Delete / Backspace: Delete selected item(s)
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const selectedItems = activeWindow.find('.item-selected, .item.item-selected');
                if (selectedItems.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Delete all selected items
                    for (let i = 0; i < selectedItems.length; i++) {
                        if (window.delete_item) {
                            await window.delete_item(selectedItems[i]);
                        }
                    }
                }
            }
            return;
        }

        // Cmd+C / Ctrl+C: Copy selected items
        if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const selectedItems = activeWindow.find('.item-selected, .item.item-selected');
                if (selectedItems.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Copy to clipboard - manually set clipboard array
                    window.clipboard = [];
                    selectedItems.each(function() {
                        const path = $(this).attr('data-path');
                        if (path) {
                            window.clipboard.push({ path: path });
                        }
                    });
                    window.clipboard_is_cut = false; // Mark as copy, not cut
                }
            }
            return;
        }

        // Cmd+V / Ctrl+V: Paste from clipboard
        if (e.key === 'v' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const itemContainer = activeWindow.find('.item-container, .window-body.item-container').first();
                if (itemContainer.length > 0 && window.clipboard && window.clipboard.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentPath = itemContainer.attr('data-path') || window.home_path || '/';
                    // Check if this is a cut or copy operation
                    if (window.clipboard_is_cut) {
                        // Move items (cut)
                        if (window.move_clipboard_items) {
                            window.move_clipboard_items(itemContainer, currentPath);
                        }
                    } else {
                        // Copy items
                        if (window.copy_clipboard_items) {
                            await window.copy_clipboard_items(currentPath, itemContainer);
                        }
                    }
                }
            }
            return;
        }

        // Cmd+X / Ctrl+X: Cut selected items
        if (e.key === 'x' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const selectedItems = activeWindow.find('.item-selected, .item.item-selected');
                if (selectedItems.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Copy to clipboard (cut is copy + delete)
                    window.clipboard = [];
                    selectedItems.each(function() {
                        const path = $(this).attr('data-path');
                        if (path) {
                            window.clipboard.push({ path: path });
                        }
                    });
                    // Mark as cut operation (we'll handle move on paste)
                    window.clipboard_is_cut = true;
                }
            }
            return;
        }

        // Arrow keys: Navigate files (when no input is focused)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isInputFocused()) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const itemContainer = activeWindow.find('.item-container, .window-body.item-container').first();
                if (itemContainer.length > 0) {
                    const items = itemContainer.find('.item:visible').not('.item-disabled');
                    if (items.length > 0) {
                        const currentSelected = itemContainer.find('.item-selected, .item.item-selected').first();
                        let targetIndex = 0;

                        if (currentSelected.length > 0) {
                            const currentIndex = items.index(currentSelected);
                            if (e.key === 'ArrowDown') {
                                targetIndex = Math.min(currentIndex + 1, items.length - 1);
                            } else if (e.key === 'ArrowUp') {
                                targetIndex = Math.max(currentIndex - 1, 0);
                            } else {
                                return; // Left/Right not implemented for now
                            }
                        }

                        // Select the target item
                        items.removeClass('item-selected');
                        const targetItem = items.eq(targetIndex);
                        targetItem.addClass('item-selected');
                        targetItem[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            }
            return;
        }

        // Enter: Open selected item
        if (e.key === 'Enter' && !isInputFocused()) {
            const activeWindow = $('.window-active');
            if (activeWindow.length > 0) {
                const selectedItems = activeWindow.find('.item-selected, .item.item-selected').first();
                if (selectedItems.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.open_item) {
                        await window.open_item(selectedItems[0]);
                    } else {
                        // Fallback: trigger double-click
                        selectedItems.trigger('dblclick');
                    }
                }
            }
            return;
        }
    });

    false && console.log('[Keyboard Shortcuts] ✅ Initialized');
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.initKeyboardShortcuts = initKeyboardShortcuts;
}

export default initKeyboardShortcuts;

