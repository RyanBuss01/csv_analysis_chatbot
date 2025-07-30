/**
 * BankersGPS Analytics Chatbot Server
 * 
 * Express.js server that provides a web interface and API endpoints for the
 * BankersGPS banking analytics chatbot. Handles file serving, CSV processing,
 * and OpenAI-powered chat functionality.
 * 
 * @author Ryan Bussert
 * @version 1.0.0
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const Chatbot = require('./Chatbot');
require('dotenv').config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Initialize Chatbot instance with configuration from environment variables
 * 
 * Environment Variables:
 * - OPENAI_API_KEY: Required OpenAI API key for chat functionality
 * - DOCUMENTS_FOLDER: Optional path to documents folder (defaults to './documents')
 */
const chatbot = new Chatbot(
  process.env.OPENAI_API_KEY,
  process.env.DOCUMENTS_FOLDER || './documents'
);

// ===== MIDDLEWARE =====

/**
 * Parse incoming JSON requests
 */
app.use(express.json());

/**
 * Serve static files from the 'public' directory
 * Note: Static files include CSS, JavaScript, images, etc.
 */
app.use(express.static('public'));

// ===== ROUTES =====

/**
 * Serve the main chatbot interface
 * 
 * @route GET /
 * @description Serves the main HTML interface for the chatbot
 * @returns {File} index.html - Main chatbot interface
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Serve asset files with special CSV processing
 * 
 * @route GET /assets/:filename
 * @description Serves files from the assets directory with special handling for CSV files
 * @param {string} filename - Name of the file to serve
 * @returns {File|String} The requested file or processed CSV content
 * 
 * Special CSV Processing:
 * - Removes commas from inside quoted headers to prevent parsing issues
 * - Example: "FFS, Repos & Bank CD" becomes "FFS Repos & Bank CD"
 * - This ensures proper CSV parsing in the frontend
 */
app.get('/assets/:filename', (req, res) => {
  const filename = req.params.filename;
  const ext = path.extname(filename).toLowerCase();
  
  // Special handling for CSV files with header sanitization
  if (ext === '.csv') {
    const csvPath = path.join(__dirname, 'assets', filename);
    
    if (fs.existsSync(csvPath)) {
      try {
        // Read the raw CSV content
        const raw = fs.readFileSync(csvPath, 'utf8');
        const lines = raw.split('\n');
        
        if (lines.length > 0) {
          // Clean commas inside quoted headers to prevent CSV parsing issues
          // This regex finds quoted strings and removes commas within them
          lines[0] = lines[0].replace(/"([^"]+)"/g, (match, p1) => {
            return p1.replace(/,/g, ''); // Remove commas only inside the quotes
          });
        }
        
        const sanitizedCSV = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.send(sanitizedCSV);
      } catch (error) {
        console.error(`Error processing CSV file ${filename}:`, error);
        res.status(500).send(`Error processing CSV file: ${filename}`);
      }
    } else {
      res.status(404).send(`CSV file not found: ${filename}`);
    }
  } else {
    // Serve non-CSV assets normally (images, JSON, etc.)
    const filePath = path.join(__dirname, 'assets', filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`Asset not found: ${filename}`);
    }
  }
});

/**
 * Handle chat requests from the frontend
 * 
 * @route POST /Chatbot/api/chat
 * @description Processes chat messages through the OpenAI-powered chatbot
 * @param {Object} req.body - Request body containing chat data
 * @param {string} req.body.prompt - User's question or message
 * @param {string} [req.body.analysisType] - Type of banking analysis ('rate-risk' or 'net-interest')
 * @returns {Object} JSON response with chatbot's reply or error message
 * 
 * Success Response:
 * {
 *   "response": "AI-generated response text"
 * }
 * 
 * Error Response:
 * {
 *   "error": "Error description"
 * }
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Bad request (missing prompt)
 * - 401: Unauthorized (invalid API key)
 * - 429: Too many requests (quota exceeded)
 * - 500: Internal server error
 */
app.post('/Chatbot/api/chat', async (req, res) => {
  try {
    const { prompt, analysisType } = req.body;
    
    // Validate required parameters
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }
    
    // Process the chat request through the chatbot
    const result = await chatbot.handleChatRequest(prompt, analysisType);
    
    if (result.success) {
      res.json({ response: result.response });
    } else {
      // Return appropriate status code based on the error type
      res.status(result.statusCode || 500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Unexpected error in chat endpoint:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

/**
 * Health check endpoint
 * 
 * @route GET /health
 * @description Provides server health status and uptime information
 * @returns {Object} JSON object with health status and timestamp
 * 
 * Response:
 * {
 *   "status": "OK",
 *   "timestamp": "2024-01-01T12:00:00.000Z"
 * }
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

/**
 * 404 handler for unmatched routes
 */
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method 
  });
});

/**
 * Global error handler
 */
app.use((error, req, res, next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// ===== SERVER STARTUP =====

/**
 * Start the Express server
 * 
 * The server will listen on the specified port and log startup information.
 * In development mode, it also logs the chatbot configuration.
 */
app.listen(PORT, () => {
  console.log(`🚀 BankersGPS Chatbot Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Documents folder: ${process.env.DOCUMENTS_FOLDER || './documents'}`);
  console.log(`🤖 OpenAI API key: ${process.env.OPENAI_API_KEY ? 'Configured' : '❌ Missing'}`);
  
  // Verify critical configuration
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set. Chat functionality will not work.');
  }
});

// ===== GRACEFUL SHUTDOWN =====

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

/**
 * Handle graceful shutdown on SIGTERM
 */
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});