/*
 * Copyright (C) 2024 Puter Technologies Inc.
 *
 * Elastos Smart Chain API proxy to bypass CORS issues
 */

const express = require('express');
const router = express.Router();

// Proxy for Elastos Smart Chain explorer API
// This bypasses the duplicate CORS header issue from esc.elastos.io
router.get('/api/elastos/transactions', async (req, res) => {
    const { address, page = 1, pageSize = 20 } = req.query;
    
    if (!address) {
        return res.status(400).json({ error: 'Address is required' });
    }
    
    try {
        const apiUrl = `https://esc.elastos.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${pageSize}&sort=desc`;
        
        // Use native fetch (Node 18+) or dynamic import
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('[Elastos Proxy]: Failed to fetch transactions:', error);
        res.status(500).json({ 
            error: 'Failed to fetch Elastos transactions',
            message: error.message 
        });
    }
});

module.exports = router;


