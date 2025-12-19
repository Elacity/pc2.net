export async function handleFile(req, res) {
    const filesystem = req.app.locals.filesystem;
    const uid = req.query.uid;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!uid) {
        res.status(400).json({ error: 'Missing uid parameter' });
        return;
    }
    try {
        let uuidPath = uid.replace(/^uuid-+/, '');
        let filePath = '/' + uuidPath.replace(/-/g, '/');
        try {
            filePath = decodeURIComponent(filePath);
        }
        catch (e) {
            console.warn('[File] Failed to decode URL path, using original:', filePath);
        }
        let metadata = null;
        let walletAddress = '';
        const pathParts = filePath.split('/').filter(p => p);
        if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
            walletAddress = pathParts[0];
            filePath = '/' + pathParts.join('/');
        }
        if (walletAddress) {
            metadata = filesystem.getFileMetadata(filePath, walletAddress);
        }
        if (!metadata) {
            if (filePath.includes('/')) {
                const pathParts = filePath.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    const parentPath = '/' + pathParts.slice(0, -1).join('/');
                    const fileName = pathParts[pathParts.length - 1];
                    try {
                        const parentFiles = filesystem.listDirectory(parentPath, walletAddress || '');
                        const matchingFile = parentFiles.find(f => f.name.toLowerCase() === fileName.toLowerCase());
                        if (matchingFile) {
                            metadata = matchingFile;
                            filePath = matchingFile.path;
                            if (pathParts[0].startsWith('0x')) {
                                walletAddress = pathParts[0];
                            }
                        }
                    }
                    catch (e) {
                    }
                }
            }
            if (!metadata) {
                metadata = filesystem.getFileMetadata(filePath, '');
            }
        }
        if (!metadata) {
            console.error('[File] File not found:', { uid, filePath, walletAddress });
            res.status(404).json({ error: 'File not found', uid, filePath });
            return;
        }
        const finalWalletAddress = walletAddress || (metadata.path.split('/').filter(p => p)[0]?.startsWith('0x') ? metadata.path.split('/').filter(p => p)[0] : '');
        const content = await filesystem.readFile(metadata.path, finalWalletAddress);
        if (metadata.mime_type) {
            res.setHeader('Content-Type', metadata.mime_type);
        }
        res.setHeader('Content-Length', metadata.size.toString());
        res.send(content);
    }
    catch (error) {
        console.error('[File] File access error:', error, { uid });
        res.status(500).json({
            error: 'Failed to access file',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
//# sourceMappingURL=file.js.map