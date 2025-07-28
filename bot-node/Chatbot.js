const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const mammoth = require('mammoth');

class Chatbot {
  constructor(apiKey, documentsFolder = './documents') {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    this.documentsFolder = documentsFolder;
    this.documentContent = null;
    this.lastDocumentLoad = null;
  }

  /**
   * Main function to handle chat requests
   * @param {string} prompt - User's question/prompt
   * @param {string} analysisType - Type of analysis ('rate-risk' or 'net-interest')
   * @returns {Object} - Response object with success/error status
   */
  async handleChatRequest(prompt, analysisType = null) {
    try {
      // Validate input
      if (!prompt || prompt.trim() === '') {
        return {
          success: false,
          error: 'Prompt is required.',
          statusCode: 400
        };
      }

      // Get document content (cached for performance)
      const docContent = await this.getDocumentContent();
      
      // Generate chat response with banking context
      const response = await this.chat(prompt, docContent, analysisType);
      
      // Log the interaction
      this.logInteraction(prompt, response, analysisType);
      
      return {
        success: true,
        response: response
      };

    } catch (error) {
      console.error('Error in handleChatRequest:', error);
      
      // Handle specific OpenAI errors
      if (error.code === 'insufficient_quota') {
        return {
          success: false,
          error: 'API quota exceeded. Please try again later.',
          statusCode: 429
        };
      } else if (error.code === 'invalid_api_key') {
        return {
          success: false,
          error: 'Invalid API key.',
          statusCode: 401
        };
      } else {
        return {
          success: false,
          error: 'Something went wrong. Please try again.',
          statusCode: 500
        };
      }
    }
  }

  /**
   * Get banking context based on analysis type
   * @param {string} analysisType - Type of analysis
   * @returns {string} - Contextual information
   */
  getBankingContext(analysisType) {
    const contexts = {
      'rate-risk': `
BANKING CONTEXT - RATE RISK MANAGEMENT STRATEGY:
You are analyzing Rate Risk Management data for a bank. This involves:

- Asset-Liability Management (ALM): Managing the mismatch between asset and liability repricing
- Gap Analysis: Measuring repricing mismatches across different time periods
- Risk Management Bubbles: A visual method showing asset/liability terms, yields/costs, and yield curve relationships
- Key Components:
  * Asset Benefit: Distance from asset bubble to yield curve
  * Deposit Benefit: Distance from liability bubble to yield curve  
  * Basis Risk Component: Vertical distance between asset/liability bubbles on yield curve
  * Risk/Reward Trade-off: Basis Risk Component (bp) ÷ Duration Mismatch (months)

Focus on interest rate risk, duration mismatches, repricing gaps, and asset-liability management strategies.`,

      'net-interest': `
BANKING CONTEXT - NET INTEREST MARGIN SIMULATIONS:
You are analyzing Net Interest Margin (NIM) simulation data for a bank. This involves:

- Rate Shock Analysis: Stress testing NIM under various interest rate scenarios
- Gap Analysis Foundation: Using asset-liability gaps as basis for detailed simulations
- Rate Scenarios: Typically +/- 100bp, 200bp, 300bp from current rates
- Key Metrics:
  * Net Interest Margin (NIM): Net interest income as % of earning assets
  * Interest Income/Expense: How rates affect bank's income statement
  * Rate Sensitivity: How quickly assets/liabilities reprice with rate changes
  * Simulation Variables: Repayment speeds, repricing speeds, maturity replacements

Focus on income impact, margin compression/expansion, rate sensitivity, and earnings at risk analysis.`
    };

    return contexts[analysisType] || '';
  }

  /**
   * Core chat function that calls OpenAI API
   * @param {string} prompt - User's question
   * @param {string} docContent - Combined document content
   * @param {string} analysisType - Type of banking analysis
   * @returns {string} - AI response
   */
  async chat(prompt, docContent, analysisType = null) {
    // Build comprehensive prompt with banking context
    let systemContext = `You are a specialized banking analytics expert assistant for BankersGPS. 
You provide detailed, accurate analysis of banking data with focus on practical insights and actionable recommendations.

Always structure your responses with clear headings and bullet points for readability.
Focus on business implications and risk management insights.`;

    // Add specific banking context if analysis type is provided
    if (analysisType) {
      systemContext += this.getBankingContext(analysisType);
    }

    // Add document content if available
    if (docContent) {
      systemContext += `\n\nADDITIONAL DOCUMENTATION:\n${docContent}`;
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini", // Updated to correct model name
      messages: [
        {
          role: "system",
          content: systemContext
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 800, // Increased for more detailed responses
      temperature: 0.3 // Lower temperature for more consistent, professional responses
    });

    return completion.choices[0].message.content;
  }

  /**
   * Read all Word documents from the specified folder
   * @returns {string} - Combined content from all documents
   */
  async readAllDocxFromFolder() {
    try {
      // Check if folder exists
      if (!fs.existsSync(this.documentsFolder)) {
        console.warn(`Documents folder not found: ${this.documentsFolder}`);
        return '';
      }

      const files = fs.readdirSync(this.documentsFolder);
      const docxFiles = files.filter(file => 
        file.toLowerCase().endsWith('.docx') && 
        !file.startsWith('~$') // Ignore temp files
      );
      
      if (docxFiles.length === 0) {
        console.warn(`No .docx files found in: ${this.documentsFolder}`);
        return '';
      }

      let allContent = '';
      
      for (const file of docxFiles) {
        try {
          const filePath = path.join(this.documentsFolder, file);
          
          const result = await mammoth.extractRawText({ path: filePath });
          
          allContent += `\n--- Content from ${file} ---\n`;
          allContent += result.value.trim();
          allContent += '\n\n';
          
          // Log any warnings from mammoth
          if (result.messages && result.messages.length > 0) {
            console.warn(`Warnings for ${file}:`, result.messages);
          }
          
        } catch (fileError) {
          console.error(`Error reading file ${file}:`, fileError.message);
          // Continue with other files
        }
      }
      
      return allContent;
      
    } catch (error) {
      console.error('Error reading documents folder:', error);
      return '';
    }
  }

  /**
   * Get document content with caching (reload every 10 minutes)
   * @returns {string} - Cached or freshly loaded document content
   */
  async getDocumentContent() {
    const now = new Date();
    const cacheExpiry = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    // Load documents if not cached or cache expired
    if (!this.documentContent || 
        !this.lastDocumentLoad || 
        (now - this.lastDocumentLoad) > cacheExpiry) {
      
      this.documentContent = await this.readAllDocxFromFolder();
      this.lastDocumentLoad = now;
    }
    
    return this.documentContent;
  }

  /**
   * Log chat interactions
   * @param {string} prompt - User's question
   * @param {string} response - AI's response
   * @param {string} analysisType - Type of analysis
   */
  logInteraction(prompt, response, analysisType = null) {
    const timestamp = new Date().toISOString();
    const contextInfo = analysisType ? ` [${analysisType}]` : '';
    // console.log(`[${timestamp}]${contextInfo} AI Response: `, response);
  
  }

  /**
   * Utility method to refresh document cache manually
   */
  async refreshDocuments() {
    this.documentContent = await this.readAllDocxFromFolder();
    this.lastDocumentLoad = new Date();
    return this.documentContent;
  }

  /**
   * Get information about loaded documents
   * @returns {Object} - Stats about loaded documents
   */
  getDocumentStats() {
    return {
      documentsFolder: this.documentsFolder,
      lastLoaded: this.lastDocumentLoad,
      contentLength: this.documentContent ? this.documentContent.length : 0,
      hasContent: !!this.documentContent
    };
  }
}

module.exports = Chatbot;