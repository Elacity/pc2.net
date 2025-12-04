// Copy of filesystem capabilities for extension use
// Extensions can't access core modules via relative paths

const capabilityNames = [
    'thumbnail',
    'uuid',
    'operation-trace',
    'readdir-uuid-mode',
    'update-thumbnail',
    'puter-shortcut',
    'read',
    'write',
    'symlink',
    'trash',
    'copy-tree',
    'move-tree',
    'remove-tree',
    'get-recursive-size',
    'case-sensitive',
    'readdir-inode-numbers',
    'unix-perms',
];

const fsCapabilities = {};
for ( const capabilityName of capabilityNames ) {
    const key = capabilityName.toUpperCase().replace(/-/g, '_');
    fsCapabilities[key] = Symbol(capabilityName);
}

module.exports = fsCapabilities;
