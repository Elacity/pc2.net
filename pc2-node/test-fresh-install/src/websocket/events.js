export function broadcastFileChange(io, event) {
    const room = `user:${event.wallet_address}`;
    io.to(room).emit('file:changed', event);
    console.log(`📡 Broadcasted file change to ${room}: ${event.action} ${event.path}`);
}
export function broadcastDirectoryChange(io, event) {
    const room = `user:${event.wallet_address}`;
    io.to(room).emit('directory:changed', event);
    console.log(`📡 Broadcasted directory change to ${room}: ${event.action} ${event.path}`);
}
export function broadcastItemRenamed(io, walletAddress, item) {
    const room = `user:${walletAddress}`;
    io.to(room).emit('item.renamed', item);
    console.log(`📡 Broadcasted item.renamed to ${room}: ${item.old_path} → ${item.path}`);
}
let globalPendingEvents = null;
export function setEventQueue(queue) {
    globalPendingEvents = queue;
}
export function getEventQueue() {
    return globalPendingEvents;
}
export function broadcastItemAdded(io, walletAddress, item) {
    const normalizedWallet = walletAddress.toLowerCase();
    const room = `user:${normalizedWallet}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const connectedCount = roomSockets ? roomSockets.size : 0;
    if (globalPendingEvents) {
        const normalizedWallet = walletAddress.toLowerCase();
        globalPendingEvents.push({
            event: 'item.added',
            data: item,
            wallet: normalizedWallet,
            timestamp: Date.now()
        });
        if (globalPendingEvents.length > 100) {
            globalPendingEvents.shift();
        }
        console.log(`🔔 Queued item.added event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
    }
    console.log(`📡 Emitting item.added to room: ${room}, name: ${item.name}, dirpath: ${item.dirpath}, connectedCount: ${connectedCount}`);
    io.to(room).emit('item.added', item);
    console.log(`📡 Event emitted - Socket.io should deliver to ${connectedCount} WebSocket clients or via polling`);
    if (connectedCount > 0) {
        console.log(`📡 Broadcasted item.added to ${room} (${connectedCount} clients): ${item.name} in ${item.dirpath}`);
        const roomSocketsArray = Array.from(roomSockets || []);
        roomSocketsArray.forEach(socketId => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
                console.log(`📡 Directly emitting item.added to socket ${socketId.substring(0, 10)}...`);
                socket.emit('item.added', item);
            }
            else {
                console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected, event queued for polling`);
            }
        });
    }
    else {
        console.log(`📡 Emitted item.added to ${room} (0 WebSocket clients, will be delivered via polling): ${item.name} in ${item.dirpath}`);
        const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
        console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
    }
}
export function broadcastItemRemoved(io, walletAddress, item) {
    const normalizedWallet = walletAddress.toLowerCase();
    const room = `user:${normalizedWallet}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const connectedCount = roomSockets ? roomSockets.size : 0;
    const eventData = {
        path: item.path,
        descendants_only: item.descendants_only !== undefined ? item.descendants_only : false,
        ...(item.uid && { uid: item.uid })
    };
    if (item.original_client_socket_id && typeof item.original_client_socket_id === 'string') {
        eventData.original_client_socket_id = item.original_client_socket_id;
    }
    if (globalPendingEvents) {
        const normalizedWallet = walletAddress.toLowerCase();
        globalPendingEvents.push({
            event: 'item.removed',
            data: eventData,
            wallet: normalizedWallet,
            timestamp: Date.now()
        });
        if (globalPendingEvents.length > 100) {
            globalPendingEvents.shift();
        }
        console.log(`🔔 Queued item.removed event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
    }
    console.log(`📡 Emitting item.removed to room: ${room}, path: ${item.path}, connectedCount: ${connectedCount}`);
    const currentRoomSockets = io.sockets.adapter.rooms.get(room);
    const currentConnectedCount = currentRoomSockets ? currentRoomSockets.size : 0;
    if (currentConnectedCount !== connectedCount) {
        console.log(`⚠️  Room membership changed! Was ${connectedCount}, now ${currentConnectedCount}`);
    }
    io.to(room).emit('item.removed', eventData);
    console.log(`📡 Event emitted - Socket.io should deliver to ${currentConnectedCount} WebSocket clients or via polling`);
    if (currentConnectedCount > 0) {
        console.log(`📡 Broadcasted item.removed to ${room} (${currentConnectedCount} clients): ${item.path}`);
        console.log(`📡 Event data:`, JSON.stringify(eventData, null, 2));
        const roomSocketsArray = Array.from(currentRoomSockets || []);
        console.log(`📡 Room ${room} has ${currentConnectedCount} client(s):`, roomSocketsArray.map(sid => sid.substring(0, 10) + '...'));
        roomSocketsArray.forEach(socketId => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
                console.log(`📡 Directly emitting item.removed to socket ${socketId.substring(0, 10)}... (path: ${eventData.path})`);
                socket.emit('item.removed', eventData);
                console.log(`✅ [SERVER] Emitted item.removed to socket ${socketId} - Socket.io should deliver to client`);
            }
            else {
                console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected (connected: ${socket?.connected}), event queued for polling`);
            }
        });
    }
    else {
        console.log(`📡 Emitted item.removed to ${room} (0 WebSocket clients, will be delivered via polling): ${item.path}`);
        const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
        console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
        console.log(`📡 Looking for room: ${room}, normalized wallet: ${normalizedWallet}`);
    }
}
export function broadcastItemMoved(io, walletAddress, item) {
    const normalizedWallet = walletAddress.toLowerCase();
    const room = `user:${normalizedWallet}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const connectedCount = roomSockets ? roomSockets.size : 0;
    const eventData = {
        uid: item.uid,
        path: item.path,
        old_path: item.old_path,
        name: item.name,
        ...(item.is_dir !== undefined && { is_dir: item.is_dir }),
        ...(item.size !== undefined && { size: item.size }),
        ...(item.type !== undefined && { type: item.type }),
        ...(item.modified !== undefined && { modified: item.modified }),
        ...(item.thumbnail !== undefined && { thumbnail: item.thumbnail }),
        ...(item.metadata && { metadata: item.metadata })
    };
    if (item.original_client_socket_id && typeof item.original_client_socket_id === 'string') {
        eventData.original_client_socket_id = item.original_client_socket_id;
    }
    if (globalPendingEvents) {
        globalPendingEvents.push({
            event: 'item.moved',
            data: eventData,
            wallet: normalizedWallet,
            timestamp: Date.now()
        });
        if (globalPendingEvents.length > 100) {
            globalPendingEvents.shift();
        }
        console.log(`🔔 Queued item.moved event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
    }
    console.log(`📡 Emitting item.moved to room: ${room}, from: ${eventData.old_path}, to: ${eventData.path}, connectedCount: ${connectedCount}`);
    io.to(room).emit('item.moved', eventData);
    console.log(`📡 Event emitted - Socket.io should deliver to ${connectedCount} WebSocket clients or via polling`);
    if (connectedCount > 0) {
        console.log(`📡 Broadcasted item.moved to ${room} (${connectedCount} clients): ${eventData.old_path} → ${eventData.path}`);
        console.log(`📡 Event data:`, JSON.stringify(eventData, null, 2));
        const roomSocketsArray = Array.from(roomSockets || []);
        console.log(`📡 Room ${room} has ${connectedCount} client(s):`, roomSocketsArray.map(sid => sid.substring(0, 10) + '...'));
        roomSocketsArray.forEach(socketId => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
                console.log(`📡 Directly emitting item.moved to socket ${socketId.substring(0, 10)}...`);
                socket.emit('item.moved', eventData);
            }
            else {
                console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected, event queued for polling`);
            }
        });
    }
    else {
        console.log(`📡 Emitted item.moved to ${room} (0 WebSocket clients, will be delivered via polling): ${eventData.old_path} → ${eventData.path}`);
        const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
        console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
        console.log(`📡 Looking for room: ${room}, normalized wallet: ${normalizedWallet}`);
    }
}
export function broadcastItemUpdated(io, walletAddress, item) {
    const room = `user:${walletAddress}`;
    io.to(room).emit('item.updated', item);
    console.log(`📡 Broadcasted item.updated to ${room}: ${item.path}`);
}
export function broadcastToUser(io, walletAddress, event, data) {
    const room = `user:${walletAddress}`;
    io.to(room).emit(event, data);
}
export function getConnectedClients(io, walletAddress) {
    const room = `user:${walletAddress}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    return roomSockets ? roomSockets.size : 0;
}
//# sourceMappingURL=events.js.map