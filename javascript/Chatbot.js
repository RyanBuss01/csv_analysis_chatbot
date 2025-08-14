/**
 * BankersGPS Analytics Chatbot
 * 
 * A specialized banking analytics chatbot that integrates with OpenAI's API to provide
 * intelligent analysis of financial data. Focuses on rate risk management and net interest
 * margin simulations with contextual banking knowledge.
 * 
 * Features:
 * - OpenAI GPT-4.1-mini integration for intelligent responses
 * - Banking-specific context and terminology
 * - Document processing for additional context (PDF + DOCX from subdirectories)
 * - Reduced tabs with original simple system instructions
 * - Caching system for performance optimization
 * - Error handling for various API scenarios
 * - Complete dataset analysis (no data slicing)
 * 
 * @author Ryan Bussert
 * @version 1.2.0
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse'); // Required for PDF processing

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
   * @param {string} [documentsFolder='./documents'] - Path to folder containing documents for context
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
   * 2. Loads and caches document content (if useDocuments is true)
   * 3. Generates AI response with banking context
   * 4. Logs interaction for monitoring
   * 5. Returns structured response with success/error status
   * 
   * @param {string} prompt - User's question/prompt (required, non-empty)
   * @param {string} [analysisType=null] - Type of banking analysis ('rate-risk' or 'net-interest')
   * @param {boolean} [useDocuments=true] - Whether to include document context
   * @returns {Promise<Object>} Response object with success/error status
   * 
   * @example
   * const result = await chatbot.handleChatRequest(
   *   "What is the current interest rate risk?", 
   *   "rate-risk",
   *   true
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
  async handleChatRequest(prompt, analysisType = null, useDocuments = true) {
    try {
      // Input validation - ensure prompt is provided and meaningful
      if (!prompt || prompt.trim() === '') {
        return {
          success: false,
          error: 'Prompt is required.',
          statusCode: 400
        };
      }

      // Get document content with caching for performance optimization (only if requested)
      let docContent = '';
      if (useDocuments) {
        docContent = await this.getDocumentContent();
      }
      
      // Generate AI response with banking context
      const response = await this.chat(prompt, docContent, analysisType);
      
      // Log interaction for monitoring and debugging
      this.logInteraction(prompt, response, analysisType, useDocuments);
      
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
 * @param {string} analysisType - Type of analysis
 * @returns {string} Specialized banking context and terminology
 * 
 * @private
 */
