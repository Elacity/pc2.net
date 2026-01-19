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

// About - Updated for PC2 Personal Cloud
export default {
    id: 'about',
    title_i18n_key: 'about',
    icon: 'logo-outline.svg',
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
                    /* Override default centering - content starts at top and scrolls */
                    .settings-content[data-settings="about"] .about-container {
                        height: auto !important;
                        min-height: 100%;
                        display: block !important;
                        align-items: flex-start !important;
                        justify-content: flex-start !important;
                        overflow-y: auto;
                        overflow-x: hidden;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    .settings-content[data-settings="about"] .about {
                        text-align: center;
                        max-width: 500px;
                        margin: 0 auto;
                        padding: 0;
                    }
                </style>
                <div class="about-container">
                    <div class="about">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <svg width="80" height="80" viewBox="0 0 1080 1080" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 10px;">
                                <rect width="1080" height="1080" rx="200" fill="#141414"/>
                                <path d="M793.209 532.947L732.073 496.935L706.111 481.861C696.061 475.998 684.336 475.998 674.286 481.861L555.363 550.534C545.314 556.396 533.589 556.396 523.539 550.534L405.454 481.861C395.404 475.998 383.679 475.998 373.629 481.861L347.667 496.935L286.531 532.947C265.594 545.509 265.594 575.658 286.531 587.383L390.379 647.682L525.214 725.567C535.264 731.43 546.989 731.43 557.038 725.567L691.873 647.682L795.722 587.383C814.984 575.658 814.984 545.509 793.209 532.947Z" fill="url(#paint0_about)"/>
                                <path d="M793.218 406.483L705.283 355.397C695.233 349.534 683.508 349.534 673.458 355.397L554.535 424.07C544.486 429.933 532.761 429.933 522.711 424.07L403.788 355.397C393.738 349.534 382.014 349.534 371.964 355.397L285.703 406.483C264.766 419.045 264.766 449.195 285.703 460.919L347.677 496.931L389.551 521.218L524.386 599.104C534.436 604.966 546.16 604.966 556.21 599.104L691.045 521.218L732.92 496.931L794.893 460.919C814.993 449.195 814.993 419.045 793.218 406.483Z" fill="url(#paint1_about)"/>
                                <defs>
                                    <linearGradient id="paint0_about" x1="539.755" y1="730.757" x2="539.755" y2="477.963" gradientUnits="userSpaceOnUse">
                                        <stop stop-color="#F6921A"/><stop offset="1" stop-color="#B04200"/>
                                    </linearGradient>
                                    <linearGradient id="paint1_about" x1="539.75" y1="447.142" x2="539.75" y2="604.378" gradientUnits="userSpaceOnUse">
                                        <stop stop-color="#FFEEDC"/><stop offset="1" stop-color="#FFC382"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">ElastOS Personal Cloud</h1>
                            <p style="color: #666; margin: 5px 0 0;">Your Sovereign Cloud Computer</p>
                        </div>
                        
                        <p class="description" style="text-align: center; color: #555; line-height: 1.6;">
                            One of millions of self-hosted personal clouds running on your own hardware, 
                            interconnected above blockchain governance to form the World Computer. 
                            Your data, your control, powered by decentralized identity.
                        </p>
                        
                        <!-- System Information -->
                        <h2 style="font-size: 14px; margin: 25px 0 10px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">System Information</h2>
                        
                        <div class="settings-card" style="margin-bottom: 8px;">
                            <strong>Node Version</strong>
                            <span id="about-node-version" style="font-size: 13px; color: #666;">Loading...</span>
                        </div>
                        
                        <div class="settings-card" style="margin-bottom: 8px;">
                            <strong>Node Uptime</strong>
                            <span id="about-node-uptime" style="font-size: 13px; color: #666;">Loading...</span>
                        </div>
                        
                        <div class="settings-card" style="margin-bottom: 8px;">
                            <strong>Database</strong>
                            <span id="about-database-status" style="font-size: 13px; color: #666;">Loading...</span>
                        </div>
                        
                        <div class="settings-card" style="margin-bottom: 8px;">
                            <strong>IPFS</strong>
                            <span id="about-ipfs-status" style="font-size: 13px; color: #666;">Loading...</span>
                        </div>
                        
                        <div class="settings-card" style="margin-bottom: 8px;">
                            <strong>Gateway URL</strong>
                            <span id="about-gateway-url" style="font-size: 12px; font-family: monospace; color: #666;">Loading...</span>
                        </div>
                        
                        <!-- Links -->
                        <h2 style="font-size: 14px; margin: 25px 0 10px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">Resources</h2>
                        
                        <p class="links" style="text-align: center;">
                            <a href="https://elastos.info" target="_blank">ElastOS</a>
                            <span style="color: #CCC;">•</span>
                            <a href="https://github.com/elastos" target="_blank">GitHub</a>
                            <span style="color: #CCC;">•</span>
                            <a href="https://discord.gg/elastos" target="_blank">Discord</a>
                            <span style="color: #CCC;">•</span>
                            <a href="#" class="show-credits">${i18n('credits')}</a>
                        </p>
                    </div>
                    
                    <dialog class="credits">
                        <div class="credit-content">
                            <p style="margin: 0; font-size: 18px; text-align: center;">Open Source Credits</p>
                            <div style="max-height: 300px; overflow-y: scroll;">
                                <ul style="padding-left: 25px; padding-top:15px;">
                                    <li>Puter - Base desktop environment</li>
                                    <li>Helia - IPFS implementation</li>
                                    <li>libp2p - P2P networking</li>
                                    <li>better-sqlite3 - Database</li>
                                    <li>Express.js - HTTP server</li>
                                    <li>Particle Network - Wallet authentication</li>
                                </ul>
                            </div>
                        </div>
                    </dialog>
                </div>`;
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
            // Load system info from health endpoint
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const response = await fetch(`${apiOrigin}/health`);
                if (response.ok) {
                    const health = await response.json();
                    
                    // Format uptime
                    const uptimeSeconds = health.uptime || 0;
                    const days = Math.floor(uptimeSeconds / 86400);
                    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                    const mins = Math.floor((uptimeSeconds % 3600) / 60);
                    let uptimeStr = '';
                    if (days > 0) uptimeStr += `${days}d `;
                    if (hours > 0) uptimeStr += `${hours}h `;
                    uptimeStr += `${mins}m`;
                    
                    $el_window.find('#about-node-version').text(health.version || '0.1.0');
                    $el_window.find('#about-node-uptime').text(uptimeStr || '-');
                    $el_window.find('#about-database-status').html(
                        health.database === 'connected' 
                            ? '<span style="color: #16a34a;">Connected</span>' 
                            : '<span style="color: #dc2626;">Disconnected</span>'
                    );
                    $el_window.find('#about-ipfs-status').html(
                        health.ipfs === 'available' 
                            ? '<span style="color: #16a34a;">Available</span>' 
                            : '<span style="color: #dc2626;">Unavailable</span>'
                    );
                    $el_window.find('#about-gateway-url').text(`${apiOrigin}/ipfs/`);
                }
            } catch (error) {
                console.error('[About] Failed to load system info:', error);
                $el_window.find('#about-node-version, #about-node-uptime, #about-database-status, #about-ipfs-status').text('Error');
            }
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
