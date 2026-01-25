/**
 * Stats API - Network statistics and timeline data
 * 
 * All data is aggregate only - no individual node information exposed.
 */

import { Router } from 'express';
import { getNetworkStats, getTimeline } from '../database.js';

export function createStatsRouter() {
  const router = Router();
  
  /**
   * GET /api/stats
   * Get current network statistics
   */
  router.get('/', (req, res) => {
    try {
      const stats = getNetworkStats();
      
      res.json({
        ...stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });
  
  /**
   * GET /api/stats/timeline
   * Get historical network size data for charts
   * 
   * Query params:
   * - days: number of days to include (default 30, max 365)
   */
  router.get('/timeline', (req, res) => {
    try {
      const days = Math.min(parseInt(req.query.days) || 30, 365);
      const timeline = getTimeline(days);
      
      res.json({
        timeline,
        days
      });
      
    } catch (error) {
      console.error('Error fetching timeline:', error);
      res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  });
  
  /**
   * GET /api/stats/summary
   * Get a quick summary for the hero section
   */
  router.get('/summary', (req, res) => {
    try {
      const stats = getNetworkStats();
      
      // Only return the essential display numbers
      res.json({
        onlineNow: stats.onlineNow,
        totalNodes: stats.totalActivePC2,
        alwaysOn: stats.activityDistribution.alwaysOn,
        intermittent: stats.activityDistribution.intermittent
      });
      
    } catch (error) {
      console.error('Error fetching summary:', error);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });
  
  return router;
}
