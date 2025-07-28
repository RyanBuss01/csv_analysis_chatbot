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
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/assets/sample.csv', (req, res) => {
  const csvPath = path.join(__dirname, 'assets', 'sample.csv');
  
  if (fs.existsSync(csvPath)) {
    res.sendFile(csvPath);
  } else {
    const sampleCSV = `Name,Age,Department,Salary,Location
John Doe,28,Engineering,75000,New York
Jane Smith,32,Marketing,65000,San Francisco
Mike Johnson,45,Sales,80000,Chicago
Sarah Wilson,29,HR,55000,Boston
David Brown,38,Finance,70000,Seattle`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.send(sampleCSV);
  }
});

app.post('/Chatbot/api/chat', async (req, res) => {
  const { prompt } = req.body;
  const result = await chatbot.handleChatRequest(prompt);
  
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