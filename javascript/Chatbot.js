/**
 * BankersGPS Analytics Chatbot
 * 
 * A specialized banking analytics chatbot that integrates with OpenAI's API to provide
 * intelligent analysis of financial data. Focuses on rate risk management and net interest
 * margin simulations with contextual banking knowledge.
 * 
 * Features:
 * - OpenAI GPT-4o-mini integration for intelligent responses
 * - Banking-specific context and terminology
 * - Document processing for additional context
 * - Caching system for performance optimization
 * - Error handling for various API scenarios
 * 
 * @author Ryan Bussert
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const mammoth = require('mammoth');

/**
 * Main Chatbot class that handles banking analytics conversations
 * 
 * This class encapsulates all chatbot functionality including OpenAI API integration,
 * document processing, banking context management, and response caching.
 */
class Chatbot {
  /**
   * Initialize the Chatbot with OpenAI configuration and document settings
   * 
   * @param {string} apiKey - OpenAI API key for authentication
   * @param {string} [documentsFolder='./documents'] - Path to folder containing Word documents for context
   * 
   * @example
   * const chatbot = new Chatbot('sk-...', './docs');
   * 
   * @throws {Error} If apiKey is not provided or invalid
   */
  constructor(apiKey, documentsFolder = './documents') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    /**
     * OpenAI client instance
     * @type {OpenAI}
     * @private
     */
    this.openai = new OpenAI({
      apiKey: apiKey
    });

    /**
     * Path to documents folder for additional context
     * @type {string}
     * @private
     */
    this.documentsFolder = documentsFolder;

    /**
     * Cached document content to avoid repeated file reads
     * @type {string|null}
     * @private
     */
    this.documentContent = null;

