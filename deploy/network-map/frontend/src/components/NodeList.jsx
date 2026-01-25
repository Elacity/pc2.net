import React, { useState } from 'react';

/**
 * Node List - Displays all nodes in a list format
 * Shows anonymized identifiers only (no usernames/URLs)
 */
function NodeList({ nodes }) {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('status');
  
  // Filter nodes
  const filteredNodes = nodes.filter(node => {
    if (filter === 'all') return true;
    if (filter === 'online') return node.status === 'online';
    if (filter === 'offline') return node.status === 'offline' || node.status === 'stale';
    return true;
  });
  
  // Sort nodes
  const sortedNodes = [...filteredNodes].sort((a, b) => {
    if (sortBy === 'status') {
      const order = { online: 0, offline: 1, stale: 2, unknown: 3 };
      return (order[a.status] || 3) - (order[b.status] || 3);
    }
    if (sortBy === 'activity') {
      const order = { 'always-on': 0, intermittent: 1, occasional: 2, inactive: 3 };
      return (order[a.activityType] || 3) - (order[b.activityType] || 3);
    }
    return 0;
  });
  
  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px'
          }}
        >
          <option value="all">All Nodes</option>
          <option value="online">Online Only</option>
          <option value="offline">Offline Only</option>
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px'
          }}
        >
          <option value="status">Sort by Status</option>
          <option value="activity">Sort by Activity</option>
        </select>
      </div>
      
      {/* Node list */}
      <div className="node-list">
        {sortedNodes.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '24px', textAlign: 'center' }}>
            No nodes found
          </p>
        ) : (
          sortedNodes.map(node => (
            <div key={node.nodeIdentifier} className="node-item">
              <div>
                <span className="node-id">{node.nodeIdentifier}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`activity-badge ${node.activityType}`}>
                  {formatActivityType(node.activityType)}
                </span>
                <div className="node-status">
                  <span className={`status-dot ${node.status}`}></span>
                  <span>{formatStatus(node.status)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Privacy note */}
      <p style={{ 
        marginTop: '24px', 
        padding: '16px', 
        background: 'rgba(240, 185, 11, 0.1)', 
        borderRadius: '8px',
        fontSize: '13px',
        color: 'var(--text-secondary)'
      }}>
        Node identifiers are anonymized (hash-based) to protect privacy. 
        Usernames and URLs are never displayed.
      </p>
    </div>
  );
}

function formatStatus(status) {
  switch (status) {
    case 'online': return 'Online';
    case 'offline': return 'Offline';
    case 'stale': return 'Stale';
    default: return 'Unknown';
  }
}

function formatActivityType(type) {
  switch (type) {
    case 'always-on': return 'Always On';
    case 'intermittent': return 'Intermittent';
    case 'occasional': return 'Occasional';
    case 'inactive': return 'Inactive';
    default: return 'Unknown';
  }
}

export default NodeList;
