/*
 * Copyright (C) 2024-present Elacity & Puter Technologies Inc.
 *
 * This file is part of ElastOS (Puter fork).
 *
 * ElastOS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Particle Auth Extension for ElastOS
 * 
 * This extension provides Particle Network blockchain authentication
 * as an alternative to traditional email/password authentication.
 */

const express = require('express');
const path = require('path');
const ParticleAuthDriver = require('./drivers/ParticleAuthDriver');

// Extension lifecycle events
extension.on('preinit', event => {
    extension.log.info('[Particle Auth]: Pre-initialization started');
});

extension.on('init', async event => {
    extension.log.info('[Particle Auth]: Initialization started');
    
    // Log configuration
    const config = extension.config || {};
    extension.log.info('[Particle Auth]: Configuration loaded', {
        hasProjectId: !!config.particle_project_id,
        hasClientKey: !!config.particle_client_key,
        hasAppId: !!config.particle_app_id
    });
    
    // Serve the Particle Auth GUI as static files from the extension's gui directory
    const guiPath = path.join(__dirname, 'gui');
    extension.log.info('[Particle Auth]: Setting up GUI from', guiPath);
    
    // Register the static file serving route
    extension.use('/particle-auth', express.static(guiPath));
    extension.log.info('[Particle Auth]: GUI route registered');
});

// Create the 'auth' interface for Particle authentication
extension.on('create.interfaces', event => {
    extension.log.info('[Particle Auth]: Creating auth interface');
    
    event.createInterface('auth', {
        description: 'Authentication interface for ElastOS using Particle Network',
        methods: {
            login: {
                description: 'Authenticate user with blockchain wallet',
                parameters: {
                    walletAddress: { type: 'string', description: 'Wallet address' },
                    signature: { type: 'string', description: 'Signed message' },
                    chainId: { type: 'number', optional: true, description: 'Chain ID' }
                }
            },
            verify: {
                description: 'Verify authentication token',
                parameters: {
                    token: { type: 'string', description: 'JWT token' }
                }
            },
            logout: {
                description: 'End user session',
                parameters: {
                    token: { type: 'string', description: 'JWT token' }
                }
            }
        }
    });
});

// Register the Particle driver implementation
extension.on('create.drivers', event => {
    extension.log.info('[Particle Auth]: Registering particle driver');
    
    event.createDriver('auth', 'particle', new ParticleAuthDriver());
});

// Grant permissions for the auth driver
extension.on('create.permissions', event => {
    extension.log.info('[Particle Auth]: Granting permissions');
    
    // Allow all users to use Particle auth
    event.grant_to_everyone('service:particle:ii:auth');
});

// Extension ready
extension.on('ready', event => {
    extension.log.info('[Particle Auth]: Extension ready ✓');
});
