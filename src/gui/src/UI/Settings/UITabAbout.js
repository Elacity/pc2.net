/**
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

// System - Updated for PC2 Personal Cloud
export default {
    id: 'system',
    title_i18n_key: 'system',
    icon: 'info-outline.svg',
    html: () => {
        // Check if we're in PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );
        
        if (isPC2Mode) {
            return `
                <style>
                    .sys-section { margin-bottom: 14px; }
                    .sys-section-title { font-size: 11px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
                    .sys-card { background: #f9f9f9; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
                    .sys-card-row { display: flex; justify-content: space-between; align-items: center; }
                    .sys-card-label { font-size: 13px; font-weight: 500; color: #333; }
                    .sys-card-value { font-size: 12px; color: #666; }
                    .sys-group { background: #f9f9f9; border-radius: 8px; border: 1px solid #d0d0d0; overflow: hidden; }
                    .sys-group-row { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; }
                    .sys-group-row:last-child { border-bottom: none; }
                    .status-ok { color: #16a34a !important; }
                    .status-error { color: #dc2626 !important; }
                    .check-updates-btn { background: #3b82f6; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; }
                    .check-updates-btn:disabled { opacity: 0.6; }
                    .check-updates-btn svg { width: 12px; height: 12px; }
                </style>
                
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 16px;">
                    <svg width="60" height="60" viewBox="0 0 1080 1080" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 8px;">
                        <rect width="1080" height="1080" rx="200" fill="#141414"/>
                        <path d="M793.209 532.947L732.073 496.935L706.111 481.861C696.061 475.998 684.336 475.998 674.286 481.861L555.363 550.534C545.314 556.396 533.589 556.396 523.539 550.534L405.454 481.861C395.404 475.998 383.679 475.998 373.629 481.861L347.667 496.935L286.531 532.947C265.594 545.509 265.594 575.658 286.531 587.383L390.379 647.682L525.214 725.567C535.264 731.43 546.989 731.43 557.038 725.567L691.873 647.682L795.722 587.383C814.984 575.658 814.984 545.509 793.209 532.947Z" fill="url(#paint0_system)"/>
                        <path d="M793.218 406.483L705.283 355.397C695.233 349.534 683.508 349.534 673.458 355.397L554.535 424.07C544.486 429.933 532.761 429.933 522.711 424.07L403.788 355.397C393.738 349.534 382.014 349.534 371.964 355.397L285.703 406.483C264.766 419.045 264.766 449.195 285.703 460.919L347.677 496.931L389.551 521.218L524.386 599.104C534.436 604.966 546.16 604.966 556.21 599.104L691.045 521.218L732.92 496.931L794.893 460.919C814.993 449.195 814.993 419.045 793.218 406.483Z" fill="url(#paint1_system)"/>
                        <defs><linearGradient id="paint0_system" x1="539.755" y1="730.757" x2="539.755" y2="477.963" gradientUnits="userSpaceOnUse"><stop stop-color="#F6921A"/><stop offset="1" stop-color="#B04200"/></linearGradient><linearGradient id="paint1_system" x1="539.75" y1="447.142" x2="539.75" y2="604.378" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEEDC"/><stop offset="1" stop-color="#FFC382"/></linearGradient></defs>
                    </svg>
                    <h1 style="margin: 0; font-size: 18px; font-weight: 600;">ElastOS Personal Cloud</h1>
                    <p style="color: #666; margin: 4px 0 0; font-size: 12px;">Your Sovereign Cloud Computer</p>
                </div>
                
                <!-- Update Banner -->
                <div id="update-banner" style="display: none; margin-bottom: 12px;">
                    <div style="background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%); color: white; padding: 12px 14px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="window.showUpdateModal && window.showUpdateModal(window.latestVersionInfo)">
                        <div><div style="font-weight: 600; font-size: 12px;">Update Available</div><div id="update-banner-version" style="font-size: 10px; opacity: 0.9;">New version</div></div>
                        <div style="background: white; color: #357abd; padding: 5px 10px; border-radius: 4px; font-size: 10px; font-weight: 600;">Install</div>
                    </div>
                </div>
                
                <!-- Check Updates -->
                <div style="text-align: center; margin-bottom: 16px;">
                    <button id="check-updates-btn" class="check-updates-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg><span>Check for Updates</span></button>
                    <div id="update-check-status" style="margin-top: 6px; font-size: 10px; color: #666;"></div>
                </div>
                
                <!-- Version -->
                <div class="sys-section">
                    <div class="sys-section-title">Version</div>
                    <div class="sys-group">
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Current</span><span id="system-current-version" class="sys-card-value">-</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Latest</span><span id="system-latest-version" class="sys-card-value">-</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Last Check</span><span id="system-last-check" class="sys-card-value">Never</span></div></div>
                    </div>
                </div>
                
                <!-- Status -->
                <div class="sys-section">
                    <div class="sys-section-title">Status</div>
                    <div class="sys-group">
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Database</span><span id="system-database-status" class="sys-card-value">-</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">IPFS</span><span id="system-ipfs-status" class="sys-card-value">-</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Node ID</span><span id="system-node-id" class="sys-card-value" style="font-family: monospace; font-size: 10px;">-</span></div></div>
                    </div>
                </div>
                
                <!-- Network -->
                <div class="sys-section">
                    <div class="sys-section-title">Network</div>
                    <div class="sys-group">
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">API</span><span id="system-api-url" class="sys-card-value" style="font-family: monospace; font-size: 10px;">-</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Gateway</span><span id="system-gateway-url" class="sys-card-value" style="font-family: monospace; font-size: 10px;">-</span></div></div>
                    </div>
                </div>
                
                <!-- Desktop -->
                <div class="sys-section">
                    <div class="sys-section-title">Desktop</div>
                    <div class="sys-group">
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Environment</span><span class="sys-card-value">PC2 Desktop</span></div></div>
                        <div class="sys-group-row"><div class="sys-card-row"><span class="sys-card-label">Mode</span><span id="system-desktop-mode" class="sys-card-value">Personal Cloud</span></div></div>
                    </div>
                </div>
                
                <!-- Links -->
                <div style="text-align: center; font-size: 11px; margin-top: 16px;">
                    <a href="https://elastos.info" target="_blank">ElastOS</a> · <a href="https://github.com/Elacity/pc2.net" target="_blank">GitHub</a> · <a href="https://discord.gg/elastos" target="_blank">Discord</a> · <a href="#" class="show-credits">Credits</a>
                </div>
                
                <dialog class="credits"><div class="credit-content" style="padding: 16px;"><p style="margin: 0 0 10px; font-size: 14px; text-align: center;">Open Source Credits</p><ul style="padding-left: 20px; font-size: 12px; line-height: 1.8;"><li>Puter - Desktop environment</li><li>Helia - IPFS</li><li>libp2p - P2P networking</li><li>Express.js - HTTP server</li></ul></div></dialog>`;
        }
        
        // Original Puter About for non-PC2 mode
        return `
            <div class="about-container">
                <div class="about">
                    <a href="https://puter.com" target="_blank" class="logo"><img src="/images/logo.png"></a>
                    <p class="description">${i18n('puter_description')}</p>
                    <p class="links">
                        <a href="mailto:hey@puter.com" target="_blank">hey@puter.com</a>
                        <span style="color: #CCC;">•</span>
                        <a href="https://docs.puter.com" target="_blank">${i18n('developers')}</a>
                        <span style="color: #CCC;">•</span>
                        <a href="https://status.puter.com" target="_blank">${i18n('status')}</a>
                        <span style="color: #CCC;">•</span>
                        <a href="https://puter.com/terms" target="_blank">${i18n('terms')}</a>
                        <span style="color: #CCC;">•</span>
                        <a href="https://puter.com/privacy" target="_blank">${i18n('privacy')}</a>
                        <span style="color: #CCC;">•</span>
                        <a href="#" class="show-credits">${i18n('credits')}</a>
                    </p>
                    <div class="social-links">
                        <a href="https://twitter.com/HeyPuter/" target="_blank">
                            <svg viewBox="0 0 24 24" aria-hidden="true" style="opacity: 0.7;"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
                        </a>
                        <a href="https://github.com/HeyPuter/" target="_blank">
                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48">
                                <g transform="translate(0, 0)">
                                    <path fill-rule="evenodd" clip-rule="evenodd" fill="#5a606b" d="M24,0.6c-13.3,0-24,10.7-24,24c0,10.6,6.9,19.6,16.4,22.8 c1.2,0.2,1.6-0.5,1.6-1.2c0-0.6,0-2.1,0-4.1c-6.7,1.5-8.1-3.2-8.1-3.2c-1.1-2.8-2.7-3.5-2.7-3.5c-2.2-1.5,0.2-1.5,0.2-1.5 c2.4,0.2,3.7,2.5,3.7,2.5c2.1,3.7,5.6,2.6,7,2c0.2-1.6,0.8-2.6,1.5-3.2c-5.3-0.6-10.9-2.7-10.9-11.9c0-2.6,0.9-4.8,2.5-6.4 c-0.2-0.6-1.1-3,0.2-6.4c0,0,2-0.6,6.6,2.5c1.9-0.5,4-0.8,6-0.8c2,0,4.1,0.3,6,0.8c4.6-3.1,6.6-2.5,6.6-2.5c1.3,3.3,0.5,5.7,0.2,6.4 c1.5,1.7,2.5,3.8,2.5,6.4c0,9.2-5.6,11.2-11,11.8c0.9,0.7,1.6,2.2,1.6,4.4c0,3.2,0,5.8,0,6.6c0,0.6,0.4,1.4,1.7,1.2 C41.1,44.2,48,35.2,48,24.6C48,11.3,37.3,0.6,24,0.6z">
                                    </path>
                                </g>
                            </svg>
                        </a>
                        <a href="https://discord.gg/PQcx7Teh8u" target="_blank">
                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48"><g transform="translate(0, 0)"><path d="M19.837,20.3a2.562,2.562,0,0,0,0,5.106,2.562,2.562,0,0,0,0-5.106Zm8.4,0a2.562,2.562,0,1,0,2.346,2.553A2.45,2.45,0,0,0,28.232,20.3Z" fill="#444444" data-color="color-2"></path> <path d="M39.41,1H8.59A4.854,4.854,0,0,0,4,6V37a4.482,4.482,0,0,0,4.59,4.572H34.672l-1.219-4.255L36.4,40.054,39.18,42.63,44,47V6A4.854,4.854,0,0,0,39.41,1ZM30.532,31.038s-.828-.989-1.518-1.863a7.258,7.258,0,0,0,4.163-2.737A13.162,13.162,0,0,1,30.532,27.8a15.138,15.138,0,0,1-3.335.989,16.112,16.112,0,0,1-5.957-.023,19.307,19.307,0,0,1-3.381-.989,13.112,13.112,0,0,1-2.622-1.357,7.153,7.153,0,0,0,4.025,2.714c-.69.874-1.541,1.909-1.541,1.909-5.083-.161-7.015-3.5-7.015-3.5a30.8,30.8,0,0,1,3.312-13.409,11.374,11.374,0,0,1,6.463-2.415l.23.276a15.517,15.517,0,0,0-6.049,3.013s.506-.276,1.357-.667a17.272,17.272,0,0,1,5.221-1.449,2.266,2.266,0,0,1,.391-.046,19.461,19.461,0,0,1,4.646-.046A18.749,18.749,0,0,1,33.2,15.007a15.307,15.307,0,0,0-5.727-2.921l.322-.368a11.374,11.374,0,0,1,6.463,2.415A30.8,30.8,0,0,1,37.57,27.542S35.615,30.877,30.532,31.038Z" fill="#444444"></path></g></svg>            </a>
                        <a href="https://www.linkedin.com/company/puter/" target="_blank">
                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48">
                                <g transform="translate(0, 0)">
                                    <path fill="#5a606b" d="M46,0H2C0.9,0,0,0.9,0,2v44c0,1.1,0.9,2,2,2h44c1.1,0,2-0.9,2-2V2C48,0.9,47.1,0,46,0z M14.2,40.9H7.1V18 h7.1V40.9z M10.7,14.9c-2.3,0-4.1-1.8-4.1-4.1c0-2.3,1.8-4.1,4.1-4.1c2.3,0,4.1,1.8,4.1,4.1C14.8,13,13,14.9,10.7,14.9z M40.9,40.9 h-7.1V29.8c0-2.7,0-6.1-3.7-6.1c-3.7,0-4.3,2.9-4.3,5.9v11.3h-7.1V18h6.8v3.1h0.1c0.9-1.8,3.3-3.7,6.7-3.7c7.2,0,8.5,4.7,8.5,10.9 V40.9z">
                                    </path>
                                </g>
                            </svg>
                        </a>
                    </div>
                </div>
                <div class="version"></div>
    
                <dialog class="credits">
                    <div class="credit-content">
                        <p style="margin: 0; font-size: 18px; text-align: center;">${i18n('oss_code_and_content')}</p>
                        <div style="max-height: 300px; overflow-y: scroll;">
                            <ul style="padding-left: 25px; padding-top:15px;">
                                <li>FileSaver.js <a target="_blank" href="https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md">${i18n('license')}</a></li>
                                <li>html-entities <a target="_blank" href="https://github.com/mdevils/html-entities/blob/master/LICENSE">${i18n('license')}</a></li>
                                <li>iro.js <a target="_blank" href="https://github.com/jaames/iro.js/blob/master/LICENSE.txt">${i18n('license')}</a></li>
                                <li>jQuery <a target="_blank" href="https://jquery.org/license/">${i18n('license')}</a></li>
                                <li>jQuery-dragster <a target="_blank" href="https://github.com/catmanjan/jquery-dragster/blob/master/LICENSE">${i18n('license')}</a></li>
                                <li>jQuery-menu-aim <a target="_blank" href="https://github.com/kamens/jQuery-menu-aim?tab=readme-ov-file#faq">${i18n('license')}</a></li>
                                <li>jQuery UI <a target="_blank" href="https://jquery.org/license/">${i18n('license')}</a></li>
                                <li>lodash <a target="_blank" href="https://lodash.com/license">${i18n('license')}</a></li>
                                <li>mime <a target="_blank" href="https://github.com/broofa/mime/blob/main/LICENSE">${i18n('license')}</a></li>
                                <li>qrcodejs <a target="_blank" href="https://github.com/davidshimjs/qrcodejs/blob/master/LICENSE">${i18n('license')}</a></li>
                                <li>Selection <a target="_blank" href="https://github.com/simonwep/selection/blob/master/LICENSE">${i18n('license')}</a></li>
                                <li>socket.io <a target="_blank" href="https://github.com/socketio/socket.io/blob/main/LICENSE">${i18n('license')}</a></li>
                                <li>Wallpaper by <a target="_blank" href="https://unsplash.com/@fakurian?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash">Milad Fakurian</a> on <a target="_blank" href="https://unsplash.com/photos/blue-orange-and-yellow-wallpaper-E8Ufcyxz514?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash">Unsplash</a></li>
                                <li>Inter font by The Inter Project Authors <a target="_blank" href="https://github.com/rsms/inter">${i18n('license')}</a></li>                            
                            </ul>
                        </div>
                    </div>
                </dialog>
            </div>`;
    },
    init: async ($el_window) => {
        // Check if PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );
        
        if (isPC2Mode) {
            const apiOrigin = window.api_origin || window.location.origin;
            
            // Load system info from health endpoint
            try {
                const response = await fetch(`${apiOrigin}/health`);
                if (response.ok) {
                    const health = await response.json();
                    
                    $el_window.find('#system-current-version').text(health.version || '0.1.0');
                    $el_window.find('#system-database-status').html(
                        health.database === 'connected' 
                            ? '<span class="status-ok">Connected</span>' 
                            : '<span class="status-error">Disconnected</span>'
                    );
                    $el_window.find('#system-ipfs-status').html(
                        health.ipfs === 'available' 
                            ? '<span class="status-ok">Available</span>' 
                            : '<span class="status-error">Unavailable</span>'
                    );
                    $el_window.find('#system-node-id').text(health.nodeId ? health.nodeId.substring(0, 20) + '...' : 'N/A');
                    $el_window.find('#system-api-url').text(apiOrigin);
                    $el_window.find('#system-gateway-url').text(`${apiOrigin}/ipfs/`);
                }
            } catch (error) {
                console.error('[System] Failed to load system info:', error);
                $el_window.find('#system-current-version').text('Error');
                $el_window.find('#system-database-status, #system-ipfs-status').html('<span class="status-error">Error</span>');
            }
            
            // Check for updates and show banner if available
            const checkAndDisplayUpdate = async () => {
                try {
                    const updateResponse = await fetch(`${apiOrigin}/api/update/status`, {
                        headers: { 'Authorization': `Bearer ${puter.authToken}` }
                    });
                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        window.latestVersionInfo = updateData;
                        
                        // Update version info
                        if (updateData.currentVersion) {
                            $el_window.find('#system-current-version').text(updateData.currentVersion);
                        }
                        if (updateData.latestVersion) {
                            $el_window.find('#system-latest-version').html(
                                updateData.updateAvailable 
                                    ? `<span class="status-ok">${updateData.latestVersion}</span> (new!)`
                                    : updateData.latestVersion
                            );
                        }
                        if (updateData.lastCheck) {
                            const lastCheck = new Date(updateData.lastCheck);
                            $el_window.find('#system-last-check').text(lastCheck.toLocaleString());
                        }
                        
                        if (updateData.updateAvailable) {
                            $el_window.find('#update-banner').show();
                            $el_window.find('#update-banner-version').text(
                                `Version ${updateData.latestVersion} is ready to install`
                            );
                        } else {
                            $el_window.find('#update-banner').hide();
                        }
                        
                        return updateData;
                    }
                } catch (error) {
                    console.log('[System] Could not check for updates:', error);
                }
                return null;
            };
            
            // Initial check
            await checkAndDisplayUpdate();
            
            // Check for Updates button handler
            $el_window.find('#check-updates-btn').on('click', async function() {
                const $btn = $(this);
                const $status = $el_window.find('#update-check-status');
                
                $btn.prop('disabled', true);
                $btn.find('span').text('Checking...');
                $status.text('');
                
                try {
                    // Trigger a fresh check
                    const response = await fetch(`${apiOrigin}/api/update/check`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${puter.authToken}` }
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        window.latestVersionInfo = result;
                        
                        // Update display
                        await checkAndDisplayUpdate();
                        
                        if (result.updateAvailable) {
                            $status.html('<span class="status-ok">Update available! Click the banner above to install.</span>');
                        } else {
                            $status.html('<span style="color: #666;">You\'re up to date!</span>');
                        }
                    } else {
                        $status.html('<span class="status-error">Failed to check for updates</span>');
                    }
                } catch (error) {
                    console.error('[System] Check failed:', error);
                    $status.html('<span class="status-error">Network error</span>');
                } finally {
                    $btn.prop('disabled', false);
                    $btn.find('span').text('Check for Updates');
                }
            });
        } else {
            // Original Puter version info for non-PC2 mode
            puter.os.version()
                .then(res => {
                    const deployed_date = new Date(res.deploy_timestamp).toLocaleString();
                    $el_window.find('.version').html(`Version: ${html_encode(res.version)} &bull; Server: ${html_encode(res.location)} &bull; Deployed: ${html_encode(deployed_date)}`);
                })
                .catch(error => {
                    console.error('Failed to fetch server info:', error);
                    $el_window.find('.version').html('Failed to load version information.');
                });
        }
        
        // Credits dialog handler (works for both modes)
        $el_window.find('.credits').on('click', function (e) {
            if ($(e.target).hasClass('credits')) {
                $(this).get(0).close();
            }
        });

        $el_window.find('.show-credits').on('click', function (e) {
            $el_window.find('.credits').get(0).showModal();
        });
    },
};
