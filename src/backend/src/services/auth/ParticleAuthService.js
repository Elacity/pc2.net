// METADATA // {"ai-commented":{"service":"openai-completion","model":"gpt-4o"}}
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
const { AuthService } = require('./AuthService');
const { Actor, UserActorType } = require("./Actor");
const APIError = require("../../api/APIError");
const { get_user } = require("../../helpers");

/**
 * @class ParticleAuthService
 * This class extends the AuthService to provide Particle-specific authentication functionality.
 */
class ParticleAuthService extends AuthService {
    /**
     * Override the authenticate_from_token method to add Particle-specific token handling
     * @param {string} token - The token to authenticate
     * @returns {Promise<Actor>} The authenticated actor
     */
    async authenticate_from_token(token) {
        // For non-Particle tokens, use the parent class implementation
        return await super.authenticate_from_token(token);
    }
}

module.exports = {
    ParticleAuthService,
};
