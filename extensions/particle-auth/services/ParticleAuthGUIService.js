// METADATA // {"ai-commented":{"service":"openai-completion","model":"gpt-4o-mini"}}
/*
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

const express = require('express');
const _path = require('path');


/**
* Class representing the ParticleAuthGUIService.
* This service is responsible for serving the Particle Auth React UI inside Puter.
* 
* Note: Extension services don't inherit from BaseService
*/
class ParticleAuthGUIService {
    /**
    * Handles the installation of GUI-related routes for the particle auth.
    *
    * @async
    * @returns {Promise<void>} Resolves when routing is successfully set up.
    */
    async ['__on_install.routes-gui'] () {
        // Get web server from service context
        const { app } = this.services.get('web-server');

        // ELACITY: Serve from extension's gui folder
        // This gets copied to runtime with the extension
        const dirPath = _path.join(__dirname, '../gui');

        // Serve the Particle Auth React app
        app.use('/particle-auth', express.static(dirPath));

        console.log('[Particle Auth GUI]: Routes registered, serving from', dirPath);

    }
}

module.exports = ParticleAuthGUIService;
