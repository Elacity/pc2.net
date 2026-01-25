import React, { useState, useEffect, useCallback, useRef } from 'react';
import NetworkGraph from './components/NetworkGraph';
import NodeList from './components/NodeList';

function App() {
  const [stats, setStats] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  
  const fetchData = useCallback(async () => {
    try {
      const [statsRes, nodesRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/nodes')
      ]);
      
      if (!statsRes.ok || !nodesRes.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const statsData = await statsRes.json();
      const nodesData = await nodesRes.json();
      
      setStats(statsData);
      setNodes(nodesData.nodes || []);
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Unable to load network data');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    function connect() {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'stats_update') {
            setStats(message.data);
          } else if (message.type === 'node_change') {
            fetchData();
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };
      
      wsRef.current.onclose = () => setTimeout(connect, 5000);
      wsRef.current.onerror = (err) => console.error('WebSocket error:', err);
    }
    
    connect();
    return () => wsRef.current?.close();
  }, [fetchData]);

  const supernodes = nodes.filter(n => n.nodeType === 'supernode');
  const onlineNodes = nodes.filter(n => n.status === 'online' && n.nodeType !== 'supernode');
  const offlineNodes = nodes.filter(n => n.status !== 'online' && n.nodeType !== 'supernode');
  
  return (
    <div className="app single-page">
      {/* Compact Header */}
      <header className="header compact">
        <h1>Personal Cloud (PC2) Network Map</h1>
      </header>
      
      <main className="main compact">
        {loading ? (
          <div className="loading-state">Loading network data...</div>
        ) : error ? (
          <div className="error-state">{error}</div>
        ) : (
          <div className="scrollable-layout">
            {/* Stats Bar */}
            <div className="stats-bar">
              <div className="stat-pill online">
                <span className="stat-dot online"></span>
                <span className="stat-num">{stats?.onlineNow || 0}</span>
                <span className="stat-text">Online</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats?.totalActivePC2 || 0}</span>
                <span className="stat-text">PC2 Nodes</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats?.totalRegistered || 0}</span>
                <span className="stat-text">Registered</span>
              </div>
              <div className="stat-pill supernode">
                <span className="stat-dot supernode"></span>
                <span className="stat-num">{supernodes.length}</span>
                <span className="stat-text">Supernode</span>
              </div>
            </div>
            
            {/* Graph Section */}
            <section className="graph-section fixed-height">
              <div className="graph-help">
                Drag nodes • Scroll to zoom • Hover for info
              </div>
              <div className="graph-legend">
                <div className="legend-item"><span className="legend-dot supernode"></span>Supernode</div>
                <div className="legend-item"><span className="legend-dot online"></span>Online</div>
                <div className="legend-item"><span className="legend-dot offline"></span>Offline</div>
              </div>
              <div className="privacy-badge">
                <svg className="lock-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                Anonymized - No URLs or IPs exposed
              </div>
              <NetworkGraph nodes={nodes} />
            </section>
            
            {/* Node List Section */}
            <section className="nodes-section">
              <h2 className="section-title">Network Nodes ({nodes.length})</h2>
              
              <div className="node-list-table">
                <div className="node-list-header">
                  <span className="col-status">Status</span>
                  <span className="col-id">Node ID</span>
                  <span className="col-type">Type</span>
                  <span className="col-activity">Activity</span>
                </div>
                
                {/* Supernodes first */}
                {supernodes.map(node => (
                  <div key={node.nodeIdentifier} className={`node-row supernode ${node.status}`}>
                    <span className="col-status">
                      <span className={`status-indicator ${node.status}`}></span>
                      {node.status}
                    </span>
                    <span className="col-id">{node.nodeIdentifier}</span>
                    <span className="col-type supernode-badge">Supernode</span>
                    <span className="col-activity">{node.activityType || '-'}</span>
                  </div>
                ))}
                
                {/* Online nodes */}
                {onlineNodes.map(node => (
                  <div key={node.nodeIdentifier} className={`node-row online`}>
                    <span className="col-status">
                      <span className="status-indicator online"></span>
                      online
                    </span>
                    <span className="col-id">{node.nodeIdentifier}</span>
                    <span className={`col-type ${node.nodeType === 'pc2' ? 'pc2-badge' : ''}`}>{node.nodeType}</span>
                    <span className="col-activity">{node.activityType || '-'}</span>
                  </div>
                ))}
                
                {/* Offline nodes */}
                {offlineNodes.map(node => (
                  <div key={node.nodeIdentifier} className={`node-row offline`}>
                    <span className="col-status">
                      <span className="status-indicator offline"></span>
                      {node.status}
                    </span>
                    <span className="col-id">{node.nodeIdentifier}</span>
                    <span className={`col-type ${node.nodeType === 'pc2' ? 'pc2-badge' : ''}`}>{node.nodeType}</span>
                    <span className="col-activity">{node.activityType || '-'}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
      
      <footer className="footer compact">
        <div className="footer-left">
          <span>Data updates every 5 min</span>
          <span>•</span>
          <a href="https://pc2.net" target="_blank" rel="noopener">PC2</a>
          <span>•</span>
          <a href="https://ela.city" target="_blank" rel="noopener">Elacity</a>
        </div>
        <div className="footer-logo">
          <img src="/images/elacity-labs-logo.svg" alt="Elacity Labs" />
        </div>
      </footer>
    </div>
  );
}

export default App;
