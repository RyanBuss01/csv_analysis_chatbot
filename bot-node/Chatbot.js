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
   * @returns {Object} - Response object with success/error status
   */
  async handleChatRequest(prompt) {
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
      
      // Generate chat response
      const response = await this.chat(prompt, docContent);
      
      // Log the interaction
      this.logInteraction(prompt, response);
      
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
   * Core chat function that calls OpenAI API
   * @param {string} prompt - User's question
   * @param {string} docContent - Combined document content
   * @returns {string} - AI response
   */
  async chat(prompt, docContent) {
    // Combine document content with user question
    const fullPrompt = docContent ? `${docContent}\n\nQuestion: ${prompt}` : prompt;
    
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1-mini", // Using the new model as requested
      messages: [
        {
          role: "user",
          content: fullPrompt // Exactly like .NET: documents + "\nQuestion: " + prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
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
          console.log(`Reading document: ${file}`);
          
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
      
      console.log(`Successfully loaded ${docxFiles.length} documents, total characters: ${allContent.length}`);
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
      
      console.log('Loading/reloading document content...');
      this.documentContent = await this.readAllDocxFromFolder();
      this.lastDocumentLoad = now;
    }
    
    return this.documentContent;
  }

  /**
   * Log chat interactions
   * @param {string} prompt - User's question
   * @param {string} response - AI's response
   */
  logInteraction(prompt, response) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] User Question: ${prompt}`);
    console.log(`[${timestamp}] AI Response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
    
    // You can extend this to write to a file or database
    // Example: append to a log file
    // fs.appendFileSync('chat.log', `${timestamp} | Q: ${prompt} | A: ${response}\n`);
  }

  /**
   * Utility method to refresh document cache manually
   */
  async refreshDocuments() {
    console.log('Manually refreshing document cache...');
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