import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Statistics Charts - Aggregate network data visualization
 */
function StatsChart({ stats }) {
  const [timeline, setTimeline] = useState([]);
  
  useEffect(() => {
    fetch('/api/stats/timeline?days=30')
      .then(res => res.json())
      .then(data => setTimeline(data.timeline || []))
      .catch(err => console.error('Timeline fetch error:', err));
  }, []);
  
  // Activity distribution data for pie chart
  const activityData = [
    { name: 'Always On', value: stats?.activityDistribution?.alwaysOn || 0, color: '#22c55e' },
    { name: 'Intermittent', value: stats?.activityDistribution?.intermittent || 0, color: '#F0B90B' },
    { name: 'Occasional', value: stats?.activityDistribution?.occasional || 0, color: '#3b82f6' },
    { name: 'Inactive', value: stats?.activityDistribution?.inactive || 0, color: '#888888' }
  ].filter(d => d.value > 0);
  
  // Status data for pie chart
  const statusData = [
    { name: 'Online', value: stats?.onlineNow || 0, color: '#22c55e' },
    { name: 'Offline', value: stats?.offlineNow || 0, color: '#888888' },
    { name: 'Stale', value: stats?.staleNodes || 0, color: '#ef4444' }
  ].filter(d => d.value > 0);
  
  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
        <StatCard label="Total Nodes" value={stats?.totalActivePC2 || 0} />
        <StatCard label="Online Now" value={stats?.onlineNow || 0} color="#22c55e" />
        <StatCard label="Offline" value={stats?.offlineNow || 0} color="#888888" />
        <StatCard label="Stale" value={stats?.staleNodes || 0} color="#ef4444" />
      </div>
      
      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        {/* Status distribution */}
        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Current Status
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {statusData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1c1d22', border: '1px solid #2a2b30', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <Legend data={statusData} />
        </div>
        
        {/* Activity distribution */}
        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Activity Patterns
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={activityData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {activityData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1c1d22', border: '1px solid #2a2b30', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <Legend data={activityData} />
        </div>
      </div>
      
      {/* Timeline chart */}
      {timeline.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Network Growth (Last 30 Days)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={timeline}>
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#888888', fontSize: 11 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fill: '#888888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1c1d22', border: '1px solid #2a2b30', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value) => [value, 'Nodes']}
              />
              <Bar dataKey="onlineNodes" fill="#22c55e" name="Online" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      padding: '20px',
      borderRadius: '12px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '32px', fontWeight: '600', color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}

function Legend({ data }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
      {data.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {item.name} ({item.value})
          </span>
        </div>
      ))}
    </div>
  );
}

export default StatsChart;