    /**
     * Timestamp of last document load for cache invalidation
     * @type {Date|null}
     * @private
     */
    this.lastDocumentLoad = null;
  }

  /**
   * Main function to handle chat requests with comprehensive error handling
   * 
   * This is the primary public method that orchestrates the entire chat process:
   * 1. Validates input parameters
   * 2. Loads and caches document content
   * 3. Generates AI response with banking context
   * 4. Logs interaction for monitoring
   * 5. Returns structured response with success/error status
   * 
   * @param {string} prompt - User's question/prompt (required, non-empty)
   * @param {string} [analysisType=null] - Type of banking analysis ('rate-risk' or 'net-interest')
   * @returns {Promise<Object>} Response object with success/error status
   * 
   * @example
   * const result = await chatbot.handleChatRequest(
   *   "What is the current interest rate risk?", 
   *   "rate-risk"
   * );
   * 
   * Success Response:
   * {
   *   success: true,
   *   response: "Based on the data analysis..."
   * }
   * 
   * Error Response:
   * {
   *   success: false,
   *   error: "API quota exceeded. Please try again later.",
   *   statusCode: 429
   * }
   * 
   * @throws {Error} Catches and converts all errors to structured response objects
   */
  async handleChatRequest(prompt, analysisType = null) {
    try {
      // Input validation - ensure prompt is provided and meaningful
      if (!prompt || prompt.trim() === '') {
        return {
          success: false,
          error: 'Prompt is required.',
          statusCode: 400
        };
      }

      // Get document content with caching for performance optimization
      const docContent = await this.getDocumentContent();
      
      // Generate AI response with full banking context
      const response = await this.chat(prompt, docContent, analysisType);
      
      // Log interaction for monitoring and debugging
      this.logInteraction(prompt, response, analysisType);
      
      return {
        success: true,
        response: response
      };

    } catch (error) {
      console.error('Error in handleChatRequest:', error);
      
      // Handle specific OpenAI API errors with appropriate user messages
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
      } else if (error.code === 'model_not_found') {
        return {
          success: false,
          error: 'AI model temporarily unavailable.',
          statusCode: 503
        };
      } else if (error.code === 'rate_limit_exceeded') {
        return {
          success: false,
          error: 'Too many requests. Please wait a moment.',
          statusCode: 429
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
   * Get specialized banking context based on analysis type
   * 
   * Provides detailed banking terminology and analysis framework specific to
   * the type of financial analysis being performed. This context helps the AI
   * provide more accurate and relevant responses.
   * 
   * @param {string} analysisType - Type of analysis ('rate-risk' or 'net-interest')
   * @returns {string} Specialized banking context and terminology
   * 
   * @private
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
   * Core chat function that orchestrates the OpenAI API call
   * 
   * Builds a comprehensive system prompt that includes:
   * 1. Base banking expertise context
   * 2. Analysis-type-specific terminology and focus areas
   * 3. Additional documentation content for enhanced context
   * 4. Specific formatting and response style instructions
   * 
   * @param {string} prompt - User's question or request
   * @param {string} docContent - Combined content from Word documents
   * @param {string} [analysisType=null] - Type of banking analysis for specialized context
   * @returns {Promise<string>} AI-generated response text
   * 
   * @private
   * 
   * @example
   * const response = await this.chat(
   *   "Analyze this rate shock scenario", 
   *   documentContent, 
   *   "rate-risk"
   * );
   */
  async chat(prompt, docContent, analysisType = null) {
    // Build comprehensive system prompt with banking expertise
    let systemContext = `You are a specialized banking analytics expert assistant for BankersGPS. 
You provide detailed, accurate analysis of banking data with focus on practical insights and actionable recommendations.

Always structure your responses with clear headings and bullet points for readability.
Focus on business implications and risk management insights.`;

    // Add analysis-type-specific banking context for targeted expertise
    if (analysisType) {
      systemContext += this.getBankingContext(analysisType);
    }

    // Incorporate additional documentation for enhanced context
    if (docContent) {
      systemContext += `\n\nADDITIONAL DOCUMENTATION:\n${docContent}`;
    }

    // Make API call to OpenAI with optimized parameters
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",           // Cost-effective model optimized for analysis tasks
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
      temperature: 0.3                // Lower temperature for more consistent, analytical responses
    });

    return completion.choices[0].message.content;
  }

  /**
   * Read and extract text from all Word documents in the specified folder
   * 
   * This method processes .docx files to provide additional context for the AI.
   * It handles multiple files, filters out temporary files, and provides
   * comprehensive error handling for individual file processing failures.
   * 
   * @returns {Promise<string>} Combined text content from all documents
   * 
   * @private
   * 
   * Processing Details:
   * - Filters out temporary files (starting with ~$)
   * - Uses mammoth library for reliable .docx text extraction
   * - Continues processing even if individual files fail
   * - Provides clear document boundaries in the combined output
   * 
   * @example
   * // Returns content like:
   * // "--- Content from doc1.docx ---
   * // Document text content here...
   * // 
   * // --- Content from doc2.docx ---
   * // More document content..."
   */
  async readAllDocxFromFolder() {
    try {
      // Verify documents folder exists
      if (!fs.existsSync(this.documentsFolder)) {
        console.warn(`Documents folder not found: ${this.documentsFolder}`);
        return '';
      }

      // Get all files and filter for .docx files, excluding temp files
      const files = fs.readdirSync(this.documentsFolder);
      const docxFiles = files.filter(file => 
        file.toLowerCase().endsWith('.docx') && 
        !file.startsWith('~$') // Ignore temporary Word files
      );
      
      if (docxFiles.length === 0) {
        console.warn(`No .docx files found in: ${this.documentsFolder}`);
        return '';
      }

      console.log(`Found ${docxFiles.length} document(s) to process: ${docxFiles.join(', ')}`);

      let allContent = '';
      
      // Process each document individually with error isolation
      for (const file of docxFiles) {
        try {
          const filePath = path.join(this.documentsFolder, file);
          
          // Extract raw text using mammoth library
          const result = await mammoth.extractRawText({ path: filePath });
          
          // Format content with clear document boundaries
          allContent += `\n--- Content from ${file} ---\n`;
          allContent += result.value.trim();
          allContent += '\n\n';
          
          // Log any warnings from the extraction process
          if (result.messages && result.messages.length > 0) {
            console.warn(`Warnings for ${file}:`, result.messages);
          }
          
          console.log(`Successfully processed ${file} (${result.value.length} characters)`);
          
        } catch (fileError) {
          console.error(`Error reading file ${file}:`, fileError.message);
          // Continue processing other files even if one fails
        }
      }
      
      return allContent;
      
    } catch (error) {
      console.error('Error reading documents folder:', error);
      return '';
    }
  }

  /**
   * Get document content with intelligent caching system
   * 
   * Implements a 10-minute cache to balance between having current content
   * and avoiding unnecessary file system operations. Documents are automatically
   * reloaded when the cache expires or when explicitly refreshed.
   * 
   * @returns {Promise<string>} Cached or freshly loaded document content
   * 
   * @public
   * 
   * Cache Behavior:
   * - Documents loaded on first request
   * - Cache expires after 10 minutes
   * - Automatic reload on cache expiry
   * - Manual refresh available via refreshDocuments()
   */
  async getDocumentContent() {
    const now = new Date();
    const cacheExpiry = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    // Load documents if not cached or cache expired
    if (!this.documentContent || 
        !this.lastDocumentLoad || 
        (now - this.lastDocumentLoad) > cacheExpiry) {
      
      console.log('Loading documents (cache expired or first load)...');
      this.documentContent = await this.readAllDocxFromFolder();
      this.lastDocumentLoad = now;
      
      if (this.documentContent) {
        console.log(`Loaded ${this.documentContent.length} characters of document content`);
      }
    }
    
    return this.documentContent;
  }

  /**
   * Log chat interactions for monitoring and debugging
   * 
   * Provides structured logging of all chat interactions with timestamps
   * and context information. Currently configured for development use
   * but can be extended for production monitoring.
   * 
   * @param {string} prompt - User's original question
   * @param {string} response - AI's generated response
   * @param {string} [analysisType=null] - Type of analysis performed
   * 
   * @private
   * 
   * Future Extensions:
   * - Database logging for analytics
   * - Performance metrics tracking
   * - User behavior analysis
   * - Error pattern identification
   */
  logInteraction(prompt, response, analysisType = null) {
    const timestamp = new Date().toISOString();
    const contextInfo = analysisType ? ` [${analysisType}]` : '';
    
    // Development logging (can be extended for production monitoring)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${timestamp}]${contextInfo} User: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      console.log(`[${timestamp}]${contextInfo} Response length: ${response.length} characters`);
    }
    
    // Uncomment for full response logging in development
    // console.log(`[${timestamp}]${contextInfo} Full response:`, response);
  }

  /**
   * Manually refresh the document cache
   * 
   * Provides a way to force reload of documents without waiting for
   * cache expiry. Useful when documents are updated and immediate
   * refresh is needed.
   * 
   * @returns {Promise<string>} Freshly loaded document content
   * 
   * @public
   * 
   * @example
   * // Refresh documents after updates
   * const newContent = await chatbot.refreshDocuments();
   * console.log(`Refreshed ${newContent.length} characters of content`);
   */
  async refreshDocuments() {
    console.log('Manually refreshing document cache...');
    this.documentContent = await this.readAllDocxFromFolder();
    this.lastDocumentLoad = new Date();
    
    console.log(`Document cache refreshed: ${this.documentContent.length} characters loaded`);
    return this.documentContent;
  }

  /**
   * Get comprehensive information about loaded documents and cache status
   * 
   * Provides debugging and monitoring information about the document
   * loading system, including cache status and content statistics.
   * 
   * @returns {Object} Detailed statistics about document loading
   * 
   * @public
   * 
   * @example
   * const stats = chatbot.getDocumentStats();
   * console.log(`Documents loaded: ${stats.hasContent ? 'Yes' : 'No'}`);
   * console.log(`Content length: ${stats.contentLength} characters`);
   * console.log(`Last loaded: ${stats.lastLoaded}`);
   */
  getDocumentStats() {
    return {
      documentsFolder: this.documentsFolder,
      lastLoaded: this.lastDocumentLoad,
      contentLength: this.documentContent ? this.documentContent.length : 0,
      hasContent: !!this.documentContent,
      cacheAge: this.lastDocumentLoad ? new Date() - this.lastDocumentLoad : null,
      cacheExpired: this.lastDocumentLoad ? 
        (new Date() - this.lastDocumentLoad) > (10 * 60 * 1000) : true
    };
  }
}

// Export the Chatbot class for use in other modules
module.exports = Chatbot;