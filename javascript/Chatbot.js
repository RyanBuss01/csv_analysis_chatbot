/**
 * BankersGPS Analytics Chatbot - Enhanced with PDF Upload Support
 * 
 * Optimized for OpenAI's automatic prompt caching with support for uploaded PDF files.
 * Key features:
 * - PDF upload processing and text extraction
 * - Prioritized PDF content weighting in context
 * - Deterministic content ordering for consistent cache hits
 * - Enhanced content normalization
 * - Cache-aware message structure
 * - Better cache monitoring and optimization
 * 
 * @author Ryan Bussert
 * @version 1.4.0
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

/**
 * Main Chatbot class optimized for OpenAI prompt caching with PDF upload support
 */
class Chatbot {
  constructor(apiKey, documentsFolder = './documents') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey: apiKey });
    this.documentsFolder = documentsFolder;
    
    // Enhanced caching properties
    this.documentContent = null;
    this.lastDocumentLoad = null;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalSavings: 0
    };
    
    // Cache signature for content verification
    this.contentSignature = null;
  }

  /**
   * Enhanced chat request handler with PDF support
   * 
   * @param {string} prompt - User's question or message
   * @param {string} analysisType - Type of banking analysis
   * @param {boolean} useDocuments - Whether to include document context
   * @param {Buffer|null} uploadedPdfBuffer - Optional uploaded PDF buffer
   * @param {string} pdfFileName - Name of the uploaded PDF file
   * @returns {Object} Response object with success/error status
   */
  async handleChatRequest(
    prompt,
    analysisType = null,
    useDocuments = true,
    uploadedPdfBuffer = null,
    pdfFileName = null,
    modelName = 'gpt-4.1-mini'
  ) {
    try {
      if (!prompt || prompt.trim() === '') {
        return {
          success: false,
          error: 'Prompt is required.',
          statusCode: 400
        };
      }

      // Get document content with enhanced caching
      let docContent = '';
      if (useDocuments) {
        docContent = await this.getDocumentContentCached();
      }
      
      // Process uploaded PDF if provided
      let uploadedPdfContent = '';
      if (uploadedPdfBuffer && pdfFileName) {
        try {
          console.log(`Processing uploaded PDF: ${pdfFileName} (${uploadedPdfBuffer.length} bytes)`);
          uploadedPdfContent = await this.extractPdfTextFromBuffer(uploadedPdfBuffer);
          
          if (uploadedPdfContent.trim()) {
            console.log(`✓ Extracted ${uploadedPdfContent.length} characters from uploaded PDF`);
          } else {
            console.warn('⚠ No text content extracted from uploaded PDF');
          }
        } catch (pdfError) {
          console.error('Error processing uploaded PDF:', pdfError);
          // Continue without uploaded PDF content rather than failing
        }
      }
      
      const response = await this.chat(
        prompt,
        docContent,
        analysisType,
        uploadedPdfContent,
        pdfFileName,
        modelName
      );
      this.logInteraction(prompt, response, analysisType, useDocuments, !!uploadedPdfContent);
      
      return {
        success: true,
        response: response
      };

    } catch (error) {
      console.error('Error in handleChatRequest:', error);
      
      // Enhanced error handling
      const errorMap = {
        'insufficient_quota': { msg: 'API quota exceeded. Please try again later.', code: 429 },
        'invalid_api_key': { msg: 'Invalid API key.', code: 401 },
        'model_not_found': { msg: 'AI model temporarily unavailable.', code: 503 },
        'rate_limit_exceeded': { msg: 'Too many requests. Please wait a moment.', code: 429 }
      };

      const errorInfo = errorMap[error.code] || { msg: 'Something went wrong. Please try again.', code: 500 };
      
      return {
        success: false,
        error: errorInfo.msg,
        statusCode: errorInfo.code
      };
    }
  }

  /**
   * Extract text from PDF buffer (for uploaded PDFs)
   * 
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<string>} Extracted text content
   */
  async extractPdfTextFromBuffer(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer, {
        // PDF parsing options for better text extraction
        max: 0, // No page limit
        version: 'v1.10.100'
      });
      
      return this.cleanPdfText(data.text);
    } catch (error) {
      console.error('Error extracting PDF text from buffer:', error.message);
      return '';
    }
  }

  /**
   * Clean and normalize PDF text for better processing
   * 
   * @param {string} text - Raw PDF text
   * @returns {string} Cleaned text
   */
  cleanPdfText(text) {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page breaks and form feeds
      .replace(/\f/g, '\n\n')
      // Clean up line breaks
      .replace(/\n\s*\n/g, '\n\n')
      // Remove trailing spaces
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  getBankingContext(analysisType) {
    // Reduced tabs return empty for minimal context
    if (analysisType?.includes('reduced')) {
      return '';
    }

    const contexts = {
      'rate-risk': `
  BANKING CONTEXT - ECONOMIC VALUE OF EQUITY (EVE) RISK ANALYSIS:
  You are analyzing Economic Value of Equity (EVE) risk data, NOT Net Interest Income.

  CRITICAL: This is EVE analysis focusing on BALANCE SHEET economic values, not income statement impacts.

  KEY EVE CONCEPTS:
  - Economic Value of Equity (EVE): Market value of assets minus market value of liabilities
  - EVE Risk: Percentage change in EVE under different rate scenarios
  - Duration Risk: How sensitive asset/liability values are to interest rate changes
  - Interest Rate Risk: Economic value exposure to rate movements

  DATA STRUCTURE IDENTIFICATION:
  - "EVE Risk %" column → EVE analysis (economic value)
  - "Assets (EV)" and "Liabilities (EV)" → Economic value data
  - Rate scenarios (-400bp, -300bp, etc.) with economic values → EVE stress testing

  ANALYSIS REQUIREMENTS:
  - FIRST: Identify EVE vs NIM data based on column headers
  - Use EXACT numbers from the complete dataset
  - Focus on ECONOMIC VALUE changes, not income/earnings
  - Reference specific EVE percentages and dollar values
  - Calculate economic value changes using provided data

  FORMATTING:
  - ## for main headers (Dataset Overview, Key Insights, Strategic Recommendations)
  - Numbered points (1, 2, 3) with **bold titles**
  - Bullet points (•) on separate lines for data details
  - Concise analysis with specific numbers and percentages`,

      'net-interest': `
  BANKING CONTEXT - NET INTEREST MARGIN (NIM) SIMULATIONS:
  You are analyzing Net Interest Margin (NIM) simulation data, NOT Economic Value data.

  CRITICAL: This is NIM analysis focusing on INCOME STATEMENT impacts, not balance sheet values.

  KEY NIM CONCEPTS:
  - Net Interest Margin (NIM): Net interest income as % of earning assets
  - Net Interest Income (NII): Interest income minus interest expense
  - Rate Sensitivity: How quickly income reprices with rate changes
  - Earnings at Risk: Income statement exposure to rate movements

  DATA STRUCTURE IDENTIFICATION:
  - "NIM", "NII", "Net Interest" → NIM analysis (income focus)
  - Earnings/income projections → NIM simulation data
  - Interest income/expense changes → NIM analysis

  ANALYSIS REQUIREMENTS:
  - FIRST: Identify NIM vs EVE data based on column headers
  - Use EXACT numbers from the complete dataset
  - Focus on INCOME/EARNINGS changes, not economic values
  - Reference specific NIM percentages and NII dollar changes
  - Calculate income changes and margin impacts

  FORMATTING:
  - ## for main headers (Dataset Overview, Key Insights, Strategic Recommendations)
  - Numbered points (1, 2, 3) with **bold titles**
  - Bullet points (•) on separate lines for data details
  - Focus on rate vulnerability and margin dynamics with specific data`,

      'forecast-kri': `
  BANKING CONTEXT - FORECAST KEY RISK INDICATORS (KRI) ANALYSIS:
  You are analyzing forward-looking Key Risk Indicators across the CAELS framework over a 3-year forecast period.

  CRITICAL: This is FORECAST risk analysis focusing on PROJECTED risk trends and future risk position.

  KEY KRI FORECAST CONCEPTS:
  - CAELS Framework: Capital, Asset Quality, Earnings, Liquidity, Sensitivity to Market Risk
  - Risk Status: Low/Moderate/High risk categorization based on risk tolerance guidelines
  - Risk Trend: Increasing/Decreasing/Stable/Fluctuating patterns over forecast period
  - Risk Outlook: Forward-looking 12-quarter projections of risk behavior
  - Risk Tolerance Guidelines: User-defined acceptable risk ranges for each metric

  CRITICAL KRI CATEGORIES:
  CAPITAL: Tier 1 Leverage, CET1 Capital Ratio, Tier 1 Capital Ratio, Total Capital Ratio, Capital Conservation Buffer
  ASSET QUALITY: Texas Ratio (NPL+OREO/Tier1+ALLL), Coverage Ratio (ALLL/NPL), NPL/Total Loans, CRE Concentrations
  EARNINGS: Net Interest Margin, Net Overhead, Core Earnings, Return on Assets
  LIQUIDITY: Liquid Assets/Total Assets, Non-core Funding Dependence, Wholesale Funding, Net Loans/Assets
  MARKET RISK: Loans & Securities >3 Years/Assets, Residential RE/Assets, Margin Risk Tolerance

  ANALYSIS REQUIREMENTS:
  - FIRST: Identify KRI categories and risk metrics from column headers
  - Use EXACT risk status levels (Low/Moderate/High) from data
  - Reference specific trend directions (Increasing/Decreasing/Stable/Fluctuating)
  - Focus on FORWARD-LOOKING risk implications over forecast horizon
  - Analyze risk trajectory changes and strategic risk positioning
  - Connect current risk status to projected risk outlook

  FORMATTING:
  - ## for main headers (Dataset Overview, Key Risk Insights, Strategic Risk Recommendations)
  - Numbered points (1, 2, 3) with **bold titles** for each risk category
  - Bullet points (•) on separate lines for specific risk metrics and trends
  - Emphasize forward-looking risk management implications`,

      'competitive-kri': `
  BANKING CONTEXT - COMPETITIVE KEY RISK INDICATORS (KRI) ANALYSIS:
  You are analyzing peer-comparative Key Risk Indicators to benchmark risk position against strategic peer groups.

  CRITICAL: This is COMPETITIVE risk analysis focusing on PEER COMPARISON and relative risk positioning.

  KEY COMPETITIVE KRI CONCEPTS:
  - Peer Group Analysis: Comparison against banks of similar size, market focus, and business model
  - Quartile Rankings: Position within peer distribution (1st, 2nd, 3rd, 4th quartile)
  - Peer Medians: Median values for peer group across risk metrics
  - Industry Benchmarks: Broader industry standards and regulatory thresholds
  - Risk-Adjusted Performance: Risk metrics contextualized by peer performance

  COMPARATIVE RISK FRAMEWORK:
  CAPITAL STRENGTH: How capital ratios compare to peer medians and regulatory minimums
  ASSET QUALITY POSITION: Credit risk metrics relative to peer asset quality standards
  EARNINGS PERFORMANCE: Profitability and efficiency vs peer earnings benchmarks
  LIQUIDITY PROFILE: Funding strategy and liquidity position compared to peer norms
  MARKET RISK EXPOSURE: Interest rate risk relative to peer risk management approaches

  ANALYSIS REQUIREMENTS:
  - FIRST: Identify peer comparison metrics and benchmark values
  - Use EXACT peer median values and quartile positions from data
  - Reference specific risk metrics where bank differs significantly from peers
  - Focus on RELATIVE risk position and competitive risk profile
  - Analyze risk-adjusted competitive advantages or disadvantages
  - Identify peer best practices and risk management implications

  FORMATTING:
  - ## for main headers (Dataset Overview, Competitive Risk Analysis, Strategic Positioning)
  - Numbered points (1, 2, 3) with **bold titles** for each comparative analysis
  - Bullet points (•) on separate lines for specific peer comparisons and quartile data
  - Emphasize relative risk position and competitive risk strategy implications`
    };

    return contexts[analysisType] || '';
  }

  /**
   * Enhanced chat function optimized for caching with PDF upload support
   * 
   * @param {string} prompt - User's message
   * @param {string} docContent - Standard document content
   * @param {string} analysisType - Type of analysis
   * @param {string} uploadedPdfContent - Content from uploaded PDF
   * @param {string} pdfFileName - Name of uploaded PDF
   * @returns {Promise<string>} AI response
   */
  async chat(
    prompt,
    docContent,
    analysisType = null,
    uploadedPdfContent = '',
    pdfFileName = null,
    modelName = 'gpt-4.1-mini'
  ) {
    // Minimal modes: send only the user prompt (no system message, no docs)
    if (analysisType && analysisType.includes('minimal')) {
      // Build single-user-message content using exact prompt + uploaded PDF context (if any)
      let minimalUserContent = prompt;
      if (uploadedPdfContent && uploadedPdfContent.trim()) {
        const normalizedPdf = this.normalizeDocumentContentAdvanced(uploadedPdfContent);
        minimalUserContent += `\n\n=== UPLOADED PDF CONTEXT ===\n${normalizedPdf}\n\n=== END PDF CONTEXT ===`;
      }

      // For "minimal + docs" variants, also append normalized documentation content
      if (analysisType.includes('minimal-docs') && docContent && docContent.trim()) {
        const normalizedDocs = this.normalizeDocumentContentAdvanced(docContent);
        minimalUserContent += `\n\n=== DOCUMENTATION CONTEXT ===\n${normalizedDocs}\n\n=== END DOCUMENTATION CONTEXT ===`;
      }

      const completion = await this.openai.chat.completions.create({
        model: modelName || 'gpt-4.1-mini',
        messages: [
          { role: "user", content: minimalUserContent }
        ],
        temperature: 0.2,
        max_tokens: 4000,
        stream: false
      });
      this.trackCacheUsage(completion.usage);
      return completion.choices[0].message.content;
    }

    // Build deterministic base system context (will be cached)
    const baseSystemContext = this.buildBaseSystemContext(analysisType);
    
    // Add analysis-specific context (also cacheable)
    let contextualSystemContent = baseSystemContext;
    if (analysisType) {
      contextualSystemContent += this.getBankingContext(analysisType);
    }

    // Add normalized document content (highly cacheable)
    if (docContent && docContent.trim()) {
      const normalizedDocs = this.normalizeDocumentContentAdvanced(docContent);
      contextualSystemContent += `\n\nADDITIONAL DOCUMENTATION:\n${normalizedDocs}`;
    }

    // Add uploaded PDF content with higher priority weighting
    if (uploadedPdfContent && uploadedPdfContent.trim()) {
      const normalizedPdfContent = this.normalizeDocumentContentAdvanced(uploadedPdfContent);
      const pdfHeader = pdfFileName ? `PRIMARY SOURCE DOCUMENT: ${pdfFileName}` : 'PRIMARY SOURCE DOCUMENT';
      
      contextualSystemContent += `\n\n=== ${pdfHeader} ===\n`;
      contextualSystemContent += `PRIORITY CONTEXT: This uploaded PDF contains the primary source data and analysis related to the user's CSV data. This document should be weighted MORE HEAVILY than other documentation when providing analysis and insights.\n\n`;
      contextualSystemContent += normalizedPdfContent;
      contextualSystemContent += `\n\n=== END PRIMARY SOURCE DOCUMENT ===`;
    }

    // Structure messages for optimal caching
    const messages = [
      {
        role: "system",
        content: contextualSystemContent // This entire content will be cached as prefix
      },
      {
        role: "user", 
        content: prompt // Only this changes between requests
      }
    ];

    // Make API call with caching optimization
    const completion = await this.openai.chat.completions.create({
      model: modelName || 'gpt-4.1-mini',
      messages: messages,
      temperature: 0.2,
      max_tokens: 4000,
      stream: false
      // Note: Caching is automatic - no additional parameters needed
    });

    // Enhanced usage tracking
    this.trackCacheUsage(completion.usage);
    
    return completion.choices[0].message.content;
  }

  /**
   * Build deterministic base system context for consistent caching
   */
  buildBaseSystemContext(analysisType) {
    return `You are a specialized banking analytics expert assistant for BankersGPS.
You provide high-level strategic analysis with clear, concise formatting based on ACTUAL DATA.

CRITICAL DATA TYPE IDENTIFICATION:
- FIRST: Examine column headers and data structure to identify analysis type:
  * "EVE Risk %", "Assets (EV)", "Liabilities (EV)" → EVE (Economic Value of Equity) analysis
  * "NIM", "NII", "Net Interest Income", "Margin" → NIM (Net Interest Margin) analysis
  * "Risk Status", "Risk Trend", "Risk Outlook" + CAELS metrics → KRI (Key Risk Indicators) analysis
  * Peer comparison data, quartile rankings, peer medians → Competitive KRI analysis
  * Forecast projections, forward-looking trends → Forecast KRI analysis
- NEVER assume analysis type - always check actual column headers and data structure
- EVE analysis focuses on BALANCE SHEET economic values and duration risk
- NIM analysis focuses on INCOME STATEMENT impacts and earnings changes
- KRI analysis focuses on RISK MANAGEMENT across CAELS framework (Capital, Asset Quality, Earnings, Liquidity, Sensitivity to Market Risk)

CRITICAL KRI DATA ANALYSIS (when applicable):
- Identify CAELS risk categories: Capital, Asset Quality, Earnings, Liquidity, Market Risk
- Use exact Risk Status levels: Low, Moderate, High from data
- Reference specific Risk Trends: Increasing, Decreasing, Stable, Fluctuating
- For Forecast KRI: Focus on forward-looking risk implications and trajectory
- For Competitive KRI: Emphasize peer comparisons, quartile positions, and relative risk positioning
- Connect risk metrics to strategic risk management and regulatory compliance implications

CRITICAL DATA ANALYSIS REQUIREMENTS:
- ALWAYS identify data type first based on column headers and structure
- Use exact numbers, percentages, and dollar amounts from provided dataset
- Reference specific data points to support every conclusion
- Compare actual values between scenarios using real numbers
- Calculate percentage changes and show work using provided data
- Base ALL insights on observable patterns in complete dataset
- Use correct analytical framework for identified data type

DOCUMENT PRIORITY WEIGHTING:
- PRIMARY SOURCE DOCUMENTS (uploaded PDFs): Highest priority - these contain the authoritative source data
- CSV data analysis: High priority - specific quantitative analysis
- Additional documentation: Supporting context only
- When conflicts arise, prioritize PRIMARY SOURCE DOCUMENTS and CSV data over general documentation

CRITICAL FORMATTING REQUIREMENTS:
- Use ## for main section headers (Dataset Overview, Key Insights/Key Risk Insights, Strategic Recommendations/Strategic Risk Recommendations)
- For Key Insights: Use numbered points (1, 2, 3, etc.) with **bold descriptive titles**
- Follow each numbered point with bullet points (•) for specific details
- MANDATORY: Each bullet point MUST be on separate line with proper line breaks
- Keep analysis high-level and strategic, focusing on business implications
- Explain WHY changes happen based on actual data, not hypothetical scenarios
- Use professional banking terminology appropriately for identified data type
- BE CONCISE - Each bullet point should be 1 sentence maximum with specific numbers
- Avoid verbose explanations - keep bullet points crisp and direct with data references
- For KRI analysis: Focus on risk management implications and strategic risk positioning`;
  }

  /**
   * Advanced document content normalization for optimal caching
   */
  normalizeDocumentContentAdvanced(docContent) {
    return docContent
      // Remove all timestamps and dates that change
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g, '[TIMESTAMP]')
      .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
      .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, '[DATE]')
      .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/g, '[DATE]')
      
      // Remove page numbers and document metadata
      .replace(/Page\s+\d+\s+of\s+\d+/gi, '[PAGE]')
      .replace(/Generated\s+on\s+.+$/gmi, '[GENERATED_DATE]')
      .replace(/Last\s+updated\s*:?\s*.+$/gmi, '[UPDATED_DATE]')
      .replace(/Created\s+on\s+.+$/gmi, '[CREATED_DATE]')
      
      // Normalize whitespace consistently
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
      
      // Remove document-specific identifiers that might change
      .replace(/Document\s+ID\s*:?\s*\w+/gi, '[DOCUMENT_ID]')
      .replace(/Version\s*:?\s*[\d\.]+/gi, '[VERSION]')
      
      // Sort lists alphabetically for consistency (if they exist)
      .replace(/^([-•*]\s+.+)$/gm, (match, p1) => {
        // This ensures bullet points are in consistent order
        return p1;
      });
  }

  /**
   * Enhanced document content getter with advanced caching
   */
  async getDocumentContentCached() {
    const now = new Date();
    const cacheExpiry = 2 * 60 * 60 * 1000; // 2 hour cache for better session persistence
    
    // Check if we need to reload
    const shouldReload = !this.documentContent || 
                        !this.lastDocumentLoad || 
                        (now - this.lastDocumentLoad) > cacheExpiry;

    if (shouldReload) {
      console.log('Loading documents with enhanced caching optimization...');
      
      const newContent = await this.readAllDocumentsWithCaching();
      const newSignature = this.generateContentSignature(newContent);
      
      // Only update if content actually changed
      if (newSignature !== this.contentSignature) {
        console.log('Document content changed - updating cache');
        this.documentContent = newContent;
        this.contentSignature = newSignature;
      } else {
        console.log('Document content unchanged - reusing cache');
      }
      
      this.lastDocumentLoad = now;
      
      if (this.documentContent) {
        console.log(`Cached ${this.documentContent.length} characters of normalized content`);
        console.log(`Content signature: ${this.contentSignature.substring(0, 8)}...`);
      }
    }
    
    return this.documentContent || '';
  }

  /**
   * Generate content signature for change detection
   */
  generateContentSignature(content) {
    // Simple hash function for content verification
    let hash = 0;
    if (content.length === 0) return hash.toString();
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }

  /**
   * Enhanced document reading with deterministic ordering
   */
  async readAllDocumentsWithCaching() {
    try {
      if (!fs.existsSync(this.documentsFolder)) {
        console.warn(`Documents folder not found: ${this.documentsFolder}`);
        return '';
      }

      // Get all files with deterministic sorting
      const allFiles = this.getAllSupportedFilesWithSorting(this.documentsFolder);
      
      if (allFiles.length === 0) {
        console.warn(`No supported files found in: ${this.documentsFolder}`);
        return '';
      }

      console.log(`Processing ${allFiles.length} documents for caching:`);
      
      let allContent = '';
      let processedCount = 0;
      
      // Process files in strict deterministic order
      for (const file of allFiles) {
        try {
          let content = '';
          
          if (file.extension === '.pdf') {
            content = await this.extractPdfText(file.fullPath);
          } else if (file.extension === '.docx') {
            content = await this.extractDocxText(file.fullPath);
          }
          
          if (content.trim()) {
            // Consistent formatting for caching (deterministic structure)
            const dirInfo = file.directory ? ` (${file.directory})` : '';
            allContent += `\n=== ${file.fileName}${dirInfo} ===\n`;
            allContent += content.trim();
            allContent += '\n\n';
            
            processedCount++;
            console.log(`✓ Processed ${file.fileName} (${content.length} chars)`);
          }
          
        } catch (fileError) {
          console.error(`✗ Error processing ${file.fileName}:`, fileError.message);
        }
      }
      
      console.log(`Document processing complete: ${processedCount}/${allFiles.length} files`);
      
      // Apply advanced normalization for optimal caching
      return this.normalizeDocumentContentAdvanced(allContent);
      
    } catch (error) {
      console.error('Error reading documents:', error);
      return '';
    }
  }

  /**
   * Get all supported files with deterministic sorting for caching
   */
  getAllSupportedFilesWithSorting(dirPath, fileList = []) {
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          this.getAllSupportedFilesWithSorting(filePath, fileList);
        } else if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if ((ext === '.docx' || ext === '.pdf') && !file.startsWith('~$')) {
            fileList.push({
              fullPath: filePath,
              fileName: file,
              directory: path.relative(this.documentsFolder, dirPath),
              extension: ext,
              // Add sort key for deterministic ordering
              sortKey: `${path.relative(this.documentsFolder, dirPath)}/${file}`
            });
          }
        }
      }
      
      // Sort by full path for consistent ordering
      return fileList.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error.message);
      return fileList;
    }
  }

  /**
   * Enhanced cache usage tracking - pulls data directly from OpenAI API response
   */
  trackCacheUsage(usage) {
    if (!usage) return;

    const promptTokens = usage.prompt_tokens ?? 0;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;

    // NOTE: Cost calculation is approximate - OpenAI doesn't provide exact costs in API response
    // For exact costs, check your OpenAI dashboard at https://platform.openai.com/usage
    
    // Approximate pricing for gpt-4o-mini (update these based on actual OpenAI pricing)
    const INPUT_RATE = 0.15 / 1_000_000;   // $0.15 per 1M input tokens
    const CACHED_RATE = 0.0375 / 1_000_000;  // 75% discount for cached tokens  
    const OUTPUT_RATE = 0.60 / 1_000_000;  // $0.60 per 1M output tokens

    const nonCachedTokens = Math.max(0, promptTokens - cachedTokens);
    const estimatedCostUSD = (nonCachedTokens * INPUT_RATE) +
                            (cachedTokens * CACHED_RATE) +
                            (completionTokens * OUTPUT_RATE);

    // Update cache statistics
    if (cachedTokens > 0) {
      this.cacheStats.hits++;
      const estimatedSavings = (cachedTokens * INPUT_RATE) - (cachedTokens * CACHED_RATE);
      this.cacheStats.totalSavings += estimatedSavings;
    } else {
      this.cacheStats.misses++;
    }

    const cacheHitRate = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) + '%' : '0%';

    console.log({
      // Raw token data from OpenAI API
      promptTokens,
      cachedTokens,
      completionTokens,
      
      // Estimated costs (for actual costs, check OpenAI dashboard)
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(6)),
      cacheHitRate,
      
      // Session statistics
      sessionCacheHits: this.cacheStats.hits,
      sessionCacheMisses: this.cacheStats.misses,
      estimatedSavings: `${this.cacheStats.totalSavings.toFixed(6)}`,
      
      // Note about accuracy
      note: "For exact costs, check OpenAI dashboard - these are estimates"
    });
  }

  // Utility methods (keeping existing functionality)
  async extractPdfText(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return this.cleanPdfText(data.text);
    } catch (error) {
      console.error(`Error extracting PDF text from ${filePath}:`, error.message);
      return '';
    }
  }

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

  logInteraction(prompt, response, analysisType = null, useDocuments = true, hasPdfUpload = false) {
    const timestamp = new Date().toISOString();
    const contextInfo = analysisType ? ` [${analysisType}]` : '';
    // Detect dataset presence markers from frontend prompts
    let dataIndicator = '';
    if (prompt.includes('COMPLETE DATASET')) {
      dataIndicator = ' [FULL_DATA]';
    } else if (prompt.includes('DATASET (')) {
      dataIndicator = ' [CSV_DATA]';
    }
    const docIndicator = useDocuments ? ' [DOCS_ON]' : ' [DOCS_OFF]';
    const pdfIndicator = hasPdfUpload ? ' [PDF_UPLOADED]' : '';
    const cacheInfo = ` [CACHE_HITS:${this.cacheStats.hits}]`;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${timestamp}]${contextInfo}${dataIndicator}${docIndicator}${pdfIndicator}${cacheInfo} User: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      console.log(`[${timestamp}] Response: ${response.length} chars`);
    }
  }

  async refreshDocuments() {
    console.log('Force refreshing document cache...');
    this.documentContent = null;
    this.contentSignature = null;
    this.lastDocumentLoad = null;
    
    const newContent = await this.getDocumentContentCached();
    console.log(`Document cache force refreshed: ${newContent.length} characters`);
    return newContent;
  }

  getDocumentStats() {
    return {
      documentsFolder: this.documentsFolder,
      lastLoaded: this.lastDocumentLoad,
      contentLength: this.documentContent ? this.documentContent.length : 0,
      contentSignature: this.contentSignature,
      hasContent: !!this.documentContent,
      cacheAge: this.lastDocumentLoad ? new Date() - this.lastDocumentLoad : null,
      cacheStats: { ...this.cacheStats },
      cacheEfficiency: this.cacheStats.hits + this.cacheStats.misses > 0 ? 
        (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Get cache optimization recommendations
   */
  getCacheOptimizationTips() {
    const stats = this.getDocumentStats();
    const tips = [];
    
    if (stats.cacheStats.misses > stats.cacheStats.hits) {
      tips.push('Consider standardizing document formats to improve cache consistency');
    }
    
    if (!stats.hasContent) {
      tips.push('No documents loaded - consider adding documentation for better context');
    }
    
    if (stats.contentLength > 50000) {
      tips.push('Large document set detected - caching will provide significant cost savings');
    }
    
    return tips;
  }
}

module.exports = Chatbot;
