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
import express from 'express';
import { generateDevHtml, build } from './utils.js';
import { argv } from 'node:process';
import chalk from 'chalk';
import dotenv from 'dotenv';
import http from 'http';
dotenv.config();

const app = express();
let port = process.env.PORT ?? 4000; // Starting port
const maxAttempts = 10; // Maximum number of ports to try
const env = argv[2] ?? 'dev';

const startServer = (attempt, useAnyFreePort = false) => {
    if ( attempt > maxAttempts ) {
        useAnyFreePort = true; // Use any port that is free
    }

    const server = app.listen(useAnyFreePort ? 0 : port, () => {
        console.log('\n-----------------------------------------------------------\n');
        console.log('Puter is now live at: ', chalk.underline.blue(`http://localhost:${server.address().port}`));
        console.log('\n-----------------------------------------------------------\n');
    }).on('error', (err) => {
        if ( err.code === 'EADDRINUSE' ) { // Check if the error is because the port is already in use
            console.error(chalk.red(`ERROR: Port ${port} is already in use. Trying next port...`));
            port++; // Increment the port number
            startServer(attempt + 1); // Try the next port
        }
    });
};

// Start the server with the first attempt
startServer(1);

// build the GUI
build();

// Proxy API requests to mock PC2 server for local development
// This handles requests to api.puter.localhost:4100 and forwards them to 127.0.0.1:4200
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

app.use((req, res, next) => {
    // Check if this is an API request that should be proxied to mock server
    const isApiRequest = req.path.startsWith('/auth/') || 
                        req.path.startsWith('/whoami') ||
                        req.path.startsWith('/version') ||
                        req.path.startsWith('/read') ||
                        req.path.startsWith('/cache/') ||
                        req.path.startsWith('/mkdir') ||
                        req.path.startsWith('/write') ||
                        req.path.startsWith('/delete') ||
                        req.path.startsWith('/move') ||
                        req.path.startsWith('/readdir') ||
                        req.path.startsWith('/stat') ||
                        req.path.startsWith('/socket.io/');
    
    if (isApiRequest) {
        // Handle CORS preflight (OPTIONS) requests
        if (req.method === 'OPTIONS') {
            console.log(`[Dev Server Proxy]: OPTIONS ${req.path} -> http://127.0.0.1:4200${req.url}`);
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400'
            });
            return res.end();
        }
        
        console.log(`[Dev Server Proxy]: ${req.method} ${req.path} -> http://127.0.0.1:4200${req.url}`);
        
        // Prepare headers (remove host to avoid conflicts)
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length']; // Let Node.js calculate this
        
        const options = {
            hostname: '127.0.0.1',
            port: 4200,
            path: req.url,
            method: req.method,
            headers: headers
        };
        
        const proxyReq = http.request(options, (proxyRes) => {
            // Ensure CORS headers are present
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            };
            
            // Copy response headers and add CORS
            Object.keys(proxyRes.headers).forEach(key => {
                if (key.toLowerCase() !== 'content-encoding') { // Avoid double encoding
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });
            
            // Override/add CORS headers
            Object.keys(corsHeaders).forEach(key => {
                res.setHeader(key, corsHeaders[key]);
            });
            
            res.statusCode = proxyRes.statusCode;
            
            // Pipe response
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
            console.error(`[Dev Server Proxy]: Error proxying to mock server:`, err.message);
            if (!res.headersSent) {
                res.writeHead(502, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                });
                res.end(JSON.stringify({ error: 'Mock server not available', details: err.message }));
            }
        });
        
        // Handle request body
        if (req.body && Object.keys(req.body).length > 0) {
            const bodyStr = Buffer.isBuffer(req.body) ? req.body : 
                          typeof req.body === 'string' ? req.body : 
                          JSON.stringify(req.body);
            proxyReq.write(bodyStr);
            proxyReq.end();
        } else if (req.method === 'POST' || req.method === 'PUT') {
            // For POST/PUT, collect raw body if available
            let bodyData = Buffer.alloc(0);
            req.on('data', (chunk) => {
                bodyData = Buffer.concat([bodyData, chunk]);
            });
            req.on('end', () => {
                if (bodyData.length > 0) {
                    proxyReq.write(bodyData);
                }
                proxyReq.end();
            });
        } else {
            // For GET/OPTIONS, no body
            proxyReq.end();
        }
        
        return;
    }
    
    next();
});

app.get(['/', '/app/*', '/action/*'], (req, res) => {
    res.send(generateDevHtml({
        env: env,
        api_origin: 'https://api.puter.com',
        title: 'ElastOS',
        max_item_name_length: 150,
        require_email_verification_to_publish_website: false,
        short_description: 'Puter is a privacy-first personal cloud that houses all your files, apps, and games in one private and secure place, accessible from anywhere at any time.',
    }));
});

// Serve particle-auth directory
app.use('/particle-auth', express.static('../particle-auth'));

app.use(express.static('./'));

if ( env === 'prod' ) {
    // make sure to serve the ./dist/ folder maps to the root of the website
    app.use(express.static('./dist/'));
}

if ( env === 'dev' ) {
    app.use(express.static('./src/'));
    // Serve putility module from parent src directory
    app.use('/node_modules/@heyputer/putility', express.static('../putility'));
}

export { app };
