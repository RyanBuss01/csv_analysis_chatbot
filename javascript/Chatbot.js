/**
 * BankersGPS Analytics Chatbot - Simplified Backend
 * 
 * Cleaned up version with only the essential analysis configurations
 * and streamlined prompt handling.
 * 
 * @author Ryan Bussert
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

/**
 * Main Chatbot class with simplified configuration
 */
class Chatbot {
  constructor(apiKey, documentsFolder = './documents') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey: apiKey });
    this.documentsFolder = documentsFolder;
    
    // Caching properties
    this.documentContent = null;
    this.lastDocumentLoad = null;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalSavings: 0
    };
    
    this.contentSignature = null;
  }

  /**
   * Main chat request handler
   */
  async handleChatRequest(
    prompt,
    analysisType = null,
    useDocuments = true,
    uploadedPdfBuffer = null,
    pdfFileName = null,
    modelName = 'gpt-4.1-mini',
    messages = null
  ) {
    try {
      if ((!prompt || String(prompt).trim() === '') && (!messages || (Array.isArray(messages) && messages.length === 0))) {
        return {
          success: false,
          error: 'Prompt is required.',
          statusCode: 400
        };
      }

      // Get document content if requested
      let docContent = '';
      if (useDocuments) {
        docContent = await this.getDocumentContentCached();
      }
      
      // Process uploaded document if provided (PDF or DOCX)
      let uploadedPdfContent = '';
      if (uploadedPdfBuffer && pdfFileName) {
        try {
          const ext = path.extname(pdfFileName).toLowerCase();
          console.log(`Processing uploaded file: ${pdfFileName} (${uploadedPdfBuffer.length} bytes)`);

          if (ext === '.pdf') {
            console.log('Detected PDF upload; extracting text');
            uploadedPdfContent = await this.extractPdfTextFromBuffer(uploadedPdfBuffer);
          } else if (ext === '.docx') {
            console.log('Detected DOCX upload; extracting text');
            uploadedPdfContent = await this.extractDocxTextFromBuffer(uploadedPdfBuffer);
          } else {
            console.warn(`Unsupported uploaded file type: ${ext}`);
          }

          if (uploadedPdfContent && uploadedPdfContent.trim()) {
            console.log(`✓ Extracted ${uploadedPdfContent.length} characters from uploaded file`);
          } else {
            console.warn('⚠ No text content extracted from uploaded file');
          }
        } catch (pdfError) {
          console.error('Error processing uploaded file:', pdfError);
        }
      }
      
      const response = await this.chat(
        prompt,
        docContent,
        analysisType,
        uploadedPdfContent,
        pdfFileName,
        modelName,
        messages
      );
      
      this.logInteraction(prompt, response, analysisType, useDocuments, !!uploadedPdfContent);
      
      return {
        success: true,
        response: response
      };

    } catch (error) {
      console.error('Error in handleChatRequest:', error);
      
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
   * Simplified chat function
   */
  async chat(
    prompt,
    docContent,
    analysisType = null,
    uploadedPdfContent = '',
    pdfFileName = null,
    modelName = 'gpt-4.1-mini',
    messages = null
  ) {
    // Build messages payload: prefer provided conversation if present
    let payloadMessages = null;
    if (Array.isArray(messages) && messages.length > 0) {
      payloadMessages = messages.slice();

      // Optionally append uploaded document and docs context
      if (uploadedPdfContent && uploadedPdfContent.trim()) {
        const normalized = this.normalizeDocumentContent(uploadedPdfContent);
        const fileTypeLabel = (pdfFileName && path.extname(pdfFileName).toLowerCase() === '.docx') ? 'DOCX' : 'PDF';
        payloadMessages.push({ role: 'user', content: `Use this data from ${fileTypeLabel}:\n${normalized}` });
      }
      if (docContent && docContent.trim()) {
        const normalizedDocs = this.normalizeDocumentContent(docContent);
        const systemInstructions = `You are a helpful assistant for BankersGPS, a banking analytics platform. Use the documentation context below to answer user questions.

When answering:
- If the question relates to topics covered in the documentation (banking, interest rates, risk management, BankersGPS features, assumptions, etc.), provide a helpful and thorough answer based on the documentation.
- If the question is completely unrelated to banking, finance, or BankersGPS (e.g., questions about weather, sports, cooking, etc.), respond with exactly this message (including the formatting):

No result found. Try restating your question in more detail, or contact a Plansmith expert for additional help.

**Email:** support@bankersgps.com
**Call:** 800-323-3281

=== DOCUMENTATION CONTEXT ===
${normalizedDocs}

=== END DOCUMENTATION CONTEXT ===`;
        payloadMessages.unshift({ role: 'system', content: systemInstructions });
      }
    } else {
      // Fallback: single user message format
      let userContent = prompt;

      if (uploadedPdfContent && uploadedPdfContent.trim()) {
        const normalized = this.normalizeDocumentContent(uploadedPdfContent);
        const fileTypeLabel = (pdfFileName && path.extname(pdfFileName).toLowerCase() === '.docx') ? 'DOCX' : 'PDF';
        userContent += `\n\nUse this data from ${fileTypeLabel}:\n${normalized}`;
      }
      if (docContent && docContent.trim()) {
        const normalizedDocs = this.normalizeDocumentContent(docContent);
        userContent += `\n\n=== DOCUMENTATION CONTEXT ===\n${normalizedDocs}\n\n=== END DOCUMENTATION CONTEXT ===`;
      }

      payloadMessages = [{ role: 'user', content: userContent }];
    }

    const payload = {
      model: modelName || 'gpt-4.1-mini',
      messages: payloadMessages,
    };

    if (modelName !== 'gpt-5') {
      payload.temperature = 0.2;
      payload.stream = false;
    } else {
      payload.reasoning_effort = 'low';
    }

    const completion = await this.openai.chat.completions.create(payload);
    this.trackCacheUsage(completion.usage);
    return completion.choices[0].message.content;
  }

  /**
   * Extract text from PDF buffer
  */
  async extractPdfTextFromBuffer(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer, {
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
   * Extract text from DOCX buffer
   */
  async extractDocxTextFromBuffer(docxBuffer) {
    try {
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      if (result.messages && result.messages.length > 0) {
        console.warn('DOCX extraction warnings:', result.messages);
      }
      return (result.value || '').trim();
    } catch (error) {
      console.error('Error extracting DOCX text from buffer:', error.message);
      return '';
    }
  }

  /**
   * Clean PDF text
   */
  cleanPdfText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\f/g, '\n\n')
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  /**
   * Simplified document content normalization
   */
  normalizeDocumentContent(docContent) {
    return docContent
      // Remove timestamps and dates
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g, '[TIMESTAMP]')
      .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
      .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, '[DATE]')
      .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/g, '[DATE]')
      
      // Remove page numbers and metadata
      .replace(/Page\s+\d+\s+of\s+\d+/gi, '[PAGE]')
      .replace(/Generated\s+on\s+.+$/gmi, '[GENERATED_DATE]')
      .replace(/Last\s+updated\s*:?\s*.+$/gmi, '[UPDATED_DATE]')
      .replace(/Created\s+on\s+.+$/gmi, '[CREATED_DATE]')
      
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
      
      // Remove document identifiers
      .replace(/Document\s+ID\s*:?\s*\w+/gi, '[DOCUMENT_ID]')
      .replace(/Version\s*:?\s*[\d\.]+/gi, '[VERSION]');
  }

  /**
   * Get cached document content
   */
  async getDocumentContentCached() {
    const now = new Date();
    const cacheExpiry = 2 * 60 * 60 * 1000; // 2 hour cache
    
    const shouldReload = !this.documentContent || 
                        !this.lastDocumentLoad || 
                        (now - this.lastDocumentLoad) > cacheExpiry;

    if (shouldReload) {
      console.log('Loading documents...');
      
      const newContent = await this.readAllDocuments();
      const newSignature = this.generateContentSignature(newContent);
      
      if (newSignature !== this.contentSignature) {
        console.log('Document content changed - updating cache');
        this.documentContent = newContent;
        this.contentSignature = newSignature;
      } else {
        console.log('Document content unchanged - reusing cache');
      }
      
      this.lastDocumentLoad = now;
      
      if (this.documentContent) {
        console.log(`Cached ${this.documentContent.length} characters of content`);
      }
    }
    
    return this.documentContent || '';
  }

  /**
   * Generate content signature for change detection
   */
  generateContentSignature(content) {
    let hash = 0;
    if (content.length === 0) return hash.toString();
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return hash.toString();
  }

  /**
   * Read all documents with caching
   */
  async readAllDocuments() {
    try {
      if (!fs.existsSync(this.documentsFolder)) {
        console.warn(`Documents folder not found: ${this.documentsFolder}`);
        return '';
      }

      const allFiles = this.getAllSupportedFiles(this.documentsFolder);
      
      if (allFiles.length === 0) {
        console.warn(`No supported files found in: ${this.documentsFolder}`);
        return '';
      }

      console.log(`Processing ${allFiles.length} documents:`);
      
      let allContent = '';
      let processedCount = 0;
      
      for (const file of allFiles) {
        try {
          let content = '';
          
          if (file.extension === '.pdf') {
            content = await this.extractPdfText(file.fullPath);
          } else if (file.extension === '.docx') {
            content = await this.extractDocxText(file.fullPath);
          }
          
          if (content.trim()) {
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
      
      return this.normalizeDocumentContent(allContent);
      
    } catch (error) {
      console.error('Error reading documents:', error);
      return '';
    }
  }

  /**
   * Get all supported files with sorting
   */
  getAllSupportedFiles(dirPath, fileList = []) {
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          this.getAllSupportedFiles(filePath, fileList);
        } else if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if ((ext === '.docx' || ext === '.pdf') && !file.startsWith('~$')) {
            fileList.push({
              fullPath: filePath,
              fileName: file,
              directory: path.relative(this.documentsFolder, dirPath),
              extension: ext,
              sortKey: `${path.relative(this.documentsFolder, dirPath)}/${file}`
            });
          }
        }
      }
      
      return fileList.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error.message);
      return fileList;
    }
  }

  /**
   * Track cache usage
   */
  trackCacheUsage(usage) {
    if (!usage) return;

    const promptTokens = usage.prompt_tokens ?? 0;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;

    // Approximate pricing for gpt-4o-mini
    const INPUT_RATE = 0.15 / 1_000_000;
    const CACHED_RATE = 0.0375 / 1_000_000;  
    const OUTPUT_RATE = 0.60 / 1_000_000;

    const nonCachedTokens = Math.max(0, promptTokens - cachedTokens);
    const estimatedCostUSD = (nonCachedTokens * INPUT_RATE) +
                            (cachedTokens * CACHED_RATE) +
                            (completionTokens * OUTPUT_RATE);

    if (cachedTokens > 0) {
      this.cacheStats.hits++;
      const estimatedSavings = (cachedTokens * INPUT_RATE) - (cachedTokens * CACHED_RATE);
      this.cacheStats.totalSavings += estimatedSavings;
    } else {
      this.cacheStats.misses++;
    }

    const cacheHitRate = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) + '%' : '0%';

    console.log({
      promptTokens,
      cachedTokens,
      completionTokens,
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(6)),
      cacheHitRate,
      sessionCacheHits: this.cacheStats.hits,
      sessionCacheMisses: this.cacheStats.misses,
      estimatedSavings: `${this.cacheStats.totalSavings.toFixed(6)}`,
      note: "For exact costs, check OpenAI dashboard"
    });
  }

  // Utility methods
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
    
    const promptText = typeof prompt === 'string' ? prompt : '[conversation]';
    let dataIndicator = '';
    if (promptText.includes('DATASET (')) {
      dataIndicator = ' [CSV_DATA]';
    }
    
    const docIndicator = useDocuments ? ' [DOCS_ON]' : ' [DOCS_OFF]';
    const pdfIndicator = hasPdfUpload ? ' [PDF_UPLOADED]' : '';
    const cacheInfo = ` [CACHE_HITS:${this.cacheStats.hits}]`;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${timestamp}]${contextInfo}${dataIndicator}${docIndicator}${pdfIndicator}${cacheInfo} User: ${promptText.substring(0, 100)}${promptText.length > 100 ? '...' : ''}`);
      console.log(`[${timestamp}] Response: ${response ? response.length : 0} chars`);
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
