export function isAPIRoute(path) {
    if (path.startsWith('/api/')) {
        return true;
    }
    if (path.startsWith('/auth/')) {
        return true;
    }
    const puterEndpoints = [
        '/whoami',
        '/stat',
        '/read',
        '/write',
        '/mkdir',
        '/readdir',
        '/delete',
        '/move',
        '/rename',
        '/sign',
        '/version',
        '/os/user',
        '/kv/',
        '/rao',
        '/contactUs',
        '/open_item',
        '/suggest_apps',
        '/file',
        '/itemMetadata',
        '/writeFile',
        '/drivers/call',
        '/get-launch-apps',
        '/cache/',
        '/batch',
        '/df'
    ];
    for (const endpoint of puterEndpoints) {
        if (path.startsWith(endpoint)) {
            return true;
        }
    }
    if (path.startsWith('/socket.io/')) {
        return true;
    }
    if (path === '/health') {
        return true;
    }
    return false;
}
export function isStaticAsset(path) {
    const ext = path.split('.').pop()?.toLowerCase();
    if (!ext) {
        return false;
    }
    const staticExtensions = [
        'js', 'css', 'json', 'xml', 'txt',
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
        'woff', 'woff2', 'ttf', 'eot', 'otf',
        'mp4', 'mp3', 'wav', 'ogg',
        'pdf', 'zip', 'tar', 'gz'
    ];
    return staticExtensions.includes(ext);
}
//# sourceMappingURL=routes.js.map