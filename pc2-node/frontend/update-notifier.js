/**
 * PC2 Update Notifier
 * 
 * Checks for updates on page load and shows a notification banner if available.
 * Follows macOS-style user-initiated updates.
 */

(function() {
  'use strict';
  
  const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  const DISMISSED_KEY = 'pc2_update_dismissed_version';
  
  // Style for the update banner
  const styles = `
    .pc2-update-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      color: white;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      animation: pc2-slide-down 0.3s ease-out;
    }
    
    @keyframes pc2-slide-down {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    .pc2-update-banner-icon {
      font-size: 18px;
    }
    
    .pc2-update-banner-text {
      flex: 1;
    }
    
    .pc2-update-banner-text strong {
      font-weight: 600;
    }
    
    .pc2-update-banner-btn {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
    }
    
    .pc2-update-banner-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    
    .pc2-update-banner-btn.primary {
      background: white;
      color: #2563eb;
      border-color: white;
    }
    
    .pc2-update-banner-btn.primary:hover {
      background: #f0f0f0;
    }
    
    .pc2-update-banner-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      padding: 4px;
    }
    
    .pc2-update-banner-close:hover {
      color: white;
    }
  `;
  
  /**
   * Create and show the update banner
   */
  function showUpdateBanner(currentVersion, latestVersion, releaseNotes) {
    // Check if already dismissed this version
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === latestVersion) {
      console.log('[PC2 Update] Banner dismissed for version:', latestVersion);
      return;
    }
    
    // Inject styles
    if (!document.getElementById('pc2-update-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'pc2-update-styles';
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    }
    
    // Remove existing banner
    const existing = document.getElementById('pc2-update-banner');
    if (existing) {
      existing.remove();
    }
    
    // Create banner
    const banner = document.createElement('div');
    banner.id = 'pc2-update-banner';
    banner.className = 'pc2-update-banner';
    banner.innerHTML = `
      <span class="pc2-update-banner-icon">🚀</span>
      <span class="pc2-update-banner-text">
        <strong>PC2 v${latestVersion}</strong> is available! 
        You're on v${currentVersion}.
        ${releaseNotes ? `<span style="opacity:0.8;margin-left:8px;">${releaseNotes.substring(0, 50)}${releaseNotes.length > 50 ? '...' : ''}</span>` : ''}
      </span>
      <button class="pc2-update-banner-btn" onclick="window.pc2ShowReleaseNotes()">Release Notes</button>
      <button class="pc2-update-banner-btn primary" onclick="window.pc2OpenUpdateGuide()">Update Now</button>
      <button class="pc2-update-banner-close" onclick="window.pc2DismissUpdate()" title="Dismiss">×</button>
    `;
    
    document.body.appendChild(banner);
    
    // Store version info globally for button handlers
    window._pc2UpdateInfo = { currentVersion, latestVersion, releaseNotes };
    
    console.log('[PC2 Update] Banner shown for update:', currentVersion, '->', latestVersion);
  }
  
  /**
   * Dismiss the update banner
   */
  window.pc2DismissUpdate = function() {
    const banner = document.getElementById('pc2-update-banner');
    if (banner) {
      banner.style.animation = 'none';
      banner.style.transform = 'translateY(-100%)';
      banner.style.opacity = '0';
      banner.style.transition = 'all 0.3s ease-out';
      setTimeout(() => banner.remove(), 300);
    }
    
    // Remember dismissed version
    if (window._pc2UpdateInfo) {
      localStorage.setItem(DISMISSED_KEY, window._pc2UpdateInfo.latestVersion);
    }
  };
  
  /**
   * Show release notes
   */
  window.pc2ShowReleaseNotes = function() {
    const info = window._pc2UpdateInfo;
    if (info && info.releaseNotes) {
      alert(`PC2 v${info.latestVersion} Release Notes:\n\n${info.releaseNotes}`);
    } else {
      window.open('https://github.com/elastos/pc2/releases', '_blank');
    }
  };
  
  /**
   * Open update guide
   */
  window.pc2OpenUpdateGuide = function() {
    const info = window._pc2UpdateInfo;
    
    // Show update instructions based on deployment type
    const isDocker = Boolean(document.querySelector('meta[name="pc2-docker"]'));
    
    if (isDocker) {
      alert(
        `To update your PC2 node:\n\n` +
        `1. Open a terminal on your server\n` +
        `2. Navigate to your PC2 directory\n` +
        `3. Run: docker-compose pull\n` +
        `4. Run: docker-compose up -d\n\n` +
        `Your data will be preserved during the update.`
      );
    } else {
      window.open('https://github.com/elastos/pc2/releases', '_blank');
    }
  };
  
  /**
   * Check for updates
   */
  async function checkForUpdates() {
    try {
      const response = await fetch('/api/update/status');
      if (!response.ok) {
        console.log('[PC2 Update] Status check failed:', response.status);
        return;
      }
      
      const data = await response.json();
      
      if (data.updateAvailable) {
        showUpdateBanner(
          data.currentVersion,
          data.latestVersion,
          data.releaseNotes
        );
      } else {
        console.log('[PC2 Update] Up to date:', data.currentVersion);
      }
    } catch (error) {
      console.log('[PC2 Update] Check failed:', error.message);
    }
  }
  
  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    // Check immediately
    checkForUpdates();
    
    // Check periodically
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  }
})();
