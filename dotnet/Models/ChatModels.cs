namespace dotnet.Models
{
    public class ChatRequest
    {
        public string Prompt { get; set; } = string.Empty;
        public string? AnalysisType { get; set; }
    }

    public class ChatResult
    {
        public bool Success { get; set; }
        public string Response { get; set; } = string.Empty;
        public string Error { get; set; } = string.Empty;
        public int StatusCode { get; set; }
    }

    public class OpenAiResponse
    {
        public Choice[]? Choices { get; set; }
    }

    public class Choice
    {
        public Message? Message { get; set; }
    }

    public class Message
    {
        public string? Content { get; set; }
    }
}