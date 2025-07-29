const express = require('express');
const path = require('path');
const fs = require('fs');
const Chatbot = require('./Chatbot');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Chatbot
const chatbot = new Chatbot(
  process.env.OPENAI_API_KEY,
  process.env.DOCUMENTS_FOLDER || './documents'
);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

app.post('/Chatbot/api/chat', async (req, res) => {
    const { prompt, analysisType } = req.body; // Add analysisType parameter
    const result = await chatbot.handleChatRequest(prompt, analysisType);
    
    if (result.success) {
        res.json({ response: result.response });
    } else {
        res.status(result.statusCode || 500).json({ error: result.error });
    }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});