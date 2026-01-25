import React, { useRef, useState, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

/**
 * Network Graph Visualization
 * Uses react-force-graph-2d for performant, interactive network display
 */
function NetworkGraph({ nodes, compact }) {
  const graphRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  
  // Resize handler
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Zoom out on initial load
  useEffect(() => {
    if (graphRef.current && nodes.length > 0) {
      // Wait for graph to settle then zoom to fit
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 80);
      }, 500);
    }
  }, [nodes.length]);
  
  // Convert nodes to graph data format
  const graphData = useMemo(() => {
    const graphNodes = nodes.map((node) => ({
      id: node.nodeIdentifier,
      status: node.status,
      activityType: node.activityType,
      nodeType: node.nodeType || 'registered',
      // Random positions for organic network feel
      x: (Math.random() - 0.5) * 400,
      y: (Math.random() - 0.5) * 300
    }));
    
    // Create connections for visual effect
    // Connect all online nodes to supernodes (hub-spoke pattern)
    const links = [];
    const supernodes = graphNodes.filter(n => n.nodeType === 'supernode' && n.status === 'online');
    const onlineNodes = graphNodes.filter(n => n.nodeType !== 'supernode' && n.status === 'online');
    
    // Connect each online node to the first online supernode
    if (supernodes.length > 0) {
      const hub = supernodes[0];
      onlineNodes.forEach(node => {
        links.push({
          source: hub.id,
          target: node.id
        });
      });
      
      // Connect supernodes together
      for (let i = 1; i < supernodes.length; i++) {
        links.push({
          source: supernodes[0].id,
          target: supernodes[i].id
        });
      }
    }
    
    return { nodes: graphNodes, links };
  }, [nodes]);
  
  // Color based on status and type
  const getNodeColor = (node) => {
    // Supernodes are always gold/yellow
    if (node.nodeType === 'supernode') {
      return node.status === 'online' ? '#F0B90B' : '#a07a08';
    }
    
    switch (node.status) {
      case 'online':
        return '#22c55e'; // Green
      case 'offline':
        return '#555555'; // Dark gray
      case 'stale':
        return '#ef4444'; // Red (dim)
      default:
        return '#444444';
    }
  };
  
  // Size based on node type and activity
  const getNodeSize = (node) => {
    // Supernodes are bigger
    if (node.nodeType === 'supernode') {
      return 14;
    }
    
    // PC2 nodes size by activity
    if (node.nodeType === 'pc2') {
      switch (node.activityType) {
        case 'always-on':
          return 8;
        case 'intermittent':
          return 6;
        default:
          return 5;
      }
    }
    
    // Registered but not PC2 nodes
    return 4;
  };
  
  // Custom node rendering with glow effect
  const paintNode = (node, ctx, globalScale) => {
    const size = getNodeSize(node);
    const color = getNodeColor(node);
    
    // Extra glow for supernodes
    if (node.nodeType === 'supernode') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 8, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    }
    
    // Glow effect for online nodes
    if (node.status === 'online') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}44`;
      ctx.fill();
    }
    
    // Main node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Border - thicker for supernodes
    ctx.strokeStyle = node.nodeType === 'supernode' ? '#ffffff55' : (node.status === 'online' ? '#ffffff33' : '#00000033');
    ctx.lineWidth = node.nodeType === 'supernode' ? 2 : 1;
    ctx.stroke();
  };
  
  return (
    <div className="network-map" ref={containerRef}>
      {nodes.length === 0 ? (
        <div className="network-map-loading">
          <p>No nodes to display</p>
        </div>
      ) : (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, getNodeSize(node) + 6, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkColor={() => '#2a2b30'}
          linkWidth={1}
          linkOpacity={0.3}
          backgroundColor="#1c1d22"
          width={dimensions.width}
          height={dimensions.height}
          // Physics settings for smooth interaction
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.4}
          warmupTicks={50}
          cooldownTicks={100}
          // Enable dragging!
          enableNodeDrag={true}
          onNodeDragEnd={(node) => {
            // Fix node position after drag
            node.fx = node.x;
            node.fy = node.y;
          }}
          // Enable zoom and pan
          enableZoom={true}
          enablePan={true}
          minZoom={0.5}
          maxZoom={4}
          // Tooltip on hover
          nodeLabel={(node) => {
            const type = node.nodeType === 'supernode' ? 'Supernode' : 
                         node.nodeType === 'pc2' ? 'PC2 Node' : 'Registered';
            return `${type} | ${node.id} | ${node.status}`;
          }}
          // Click to unfix dragged nodes
          onNodeClick={(node) => {
            node.fx = null;
            node.fy = null;
          }}
        />
      )}
    </div>
  );
}

export default NetworkGraph;