getBankingContext(analysisType) {
  // For reduced tabs, return empty string to use only the basic system prompt
  if (analysisType === 'rate-risk-reduced' || analysisType === 'net-interest-reduced') {
    return '';
  }

  const contexts = {
    'rate-risk': `
BANKING CONTEXT - ECONOMIC VALUE OF EQUITY (EVE) RISK ANALYSIS:
You are analyzing Economic Value of Equity (EVE) risk data, NOT Net Interest Income. This involves:

CRITICAL: This is EVE analysis focusing on BALANCE SHEET economic values, not income statement impacts.

KEY EVE CONCEPTS:
- Economic Value of Equity (EVE): Market value of assets minus market value of liabilities
- EVE Risk: Percentage change in EVE under different rate scenarios (measured vs. current rates)
- Duration Risk: How sensitive asset/liability values are to interest rate changes
- Interest Rate Risk: Economic value exposure to rate movements (balance sheet focus)

DATA STRUCTURE IDENTIFICATION:
- If dataset contains "EVE Risk %" column → This is EVE analysis (economic value)
- If dataset contains "Assets (EV)" and "Liabilities (EV)" → Economic value data
- If dataset shows rate scenarios (-400bp, -300bp, etc.) with economic values → EVE stress testing
- DO NOT confuse with NIM analysis which focuses on earnings/income

ANALYSIS FOCUS FOR EVE DATA:
- Economic value changes across rate scenarios (not earnings)
- Duration mismatch impact on asset/liability values
- EVE sensitivity to interest rate shocks
- Balance sheet risk exposure (not income statement)

CRITICAL ANALYSIS REQUIREMENTS:
- FIRST: Identify if this is EVE data vs NIM data based on column headers
- Use EXACT numbers from the complete dataset provided
- Focus on ECONOMIC VALUE changes, not income/earnings changes
- Reference specific EVE percentages and dollar value changes from the data
- Compare actual asset/liability values between rate scenarios
- Calculate economic value changes using the provided data
- DO NOT assume this is NIM data unless explicitly confirmed by column headers

ANALYSIS FORMAT REQUIREMENTS:
Structure your response with these sections only:
1. **Dataset Overview** - Identify data type (EVE vs NIM) and describe actual structure (2-3 sentences max)
2. **Key Insights** - Use numbered points (1, 2, 3, etc.) with descriptive titles, followed by a brief explanatory sentence, then bullet points with specific data-driven details
3. **Strategic Recommendations** - High-level actionable insights based on the actual data patterns

FORMATTING STYLE:
- Use numbered main points with bold descriptive titles
- Follow each numbered title with a descriptive sentence or two explaining the key finding from the data
- Then provide bullet points (•) on SEPARATE LINES with specific supporting details from the actual dataset
- Keep explanations crisp and direct - avoid verbose descriptions
- Focus on WHY economic values change based on the actual data, not hypothetical scenarios
- Each bullet should be a key fact or driver from the dataset, maximum 1 sentence each
- CRITICAL: Each bullet point must be on a separate line with proper line breaks
- Always reference specific numbers, percentages, and dollar amounts from the provided data`,

    'net-interest': `
BANKING CONTEXT - NET INTEREST MARGIN (NIM) SIMULATIONS:
You are analyzing Net Interest Margin (NIM) simulation data, NOT Economic Value data. This involves:

CRITICAL: This is NIM analysis focusing on INCOME STATEMENT impacts, not balance sheet economic values.

KEY NIM CONCEPTS:
- Net Interest Margin (NIM): Net interest income as % of earning assets
- Net Interest Income (NII): Interest income minus interest expense (earnings focus)
- Rate Sensitivity: How quickly income reprices with rate changes
- Earnings at Risk: Income statement exposure to rate movements

DATA STRUCTURE IDENTIFICATION:
- If dataset contains "NIM" or "NII" or "Net Interest" → This is NIM analysis (income focus)
- If dataset shows earnings/income projections → NIM simulation data
- If dataset focuses on interest income/expense changes → NIM analysis
- DO NOT confuse with EVE analysis which focuses on economic values

ANALYSIS FOCUS FOR NIM DATA:
- Net interest income changes across rate scenarios
- Margin compression/expansion patterns
- Asset yield vs funding cost dynamics
- Earnings sensitivity to interest rate changes

CRITICAL ANALYSIS REQUIREMENTS:
- FIRST: Identify if this is NIM data vs EVE data based on column headers
- Use EXACT numbers from the complete dataset provided
- Focus on INCOME/EARNINGS changes, not economic value changes
- Reference specific NIM percentages and NII dollar changes from the data
- Compare actual income values between rate scenarios using the real numbers
- Calculate income changes and margin impacts using the provided data
- DO NOT assume this is EVE data unless explicitly confirmed by column headers

ANALYSIS FORMAT REQUIREMENTS:
Structure your response with these sections only:
1. **Dataset Overview** - Identify data type (NIM vs EVE) and describe actual structure (2-3 sentences max)
2. **Key Insights** - Use numbered points (1, 2, 3, etc.) with descriptive titles, followed by a brief explanatory sentence, then bullet points with specific data-driven details
3. **Strategic Recommendations** - High-level actionable insights based on the actual data patterns

FORMATTING STYLE:
- Use numbered main points with bold descriptive titles
- Follow each main point with bullet points (•) on SEPARATE LINES - each bullet must be on its own line
- Keep explanations crisp and direct - avoid verbose descriptions
- Focus on WHY income/margin changes occur in different rate scenarios based on the actual data:
  * Rate vulnerability in declining environments (cite specific income numbers)
  * Diminishing returns in rising rate scenarios (show actual NII calculations)
  * Cost of funds vs asset yield dynamics (reference real income data points)
  * Structural balance sheet factors affecting earnings (use provided dataset values)
- Each bullet should be a key fact or driver from the dataset, maximum 1 sentence each
- CRITICAL: Each bullet point must be on a separate line with proper line breaks
- Always reference specific numbers, percentages, and dollar amounts from the provided data`
  };

  return contexts[analysisType] || '';
}
  /**
   * Core chat function that orchestrates the OpenAI API call
   * 
   * Uses EXACT original system prompt from your working code
   * 
   * @param {string} prompt - User's question or request
   * @param {string} docContent - Combined content from documents
   * @param {string} [analysisType=null] - Type of banking analysis for specialized context
   * @returns {Promise<string>} AI-generated response text
   * 
   * @private
   */
  async chat(prompt, docContent, analysisType = null) {
  // Build base system prompt (this part will be cached)
  let baseSystemContext = `You are a specialized banking analytics expert assistant for BankersGPS. 
You provide high-level strategic analysis with clear, concise formatting based on ACTUAL DATA.

CRITICAL DATA TYPE IDENTIFICATION:
- FIRST: Examine the column headers to identify the type of analysis:
  * If you see "EVE Risk %", "Assets (EV)", "Liabilities (EV)" → This is EVE (Economic Value of Equity) analysis
  * If you see "NIM", "NII", "Net Interest Income", "Margin" → This is NIM (Net Interest Margin) analysis
- NEVER assume the analysis type - always check the actual column headers provided
- EVE analysis focuses on BALANCE SHEET economic values and duration risk
- NIM analysis focuses on INCOME STATEMENT impacts and earnings changes

CRITICAL DATA ANALYSIS REQUIREMENTS:
- ALWAYS identify the data type first based on column headers
- Use exact numbers, percentages, and dollar amounts from the provided dataset
- Reference specific data points to support every conclusion
- Compare actual values between scenarios using real numbers from the data
- Calculate percentage changes and show your work using the provided data
- DO NOT make assumptions beyond what the actual data demonstrates
- Base ALL insights on observable patterns in the complete dataset provided
- Use the correct analytical framework for the identified data type

CRITICAL FORMATTING REQUIREMENTS:
- Use ## for main section headers (Dataset Overview, Key Insights, Strategic Recommendations)
- For Key Insights section: Use numbered points (1, 2, 3, etc.) with **bold descriptive titles**
- Follow each numbered point with bullet points (•) for specific details from the data
- MANDATORY: Each bullet point MUST be on a separate line with proper line breaks
- Keep analysis high-level and strategic, focusing on business implications
- Explain WHY changes happen based on the actual data, not hypothetical scenarios
- Use professional banking terminology appropriately for the identified data type
- BE CONCISE - Each bullet point should be 1 sentence maximum, preferably short phrases with specific numbers
- Avoid verbose explanations - keep bullet points crisp and direct with data references

EXAMPLE FORMAT FOR EVE ANALYSIS:
## Dataset Overview
This is an Economic Value of Equity (EVE) risk analysis dataset containing asset and liability economic values across different interest rate scenarios.

## Key Insights

1. **EVE Shows High Sensitivity to Rate Declines**

The data reveals that EVE risk reaches -16.87% at -400bps, indicating significant economic value vulnerability to falling rates:

• Assets (EV) total $8,846,683 at -400bps compared to current scenario baseline
• Liabilities (EV) total $7,655,570 at -400bps showing duration mismatch impact
• EVE Risk percentage demonstrates asymmetric risk profile across rate scenarios

EXAMPLE FORMAT FOR NIM ANALYSIS:
## Dataset Overview
This is a Net Interest Margin (NIM) simulation dataset showing earnings impacts across different interest rate scenarios.

## Key Insights

1. **NII Vulnerable to Rate Declines**

Net Interest Income drops significantly in falling rate environments based on the simulation data:

• NII decreases by $X million from current to -400bps scenario
• Asset yields compress faster than funding cost reductions
• Margin compression reaches X% in the most adverse scenario`;

  // Add analysis-type-specific banking context
  if (analysisType) {
    baseSystemContext += this.getBankingContext(analysisType);
  }

  // Create cached document section (this will be cached separately)
  let documentContext = '';
  if (docContent && docContent.trim()) {
    // Normalize document content for consistent caching
    const normalizedDocContent = this.normalizeDocumentContent(docContent);
    documentContext = `\n\nADDITIONAL DOCUMENTATION:\n${normalizedDocContent}`;
  }

  // Combine for final system context
  const fullSystemContext = baseSystemContext + documentContext;

  // Use messages array with caching hints for OpenAI
  const messages = [
    {
      role: "system",
      content: fullSystemContext
    },
    {
      role: "user", 
      content: prompt
    }
  ];

  // Make API call with caching optimization
  const completion = await this.openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: messages,
    temperature: 0.2,
    max_tokens: 4000,
    // Enable caching for system messages
    stream: false
  });

  // Log usage and cost information
  const usage = completion.usage || {};
  const promptTokens = usage.prompt_tokens ?? 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  const INPUT_RATE = 0.40 / 1_000_000;
  const CACHED_RATE = 0.10 / 1_000_000;
  const OUTPUT_RATE = 1.60 / 1_000_000;

  const nonCachedTokens = Math.max(0, promptTokens - cachedTokens);
  const costUSD = (nonCachedTokens * INPUT_RATE) +
                  (cachedTokens * CACHED_RATE) +
                  (completionTokens * OUTPUT_RATE);

  console.log({
    promptTokens,
    cachedTokens,
    completionTokens,
    costUSD: Number(costUSD.toFixed(6)),
    cacheHitRate: promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) + '%' : '0%'
  });

  return completion.choices[0].message.content;
}

