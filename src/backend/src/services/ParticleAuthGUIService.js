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
const BaseService = require("./BaseService");

const express = require('express');
const _path = require('path');


/**
* Class representing the ParticleAuthGUIService, which extends the BaseService.
* This service is responsible for setting up the particle auth GUI-related routes.
*/
class ParticleAuthGUIService extends BaseService {
    /**
    * Handles the installation of GUI-related routes for the particle auth.
    * Using install.routes instead of install.routes-gui to register BEFORE default router
    *
    * @async
    * @returns {Promise<void>} Resolves when routing is successfully set up.
    */
    async ['__on_install.routes'] () {
        const { app } = this.services.get('web-server');

        // ELACITY: Path from src/backend/src/services/ to src/particle-auth/
        const dirPath = _path.join(__dirname, '../../../particle-auth');

        // Serve the Particle Auth React app BEFORE the default router
        app.use('/particle-auth', express.static(dirPath));

        this.log.info('[Particle Auth]: routes registered, serving from', dirPath);

    }
}

module.exports = {
    ParticleAuthGUIService
};
