# Storage Usage Dashboard: Professional Implementation Plan

**Date:** 2025-01-11  
**Status:** Implementation Ready

---

## 🎯 Professional Recommendation

### ✅ **RECOMMENDED: Add as Settings Tab (Not Standalone)**

**Why This Approach:**

1. **User Mental Model**: Users expect storage information in Settings (like macOS, Windows, iOS)
2. **Consistency**: Follows existing Settings window pattern (`UIWindowSettings.js`)
3. **Discoverability**: Already accessible via Settings menu
4. **Maintainability**: Uses existing infrastructure (SettingsService, tab system)
5. **Professional UX**: Matches industry standards (Settings → Storage)

**Alternative (Not Recommended):**
- Standalone window would require custom UI, less discoverable, inconsistent with existing patterns

---

## 📋 Implementation Plan

### Step 1: Create Settings Tab Component

**File:** `src/gui/src/UI/Settings/UITabStorage.js`

**Pattern:** Follow `UITabPersonalization.js` structure

```javascript
/**
 * Storage Usage Dashboard Tab
 * Shows storage breakdown, largest files, storage trends
 */
export default {
    id: 'storage',
    title_i18n_key: 'storage',
    icon: 'storage-outline.svg', // or 'hard-drive-outline.svg'
    html: () => {
        return `
            <h1>${i18n('storage')}</h1>
            
            <!-- Storage Overview Card -->
            <div class="settings-card">
                <div class="storage-overview">
                    <div class="storage-total">
                        <strong>${i18n('total_storage')}</strong>
                        <div class="storage-value" id="storage-total">Loading...</div>
                    </div>
                    <div class="storage-used">
                        <strong>${i18n('storage_used')}</strong>
                        <div class="storage-value" id="storage-used">Loading...</div>
                    </div>
                    <div class="storage-available">
                        <strong>${i18n('storage_available')}</strong>
                        <div class="storage-value" id="storage-available">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- Storage by Type (Pie Chart) -->
            <div class="settings-card">
                <strong>${i18n('storage_by_type')}</strong>
                <div class="storage-chart-container">
                    <canvas id="storage-pie-chart" width="300" height="300"></canvas>
                    <div class="storage-legend" id="storage-legend"></div>
                </div>
            </div>

            <!-- Largest Files -->
            <div class="settings-card">
                <div class="storage-section-header">
                    <strong>${i18n('largest_files')}</strong>
                    <button class="button button-small" id="refresh-storage">${i18n('refresh')}</button>
                </div>
                <div class="storage-files-list" id="largest-files-list">
                    <div class="loading">Loading...</div>
                </div>
            </div>

            <!-- Storage Timeline -->
            <div class="settings-card">
                <strong>${i18n('storage_timeline')}</strong>
                <div class="storage-timeline-container">
                    <canvas id="storage-timeline-chart" width="600" height="200"></canvas>
                </div>
            </div>

            <!-- Unused Files -->
            <div class="settings-card">
                <div class="storage-section-header">
                    <strong>${i18n('unused_files')}</strong>
                    <span class="storage-hint">${i18n('files_not_accessed_in_30_days')}</span>
                </div>
                <div class="storage-files-list" id="unused-files-list">
                    <div class="loading">Loading...</div>
                </div>
            </div>
        `;
    },
    init: async ($el_window) => {
        // Load storage data
        await loadStorageData($el_window);
        
        // Refresh button
        $el_window.find('#refresh-storage').on('click', () => {
            loadStorageData($el_window);
        });
    },
    on_show: async ($content) => {
        // Refresh data when tab is shown
        await loadStorageData($content.closest('.settings'));
    }
};
```

---

### Step 2: Register Tab in SettingsService

**File:** `src/gui/src/services/SettingsService.js`

**Add to `get_tabs()` method:**

```javascript
get_tabs() {
    return [
        // ... existing tabs ...
        {
            id: 'storage',
            title_i18n_key: 'storage',
            icon: 'storage-outline.svg',
            factory: () => {
                // Import and return tab component
                return import('../UI/Settings/UITabStorage.js').then(m => m.default);
            }
        }
    ];
}
```

---

### Step 3: Backend API Endpoint

**File:** `pc2-node/test-fresh-install/src/api/storage.ts` (new file)

