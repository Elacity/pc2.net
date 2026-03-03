/**
 * Normalize backend modified timestamp to ms (for timeago) and seconds (for data-modified/sort).
 * Handles: Unix seconds, Unix ms, or ISO date string.
 */
export function normalizeModified(modified) {
    if (modified === undefined || modified === null || modified === 0) {
        return { ms: 0, sec: 0 };
    }
    if (typeof modified === 'string') {
        const ms = new Date(modified).getTime();
        const valid = !Number.isNaN(ms);
        return { ms: valid ? ms : 0, sec: valid ? Math.floor(ms / 1000) : 0 };
    }
    if (typeof modified === 'number') {
        const ms = modified >= 1e12 ? modified : modified * 1000;
        return { ms, sec: Math.floor(ms / 1000) };
    }
    return { ms: 0, sec: 0 };
}
