using System.Text.Json;
using dotnet.Models;
using DocumentFormat.OpenXml.Packaging;

namespace dotnet.Services
{
    public class ChatbotService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private string? _documentContent;
        private DateTime? _lastDocumentLoad;

        public ChatbotService(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        /// <summary>
        /// Main function to handle chat requests
        /// </summary>
        /// <param name="prompt">User's question/prompt</param>
        /// <param name="analysisType">Type of analysis ('rate-risk' or 'net-interest')</param>
        /// <returns>Response object with success/error status</returns>
        public async Task<ChatResult> HandleChatRequestAsync(string prompt, string? analysisType = null)
        {
            try
            {
                // Validate input
                if (string.IsNullOrWhiteSpace(prompt))
                {
                    return new ChatResult 
                    { 
                        Success = false, 
                        Error = "Prompt is required.",
                        StatusCode = 400
                    };
                }

                // Get document content (cached for performance)
                var docContent = await GetDocumentContentAsync();
                
                // Generate chat response with banking context
                var response = await ChatAsync(prompt, docContent, analysisType);
                
                // Log the interaction
                LogInteraction(prompt, response, analysisType);
                
                return new ChatResult
                {
                    Success = true,
                    Response = response
                };
            }
            catch (Exception error)
            {
                Console.WriteLine($"Error in handleChatRequest: {error.Message}");
                
                // Handle specific OpenAI errors
                if (error.Message.Contains("insufficient_quota"))
                {
                    return new ChatResult
                    {
                        Success = false,
                        Error = "API quota exceeded. Please try again later.",
                        StatusCode = 429
                    };
                }
                else if (error.Message.Contains("invalid_api_key"))
                {
                    return new ChatResult
                    {
                        Success = false,
                        Error = "Invalid API key.",
                        StatusCode = 401
                    };
                }
                else
                {
                    return new ChatResult
                    {
                        Success = false,
                        Error = "Something went wrong. Please try again.",
                        StatusCode = 500
                    };
                }
            }
        }

        /// <summary>
        /// Get banking context based on analysis type
        /// </summary>
        /// <param name="analysisType">Type of analysis</param>
        /// <returns>Contextual information</returns>
        private string GetBankingContext(string? analysisType)
        {
            var contexts = new Dictionary<string, string>
            {
                ["rate-risk"] = @"
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

Focus on interest rate risk, duration mismatches, repricing gaps, and asset-liability management strategies.",

                ["net-interest"] = @"
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

Focus on income impact, margin compression/expansion, rate sensitivity, and earnings at risk analysis."
            };

            return analysisType != null && contexts.ContainsKey(analysisType) ? contexts[analysisType] : string.Empty;
        }

        /// <summary>
        /// Core chat function that calls OpenAI API
        /// </summary>
        /// <param name="prompt">User's question</param>
        /// <param name="docContent">Combined document content</param>
        /// <param name="analysisType">Type of banking analysis</param>
        /// <returns>AI response</returns>
        private async Task<string> ChatAsync(string prompt, string? docContent, string? analysisType = null)
        {
            var apiKey = _configuration["OpenAI:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("OpenAI API key not configured");
            }

            // Build comprehensive prompt with banking context - EXACT SAME AS NODE.JS VERSION
            var systemContext = @"You are a specialized banking analytics expert assistant for BankersGPS. 
You provide detailed, accurate analysis of banking data with focus on practical insights and actionable recommendations.

Always structure your responses with clear headings and bullet points for readability.
Focus on business implications and risk management insights.";

            // Add specific banking context if analysis type is provided
            if (!string.IsNullOrEmpty(analysisType))
            {
                systemContext += GetBankingContext(analysisType);
            }

            // Add document content if available
            if (!string.IsNullOrEmpty(docContent))
            {
                systemContext += $"\n\nADDITIONAL DOCUMENTATION:\n{docContent}";
            }

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

            var requestBody = new
            {
                model = "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = systemContext },
                    new { role = "user", content = prompt }
                },
                temperature = 0.3
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content);
            var responseJson = await response.Content.ReadAsStringAsync();
            
            var openAiResponse = JsonSerializer.Deserialize<OpenAiResponse>(responseJson, new JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            });

