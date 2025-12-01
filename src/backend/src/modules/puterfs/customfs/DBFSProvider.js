/*
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { NodePathSelector, NodeUIDSelector } = require('../../../filesystem/node/selectors');
const { DB_READ } = require('../../../services/database/consts');
const { Context } = require('../../../util/context');
const fsCapabilities = require('../../../filesystem/definitions/capabilities');

/**
 * Database Filesystem Provider
 * 
 * This provider reads filesystem entries directly from the database,
 * bypassing the in-memory filesystem providers.
 */
class DBFSProvider {
    constructor (mountpoint) {
        this.mountpoint = mountpoint || '/';
    }

    get_capabilities () {
        return new Set([
            fsCapabilities.READDIR_UUID_MODE,
            fsCapabilities.UUID,
            fsCapabilities.READ,
        ]);
    }

    async quick_check ({ selector }) {
        // Check if an entry exists in the database
        if ( !(selector instanceof NodeUIDSelector) ) {
            return false;
        }

        const db = Context.get('services').get('database').get(DB_READ, 'filesystem');
        const rows = await db.read('SELECT id FROM fsentries WHERE uuid = ? LIMIT 1', [selector.value]);
        return rows.length > 0;
    }

    async stat ({ selector }) {
        try {
            const db = Context.get('services').get('database').get(DB_READ, 'filesystem');
            
            let fsentry;
            
            if ( selector instanceof NodePathSelector ) {
                // Query by path
                console.log('[DBFSProvider] stat by path:', selector.value);
                const rows = await db.read(
                    'SELECT * FROM fsentries WHERE path = ? LIMIT 1',
                    [selector.value]
                );
                fsentry = rows?.[0];
            } else if ( selector instanceof NodeUIDSelector ) {
                // Query by UUID
                console.log('[DBFSProvider] stat by UUID:', selector.value);
                const rows = await db.read(
                    'SELECT * FROM fsentries WHERE uuid = ? LIMIT 1',
                    [selector.value]
                );
                fsentry = rows?.[0];
            } else {
                console.log('[DBFSProvider] stat: unsupported selector type:', selector.constructor.name);
                return null;
            }

            if ( ! fsentry ) {
                console.log('[DBFSProvider] stat: entry not found');
                return null;
            }

            console.log('[DBFSProvider] stat: found entry:', fsentry.name, fsentry.path);
            
            // Convert database entry to provider format
            return {
                ...fsentry,
                uid: fsentry.uuid,
                mysql_id: fsentry.id,
            };
        } catch (error) {
            console.error('[DBFSProvider] stat error:', error.message, error);
            throw error;
        }
    }

    async readdir ({ context, node }) {
        const db = Context.get('services').get('database').get(DB_READ, 'filesystem');
        const parent_uid = await node.get('uid');
        
        const rows = await db.read(
            'SELECT uuid FROM fsentries WHERE parent_uid = ?',
            [parent_uid]
        );
        
        return rows.map(row => row.uuid);
    }

    async read ({ context, node }) {
        // For now, delegate to storage service
        const svc_storage = context.get('services').get('storage');
        const uid = await node.get('uid');
        return await svc_storage.create_read_stream(uid);
    }
}

module.exports = {
    DBFSProvider,
};