/**
 * Normalize document content for consistent caching
 * 
 * @param {string} docContent - Raw document content
 * @returns {string} Normalized content for caching
 * 
 * @private
 */
normalizeDocumentContent(docContent) {
  return docContent
    // Remove timestamps and dates that change
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*?Z/g, '[TIMESTAMP]')
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '[DATE]')
    .replace(/\d{1,2}-\d{1,2}-\d{4}/g, '[DATE]')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Remove any other variable content that might prevent caching
    .replace(/Page \d+ of \d+/g, '[PAGE]')
    .replace(/Generated on .*$/gm, '[GENERATED_DATE]');
}

/**
 * Enhanced document reading with consistent ordering for caching
 * 
 * @returns {Promise<string>} Deterministically ordered document content
 * 
 * @private
 */
async readAllDocxFromFolder() {
  try {
    if (!fs.existsSync(this.documentsFolder)) {
      console.warn(`Documents folder not found: ${this.documentsFolder}`);
      return '';
    }

    // Get all files and sort them deterministically
    const files = fs.readdirSync(this.documentsFolder);
    const docxFiles = files
      .filter(file => 
        file.toLowerCase().endsWith('.docx') && 
        !file.startsWith('~$')
      )
      .sort(); // Consistent alphabetical order for caching

    if (docxFiles.length === 0) {
      console.warn(`No .docx files found in: ${this.documentsFolder}`);
      return '';
    }

    console.log(`Found ${docxFiles.length} document(s) to process: ${docxFiles.join(', ')}`);

    let allContent = '';
    
    // Process files in deterministic order
    for (const file of docxFiles) {
      try {
        const filePath = path.join(this.documentsFolder, file);
        const result = await mammoth.extractRawText({ path: filePath });
        
        // Consistent formatting for caching
        allContent += `\n--- Content from ${file} ---\n`;
        allContent += result.value.trim();
        allContent += '\n\n';
        
        if (result.messages && result.messages.length > 0) {
          console.warn(`Warnings for ${file}:`, result.messages);
        }
        
        console.log(`Successfully processed ${file} (${result.value.length} characters)`);
        
      } catch (fileError) {
        console.error(`Error reading file ${file}:`, fileError.message);
      }
    }
    
    // Normalize the final content for caching
    return this.normalizeDocumentContent(allContent);
    
  } catch (error) {
    console.error('Error reading documents folder:', error);
    return '';
  }
}

