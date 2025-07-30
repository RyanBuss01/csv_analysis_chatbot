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
  
  // Only handle .csv files with header sanitization
  if (ext === '.csv') {
    const csvPath = path.join(__dirname, 'assets', filename);
    
    if (fs.existsSync(csvPath)) {
      const raw = fs.readFileSync(csvPath, 'utf8');
      const lines = raw.split('\n');
      
      if (lines.length > 0) {
        // Clean commas inside quoted headers (e.g., "FFS, Repos & Bank CD")
        lines[0] = lines[0].replace(/"([^"]+)"/g, (match, p1) => {
          return p1.replace(/,/g, ''); // Remove commas only inside the quotes
        });
      }
      
      const sanitizedCSV = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.send(sanitizedCSV);
    } else {
      res.status(404).send(`CSV file not found: ${filename}`);
    }
  } else {
    // Serve non-CSV assets normally
    res.sendFile(path.join(__dirname, 'assets', filename));
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
 */
app.post('/Chatbot/api/chat', async (req, res) => {
  const { prompt, analysisType } = req.body; // Add analysisType parameter
  const result = await chatbot.handleChatRequest(prompt, analysisType);
  
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

// ===== SERVER STARTUP =====

/**
 * Start the Express server
 * 
 * The server will listen on the specified port and log startup information.
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});