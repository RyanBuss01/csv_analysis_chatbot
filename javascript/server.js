/**
 * BankersGPS Analytics Chatbot Server - Enhanced with PDF Upload
 * 
 * Express.js server that provides a web interface and API endpoints for the
 * BankersGPS banking analytics chatbot. Handles file serving, CSV processing,
 * PDF uploads, and OpenAI-powered chat functionality with support for reduced tabs.
 * 
 * @author Ryan Bussert
 * @version 1.2.0
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Chatbot = require('./Chatbot');
require('dotenv').config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Configure multer for file uploads
 * - Store files in memory as buffers
 * - Set file size limits for PDFs
 * - Filter file types for security
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for PDF files
    files: 1 // Only one file at a time
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files for the PDF upload
    if (file.fieldname === 'pdfFile') {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed for PDF upload'), false);
      }
    } else {
      cb(null, true);
    }
  }
});

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
 * Parse URL-encoded data (for form submissions)
 */
app.use(express.urlencoded({ extended: true }));

/**
 * Serve static files from the 'public' directory
 * Note: Static files include CSS, JavaScript, images, etc.
 */
app.use(express.static('public'));

/**
 * Enhanced error handling for multer file upload errors
 */
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 50MB for PDF files.' 
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files. Only one PDF file allowed.' 
      });
    }
    return res.status(400).json({ 
      error: `File upload error: ${error.message}` 
    });
  }
  
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({ 
      error: 'Invalid file type. Only PDF files are allowed for PDF upload.' 
    });
  }
  
  next(error);
};

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
    } else if (ext === '.pdf') {
      // Serve PDF files with proper content type
      res.setHeader('Content-Type', 'application/pdf');
      res.sendFile(filePath);
    } else {
      res.sendFile(filePath);
    }
  } else {
    res.status(404).send(`File not found: ${filename}`);
  }
});

/**
 * Handle chat requests from the frontend with PDF upload support
 * 
 * @route POST /Chatbot/api/chat
 * @description Processes chat messages through the OpenAI-powered chatbot with optional PDF upload
 * @param {Object} req.body - Request body containing chat data
 * @param {string} req.body.prompt - User's question or message
 * @param {string} [req.body.analysisType] - Type of banking analysis ('rate-risk', 'net-interest', or reduced variants)
 * @param {boolean} [req.body.useDocuments=true] - Whether to include document context
 * @param {string} [req.body.hasPdf] - Flag indicating if PDF is uploaded
 * @param {File} [req.file] - Optional uploaded PDF file (via multer)
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
app.post('/Chatbot/api/chat', upload.single('pdfFile'), handleMulterError, async (req, res) => {
  try {
    const { prompt, analysisType, useDocuments = 'true', hasPdf } = req.body;
    
    // Convert string 'true'/'false' to boolean
    const useDocsBoolean = useDocuments === 'true' || useDocuments === true;
    
    // Log the request for debugging
    console.log(`Chat request: analysisType=${analysisType}, useDocuments=${useDocsBoolean}, hasPdf=${hasPdf}`);
    
    // Handle uploaded PDF
    let uploadedPdfBuffer = null;
    let pdfFileName = null;
    
    if (req.file && req.file.fieldname === 'pdfFile') {
      uploadedPdfBuffer = req.file.buffer;
      pdfFileName = req.file.originalname;
      console.log(`PDF uploaded: ${pdfFileName} (${uploadedPdfBuffer.length} bytes)`);
    } else if (hasPdf === 'true') {
      console.log('PDF upload expected but no file received');
    }
    
    // Process the chat request
    const result = await chatbot.handleChatRequest(
      prompt, 
      analysisType, 
      useDocsBoolean,
      uploadedPdfBuffer,
      pdfFileName
    );
    
    if (result.success) {
      res.json({ response: result.response });
    } else {
      res.status(result.statusCode || 500).json({ error: result.error });
    }
    
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error. Please try again.' 
    });
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
 *   "timestamp": "2024-01-01T12:00:00.000Z",
 *   "uptime": 123.456,
 *   "memoryUsage": {...}
 * }
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version
  });
});

/**
 * Get document statistics endpoint (for debugging)
 * 
 * @route GET /api/documents/stats
 * @description Provides information about loaded documents and cache performance
 * @returns {Object} JSON object with document statistics
 */
app.get('/api/documents/stats', async (req, res) => {
  try {
    const stats = await chatbot.getDocumentStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting document stats:', error);
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
    res.json({ 
      success: true, 
      message: 'Documents refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error refreshing documents:', error);
    res.status(500).json({ error: 'Could not refresh documents' });
  }
});

/**
 * Get cache optimization tips endpoint
 * 
 * @route GET /api/cache/tips
 * @description Provides cache optimization recommendations
 * @returns {Object} JSON object with optimization tips
 */
app.get('/api/cache/tips', async (req, res) => {
  try {
    const tips = await chatbot.getCacheOptimizationTips();
    const stats = await chatbot.getDocumentStats();
    
    res.json({
      tips: tips,
      cacheStats: stats.cacheStats,
      cacheEfficiency: stats.cacheEfficiency,
      recommendations: {
        documentsLoaded: stats.hasContent,
        cacheAge: stats.cacheAge,
        contentSize: stats.contentLength
      }
    });
  } catch (error) {
    console.error('Error getting cache tips:', error);
    res.status(500).json({ error: 'Could not retrieve cache optimization tips' });
  }
});

/**
 * Test PDF processing endpoint (for development/testing)
 * 
 * @route POST /api/test/pdf
 * @description Tests PDF upload and text extraction functionality
 * @param {File} req.file - PDF file to process
 * @returns {Object} JSON object with extraction results
 */
app.post('/api/test/pdf', upload.single('pdfFile'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'File must be a PDF' });
    }
    
    // Test PDF text extraction
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(req.file.buffer);
    
    res.json({
      success: true,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      extractedText: data.text.substring(0, 1000) + (data.text.length > 1000 ? '...' : ''),
      textLength: data.text.length,
      pages: data.numpages
    });
    
  } catch (error) {
    console.error('Error testing PDF:', error);
    res.status(500).json({ 
      error: 'PDF processing failed',
      details: error.message 
    });
  }
});

// ===== ERROR HANDLING =====

/**
 * Global error handler
 * 
 * @description Handles all unhandled errors in the application
 */
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

/**
 * 404 handler for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /',
      'GET /assets/:filename',
      'POST /Chatbot/api/chat',
      'GET /health',
      'GET /api/documents/stats',
      'POST /api/documents/refresh',
      'GET /api/cache/tips',
      'POST /api/test/pdf'
    ]
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
  console.log(`📁 Documents folder: ${process.env.DOCUMENTS_FOLDER || './documents'}`);
  console.log(`📊 CSV assets folder: ./assets`);
  console.log(`🔒 Max PDF upload size: 50MB`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Log available endpoints
  if (process.env.NODE_ENV === 'development') {
    console.log('\n📋 Available endpoints:');
    console.log('  GET  /                     - Main chatbot interface');
    console.log('  GET  /assets/:filename     - Static assets (CSV, PDF)');
    console.log('  POST /Chatbot/api/chat     - Chat with PDF upload support');
    console.log('  GET  /health              - Health check');
    console.log('  GET  /api/documents/stats - Document statistics');
    console.log('  POST /api/documents/refresh - Refresh document cache');
    console.log('  GET  /api/cache/tips      - Cache optimization tips');
    console.log('  POST /api/test/pdf        - Test PDF processing');
  }
});