            return openAiResponse?.Choices?[0]?.Message?.Content ?? "No response received";
        }

        /// <summary>
        /// Read all Word documents from the specified folder
        /// </summary>
        /// <returns>Combined content from all documents</returns>
        private async Task<string> ReadAllDocxFromFolderAsync()
        {
            try
            {
                var documentsPath = Path.Combine(Directory.GetCurrentDirectory(), "documents");
                
                // Check if folder exists
                if (!Directory.Exists(documentsPath))
                {
                    Console.WriteLine($"Documents folder not found: {documentsPath}");
                    return string.Empty;
                }

                var files = Directory.GetFiles(documentsPath);
                var docxFiles = files.Where(file => 
                    file.ToLower().EndsWith(".docx") && 
                    !Path.GetFileName(file).StartsWith("~$") // Ignore temp files
                ).ToArray();

                if (docxFiles.Length == 0)
                {
                    Console.WriteLine($"No .docx files found in: {documentsPath}");
                    return string.Empty;
                }

                var allContent = string.Empty;

                foreach (var file in docxFiles)
                {
                    try
                    {
                        var fileName = Path.GetFileName(file);
                        var content = ExtractTextFromDocx(file);
                        
                        allContent += $"\n--- Content from {fileName} ---\n";
                        allContent += content.Trim();
                        allContent += "\n\n";
                        
                    }
                    catch (Exception fileError)
                    {
                        Console.WriteLine($"Error reading file {file}: {fileError.Message}");
                        // Continue with other files
                    }
                }

                return allContent;
            }
            catch (Exception error)
            {
                Console.WriteLine($"Error reading documents folder: {error.Message}");
                return string.Empty;
            }
        }

        /// <summary>
        /// Extract text from a Word document using OpenXml
        /// </summary>
        /// <param name="filePath">Path to the .docx file</param>
        /// <returns>Extracted text content</returns>
        private string ExtractTextFromDocx(string filePath)
        {
            try
            {
                using var wordDocument = DocumentFormat.OpenXml.Packaging.WordprocessingDocument.Open(filePath, false);
                var body = wordDocument.MainDocumentPart?.Document?.Body;
                
                if (body == null)
                    return string.Empty;

                return body.InnerText;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error extracting text from {filePath}: {ex.Message}");
                return string.Empty;
            }
        }

        /// <summary>
        /// Get document content with caching (reload every 10 minutes)
        /// </summary>
        /// <returns>Cached or freshly loaded document content</returns>
        private async Task<string?> GetDocumentContentAsync()
        {
            var now = DateTime.Now;
            var cacheExpiry = TimeSpan.FromMinutes(10); // 10 minutes

            // Load documents if not cached or cache expired
            if (_documentContent == null || 
                _lastDocumentLoad == null || 
                (now - _lastDocumentLoad) > cacheExpiry)
            {
                _documentContent = await ReadAllDocxFromFolderAsync();
                _lastDocumentLoad = now;
            }

            return _documentContent;
        }

        /// <summary>
        /// Log chat interactions
        /// </summary>
        /// <param name="prompt">User's question</param>
        /// <param name="response">AI's response</param>
        /// <param name="analysisType">Type of analysis</param>
        private void LogInteraction(string prompt, string response, string? analysisType = null)
        {
            var timestamp = DateTime.Now.ToString("o"); // ISO format
            var contextInfo = !string.IsNullOrEmpty(analysisType) ? $" [{analysisType}]" : "";
            // Console.WriteLine($"[{timestamp}]{contextInfo} AI Response: {response}");
        }

        /// <summary>
        /// Utility method to refresh document cache manually
        /// </summary>
        public async Task<string> RefreshDocumentsAsync()
        {
            _documentContent = await ReadAllDocxFromFolderAsync();
            _lastDocumentLoad = DateTime.Now;
            return _documentContent;
        }

        /// <summary>
        /// Get information about loaded documents
        /// </summary>
        /// <returns>Stats about loaded documents</returns>
        public object GetDocumentStats()
        {
            return new
            {
                documentsFolder = Path.Combine(Directory.GetCurrentDirectory(), "documents"),
                lastLoaded = _lastDocumentLoad,
                contentLength = _documentContent?.Length ?? 0,
                hasContent = !string.IsNullOrEmpty(_documentContent)
            };
        }
    }
}