```typescript
import { Router } from 'express';
import { getDatabase } from '../storage/database.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/storage/usage
 * Returns storage usage statistics
 */
router.get('/usage', async (req, res) => {
    try {
        const db = getDatabase();
        const userAddress = req.user?.wallet_address;
        
        if (!userAddress) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get total storage used
        const totalResult = await db.get(`
            SELECT 
                COALESCE(SUM(size), 0) as total_size,
                COUNT(*) as file_count
            FROM files
            WHERE owner_address = ?
        `, [userAddress]);

        // Get storage by file type
        const byTypeResult = await db.all(`
            SELECT 
                type,
                COALESCE(SUM(size), 0) as total_size,
                COUNT(*) as file_count
            FROM files
            WHERE owner_address = ?
            GROUP BY type
            ORDER BY total_size DESC
        `, [userAddress]);

        // Get largest files
        const largestFiles = await db.all(`
            SELECT 
                path,
                name,
                size,
                type,
                modified
            FROM files
            WHERE owner_address = ?
            ORDER BY size DESC
            LIMIT 10
        `, [userAddress]);

        // Get unused files (not accessed in 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const unusedFiles = await db.all(`
            SELECT 
                path,
                name,
                size,
                type,
                modified,
                last_accessed
            FROM files
            WHERE owner_address = ?
            AND (last_accessed IS NULL OR last_accessed < ?)
            ORDER BY size DESC
            LIMIT 20
        `, [userAddress, thirtyDaysAgo]);

        // Get storage timeline (last 12 months)
        const timeline = await db.all(`
            SELECT 
                DATE(created_at, 'unixepoch') as date,
                SUM(size) as daily_size
            FROM files
            WHERE owner_address = ?
            AND created_at > ?
            GROUP BY date
            ORDER BY date ASC
        `, [userAddress, Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000)]);

        res.json({
            total: {
                size: totalResult.total_size || 0,
                files: totalResult.file_count || 0
            },
            byType: byTypeResult.map(row => ({
                type: row.type || 'unknown',
                size: row.total_size,
                files: row.file_count,
                percentage: totalResult.total_size > 0 
                    ? (row.total_size / totalResult.total_size * 100).toFixed(1)
                    : 0
            })),
            largestFiles: largestFiles.map(file => ({
                path: file.path,
                name: file.name,
                size: file.size,
                type: file.type,
                modified: file.modified
            })),
            unusedFiles: unusedFiles.map(file => ({
                path: file.path,
                name: file.name,
                size: file.size,
                type: file.type,
                modified: file.modified,
                lastAccessed: file.last_accessed
            })),
            timeline: timeline.map(row => ({
                date: row.date,
                size: row.daily_size
            }))
        });
    } catch (error) {
        logger.error('[Storage API]: Error getting storage usage:', error);
        res.status(500).json({ error: 'Failed to get storage usage' });
    }
});

export default router;
```

**Register in main server:**

```typescript
// In server.ts
import storageRouter from './api/storage.js';
app.use('/api/storage', storageRouter);
```

---

### Step 4: Frontend Data Loading

**Add to `UITabStorage.js`:**

```javascript
async function loadStorageData($container) {
    const $el_window = $container.closest('.settings');
    
    try {
        // Show loading state
        $el_window.find('.storage-value, .storage-files-list').html('<div class="loading">Loading...</div>');
        
        // Fetch data from API
        const response = await puter.http.request({
            method: 'GET',
            url: '/api/storage/usage',
            headers: {
                'Authorization': `Bearer ${window.auth_token}`
            }
        });
        
        const data = await response.json();
        
        // Update overview
        $el_window.find('#storage-total').text(formatBytes(data.total.size));
        $el_window.find('#storage-used').text(formatBytes(data.total.size));
        $el_window.find('#storage-available').text('Unlimited'); // Or calculate from quota
        
        // Render pie chart
        renderPieChart($el_window.find('#storage-pie-chart')[0], data.byType);
        
        // Render timeline
        renderTimelineChart($el_window.find('#storage-timeline-chart')[0], data.timeline);
        
        // Render largest files
        renderFilesList($el_window.find('#largest-files-list'), data.largestFiles);
        
        // Render unused files
        renderFilesList($el_window.find('#unused-files-list'), data.unusedFiles);
        
    } catch (error) {
        console.error('[Storage Dashboard]: Error loading data:', error);
        $el_window.find('.storage-value, .storage-files-list').html(
            `<div class="error">Failed to load storage data: ${error.message}</div>`
        );
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function renderPieChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    let currentAngle = -Math.PI / 2; // Start at top
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a'];
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw pie slices
    data.forEach((item, index) => {
        const sliceAngle = (item.percentage / 100) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();
        
        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${item.percentage}%`, labelX, labelY);
        
        currentAngle += sliceAngle;
    });
    
    // Render legend
    const $legend = $(canvas).siblings('.storage-legend');
    $legend.empty();
    data.forEach((item, index) => {
        $legend.append(`
            <div class="legend-item">
                <span class="legend-color" style="background: ${colors[index % colors.length]}"></span>
                <span class="legend-label">${item.type || 'Unknown'}</span>
                <span class="legend-value">${formatBytes(item.size)}</span>
            </div>
        `);
    });
}

function renderTimelineChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (data.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Find max value for scaling
    const maxSize = Math.max(...data.map(d => d.size));
    
    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw line
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((point, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = canvas.height - padding - (point.size / maxSize) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#667eea';
    data.forEach((point, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = canvas.height - padding - (point.size / maxSize) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function renderFilesList($container, files) {
    if (files.length === 0) {
        $container.html('<div class="empty">No files found</div>');
        return;
    }
    
    $container.empty();
    files.forEach(file => {
        const $item = $(`
            <div class="storage-file-item">
                <div class="storage-file-icon">
                    <img src="${getFileIcon(file.type)}" alt="${file.type}">
                </div>
                <div class="storage-file-details">
                    <div class="storage-file-name">${file.name}</div>
                    <div class="storage-file-meta">
                        ${formatBytes(file.size)} • ${new Date(file.modified).toLocaleDateString()}
                    </div>
                </div>
                <div class="storage-file-size">${formatBytes(file.size)}</div>
            </div>
        `);
        
        // Make clickable to open file
        $item.on('click', () => {
            puter.fs.open(file.path);
        });
        
        $container.append($item);
    });
}

function getFileIcon(type) {
    // Return icon based on file type
    const iconMap = {
        'image': '/icons/image.svg',
        'video': '/icons/video.svg',
        'audio': '/icons/audio.svg',
        'document': '/icons/document.svg',
        'code': '/icons/code.svg',
        'archive': '/icons/archive.svg'
    };
    
    return iconMap[type] || '/icons/file.svg';
}
```

---

### Step 5: Add CSS Styling

**Add to existing Settings CSS or create new:**

```css
/* Storage Dashboard Styles */
.storage-overview {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.storage-value {
    font-size: 24px;
    font-weight: 600;
    color: #667eea;
    margin-top: 8px;
}

.storage-chart-container {
    display: flex;
    gap: 24px;
    align-items: center;
    margin-top: 16px;
}

.storage-legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

.legend-color {
    width: 16px;
    height: 16px;
    border-radius: 4px;
}

.storage-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.storage-files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
}

.storage-file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
}

.storage-file-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.storage-file-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.storage-file-details {
    flex: 1;
}

.storage-file-name {
    font-weight: 500;
    margin-bottom: 4px;
}

.storage-file-meta {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
}

.storage-file-size {
    font-weight: 600;
    color: #667eea;
}
```

---

## 📊 UI Components Summary

### What Will Be Added:

1. **Storage Overview Card**
   - Total storage
   - Storage used
   - Storage available

2. **Storage by Type (Pie Chart)**
   - Visual breakdown by file type
   - Legend with percentages
   - Color-coded segments

3. **Largest Files List**
   - Top 10 largest files
   - Clickable to open files
   - Shows size and date

4. **Storage Timeline Chart**
   - Line chart showing growth over time
   - Last 12 months of data
   - Visual trend indicator

5. **Unused Files List**
   - Files not accessed in 30+ days
   - Helps identify cleanup opportunities
   - Clickable to open files

---

## 🎯 Benefits of This Approach

1. **Consistent UX**: Matches existing Settings window pattern
2. **Discoverable**: Users naturally look in Settings for storage info
3. **Maintainable**: Uses existing SettingsService infrastructure
4. **Professional**: Follows industry standards (macOS, Windows, iOS)
5. **Extensible**: Easy to add more storage-related features later

---

## ⚡ Quick Implementation (4-6 hours)

1. **Create tab component** (1 hour)
2. **Register in SettingsService** (15 minutes)
3. **Create backend API** (1.5 hours)
4. **Add frontend data loading** (1.5 hours)
5. **Add CSS styling** (1 hour)
6. **Test and polish** (30 minutes)

---

## 🚀 Future Enhancements

- Storage quota management
- Automatic cleanup suggestions
- Storage alerts (when approaching limit)
- Export storage report
- Storage optimization tips

---

**Status:** Ready for Implementation  
**Recommendation:** ✅ **Add as Settings Tab** (Professional, Consistent, Discoverable)