/**
 * Enhanced document content getter with cache optimization
 * 
 * @returns {Promise<string>} Cached document content optimized for OpenAI caching
 * 
 * @public
 */
async getDocumentContent() {
  const now = new Date();
  const cacheExpiry = 60 * 60 * 1000; // 1 hour cache for better stability
  
  // Load documents if not cached or cache expired
  if (!this.documentContent || 
      !this.lastDocumentLoad || 
      (now - this.lastDocumentLoad) > cacheExpiry) {
    
    console.log('Loading documents for caching optimization...');
    this.documentContent = await this.readAllDocxFromFolder();
    this.lastDocumentLoad = now;
    
    if (this.documentContent) {
      console.log(`Loaded ${this.documentContent.length} characters of normalized document content`);
    }
  }
  
  return this.documentContent;
}

  /**
   * Recursively get all supported files from directory and subdirectories
   * 
   * @param {string} dirPath - Directory path to search
   * @param {Array} fileList - Accumulator for file paths
   * @returns {Array} Array of file paths with metadata
   * 
   * @private
   */
  getAllSupportedFiles(dirPath, fileList = []) {
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          this.getAllSupportedFiles(filePath, fileList);
        } else if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          // Support both .docx and .pdf files, exclude temp files
          if ((ext === '.docx' || ext === '.pdf') && !file.startsWith('~$')) {
            fileList.push({
              fullPath: filePath,
              fileName: file,
              directory: path.relative(this.documentsFolder, dirPath),
              extension: ext
            });
          }
        }
      }
      
      return fileList;
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error.message);
      return fileList;
    }
  }

  /**
   * Extract text from a PDF file
   * 
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<string>} Extracted text content
   * 
   * @private
   */
  async extractPdfText(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error(`Error extracting PDF text from ${filePath}:`, error.message);
      return '';
    }
  }

  /**
   * Extract text from a DOCX file
   * 
   * @param {string} filePath - Path to DOCX file
   * @returns {Promise<string>} Extracted text content
   * 
   * @private
   */
  async extractDocxText(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      if (result.messages && result.messages.length > 0) {
        console.warn(`Warnings for ${path.basename(filePath)}:`, result.messages);
      }
      
      return result.value.trim();
    } catch (error) {
      console.error(`Error extracting DOCX text from ${filePath}:`, error.message);
      return '';
    }
  }

  /**
   * Read and extract text from all documents (DOCX and PDF) in the folder and subdirectories
   * 
   * Enhanced version that:
   * - Recursively searches subdirectories (Competitive, Forecast, Risk, Strategy)
   * - Handles both PDF and DOCX files
   * - Provides better organization and error handling
   * 
   * @returns {Promise<string>} Combined text content from all documents
   * 
   * @private
   */
  async readAllDocxFromFolder() {
    try {
      // Verify documents folder exists
      if (!fs.existsSync(this.documentsFolder)) {
        console.warn(`Documents folder not found: ${this.documentsFolder}`);
        return '';
      }

      // Get all supported files recursively
      const allFiles = this.getAllSupportedFiles(this.documentsFolder);
      
      if (allFiles.length === 0) {
        console.warn(`No supported files (.docx, .pdf) found in: ${this.documentsFolder}`);
        return '';
      }

      console.log(`Found ${allFiles.length} supported document(s):`);
      allFiles.forEach(file => {
        const dirInfo = file.directory ? ` (${file.directory})` : '';
        console.log(`  ${file.fileName}${dirInfo}`);
      });

      let allContent = '';
      let processedCount = 0;
      let errorCount = 0;
      
      // Process each file with appropriate extractor
      for (const file of allFiles) {
        try {
          let content = '';
          
          if (file.extension === '.pdf') {
            content = await this.extractPdfText(file.fullPath);
          } else if (file.extension === '.docx') {
            content = await this.extractDocxText(file.fullPath);
          }
          
          if (content.trim()) {
            // Format content with clear document boundaries and directory info
            const dirInfo = file.directory ? ` (${file.directory})` : '';
            allContent += `\n--- Content from ${file.fileName}${dirInfo} ---\n`;
            allContent += content.trim();
            allContent += '\n\n';
            
            processedCount++;
            console.log(`✓ Successfully processed ${file.fileName} (${content.length} characters)`);
          } else {
            console.warn(`⚠ No content extracted from ${file.fileName}`);
          }
          
        } catch (fileError) {
          console.error(`✗ Error processing file ${file.fileName}:`, fileError.message);
          errorCount++;
          // Continue processing other files even if one fails
        }
      }
      
      console.log(`Document processing complete: ${processedCount} successful, ${errorCount} errors`);
      return allContent;
      
    } catch (error) {
      console.error('Error reading documents folder:', error);
      return '';
    }
  }

 

  /**
   * Log chat interactions for monitoring and debugging
   * 
   * Provides structured logging of all chat interactions with timestamps
   * and context information. Enhanced to include data analysis indicators.
   * 
   * @param {string} prompt - User's original question
   * @param {string} response - AI's generated response
   * @param {string} [analysisType=null] - Type of analysis performed
   * @param {boolean} [useDocuments=true] - Whether documents were used
   * 
   * @private
   */
  logInteraction(prompt, response, analysisType = null, useDocuments = true) {
    const timestamp = new Date().toISOString();
    const contextInfo = analysisType ? ` [${analysisType}]` : '';
    const dataIndicator = prompt.includes('COMPLETE DATASET') ? ' [FULL_DATA_ANALYSIS]' : '';
    const docIndicator = useDocuments ? ' [DOCS_ENABLED]' : ' [DOCS_DISABLED]';
    
    // Development logging (can be extended for production monitoring)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${timestamp}]${contextInfo}${dataIndicator}${docIndicator} User: ${prompt.substring(0, 150)}${prompt.length > 150 ? '...' : ''}`);
      console.log(`[${timestamp}]${contextInfo} Response length: ${response.length} characters`);
      
      // Log if this was a data-driven analysis
      if (prompt.includes('COMPLETE DATASET')) {
        console.log(`[${timestamp}]${contextInfo} DATA ANALYSIS: Full dataset provided for analysis`);
      }
    }
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

  /**
   * Validate that prompt contains complete dataset information
   * 
   * Helper method to ensure that data analysis requests include
   * the full dataset rather than truncated samples.
   * 
   * @param {string} prompt - The prompt to validate
   * @returns {boolean} True if prompt contains complete dataset indicators
   * 
   * @public
   */
  validateDataAnalysisPrompt(prompt) {
    const dataIndicators = [
      'COMPLETE DATASET',
      'COMPLETE DATASET ANALYSIS',
      'all rows of data',
      'Row 1:', 'Row 2:', 'Row 3:' // Indicators of complete row enumeration
    ];
    
    return dataIndicators.some(indicator => prompt.includes(indicator));
  }

  /**
   * Get analysis quality metrics from response
   * 
   * Analyzes the AI response to determine if it contains specific
   * data references and quantitative analysis as expected.
   * 
   * @param {string} response - AI response to analyze
   * @returns {Object} Quality metrics object
   * 
   * @public
   */
  getAnalysisQualityMetrics(response) {
    const metrics = {
      hasSpecificNumbers: /\$[\d,]+|\d+\.\d+%|\d+bp|\d+ million/.test(response),
      hasPercentageChanges: /%/.test(response),
      hasDollarAmounts: /\$/.test(response),
      hasComparisons: /compared to|vs\.|versus|from .+ to/.test(response),
      hasCalculations: /increase|decrease|change|difference/.test(response),
      wordCount: response.split(' ').length,
      numberReferences: (response.match(/\d+/g) || []).length
    };
    
    metrics.qualityScore = (
      (metrics.hasSpecificNumbers ? 25 : 0) +
      (metrics.hasPercentageChanges ? 20 : 0) +
      (metrics.hasDollarAmounts ? 20 : 0) +
      (metrics.hasComparisons ? 20 : 0) +
      (metrics.hasCalculations ? 15 : 0)
    );
    
    return metrics;
  }
}

// Export the Chatbot class for use in other modules
module.exports = Chatbot;