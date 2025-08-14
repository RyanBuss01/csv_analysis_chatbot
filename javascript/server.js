/**
 * BankersGPS Analytics Chatbot Server
 * 
 * Express.js server that provides a web interface and API endpoints for the
 * BankersGPS banking analytics chatbot. Handles file serving, CSV processing,
 * and OpenAI-powered chat functionality with support for reduced tabs.
 * 
 * @author Ryan Bussert
 * @version 1.1.0
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
  const filePath = path.join(__dirname, 'assets', filename);
  
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.csv') {
      // Read with proper encoding detection
      const buffer = fs.readFileSync(filePath);
      let content = buffer.toString('utf8');
      
      // Simple encoding fix
      if (content.includes('�')) {
        content = buffer.toString('latin1');
      }
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(content);
    } else {
      res.sendFile(filePath);
    }
  } else {
    res.status(404).send(`File not found: ${filename}`);
  }
});

/**
 * Handle chat requests from the frontend
 * 
 * @route POST /Chatbot/api/chat
 * @description Processes chat messages through the OpenAI-powered chatbot
 * @param {Object} req.body - Request body containing chat data
 * @param {string} req.body.prompt - User's question or message
 * @param {string} [req.body.analysisType] - Type of banking analysis ('rate-risk', 'net-interest', or reduced variants)
 * @param {boolean} [req.body.useDocuments=true] - Whether to include document context
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
 */
app.post('/Chatbot/api/chat', async (req, res) => {
  const { prompt, analysisType, useDocuments = true } = req.body; // Add useDocuments parameter
  const result = await chatbot.handleChatRequest(prompt, analysisType, useDocuments);
  
  if (result.success) {
    res.json({ response: result.response });
  } else {
    res.status(result.statusCode || 500).json({ error: result.error });
  }
});

/**
 * Health check endpoint
 * 
 * @route GET /health
 * @description Provides server health status and timestamp
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
    timestamp: new Date().toISOString()
  });
});

/**
 * Get document statistics endpoint (for debugging)
 * 
 * @route GET /api/documents/stats
 * @description Provides information about loaded documents
 * @returns {Object} JSON object with document statistics
 */
app.get('/api/documents/stats', async (req, res) => {
  try {
    const stats = await chatbot.getDocumentStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve document stats' });
  }
});

/**
 * Refresh documents endpoint (for manual cache refresh)
 * 
 * @route POST /api/documents/refresh
 * @description Manually refreshes the document cache
 * @returns {Object} JSON object with refresh status
 */
app.post('/api/documents/refresh', async (req, res) => {
  try {
    await chatbot.refreshDocuments();
    res.json({ success: true, message: 'Documents refreshed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Could not refresh documents' });
  }
});

// ===== SERVER STARTUP =====

/**
 * Start the Express server
 * 
 * The server will listen on the specified port and log startup information.
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});