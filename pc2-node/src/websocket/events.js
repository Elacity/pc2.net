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
export function broadcastItemAdded(io, walletAddress, item) {
    const normalizedWallet = walletAddress.toLowerCase();
    const room = `user:${normalizedWallet}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const connectedCount = roomSockets ? roomSockets.size : 0;
    if (globalPendingEvents) {
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
    if (connectedCount > 0) {
        io.to(room).emit('item.added', item);
        console.log(`📡 Broadcasted item.added to ${room} (${connectedCount} clients): ${item.name} in ${item.dirpath}`);
    }
    else {
        console.warn(`⚠️  No clients connected to ${room}, item.added event queued for polling: ${item.name} in ${item.dirpath}`);
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
        ...(item.uid && { uid: item.uid }),
        ...(item.original_client_socket_id !== undefined && { original_client_socket_id: item.original_client_socket_id })
    };
    if (globalPendingEvents) {
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
    if (connectedCount > 0) {
        io.to(room).emit('item.removed', eventData);
        console.log(`📡 Broadcasted item.removed to ${room} (${connectedCount} clients): ${item.path}`);
    }
    else {
        console.warn(`⚠️  No clients connected to ${room}, item.removed event queued for polling: ${item.path}`);
    }
}
export function broadcastItemMoved(io, walletAddress, item) {
    const room = `user:${walletAddress}`;
    io.to(room).emit('item.moved', item);
    console.log(`📡 Broadcasted item.moved to ${room}: ${item.old_path} → ${item.path}`);
}
export function broadcastItemUpdated(io, walletAddress, item) {
    const normalizedWallet = walletAddress.toLowerCase();
    const room = `user:${normalizedWallet}`;
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