using Microsoft.AspNetCore.Mvc;
using dotnet.Services;  
using dotnet.Models; 

namespace dotnet.Controllers
{
    [ApiController]
    [Route("Chatbot/api")]
    public class ChatController : ControllerBase
    {
        private readonly ChatbotService _chatbotService;

        public ChatController(ChatbotService chatbotService)
        {
            _chatbotService = chatbotService;
        }

        [HttpPost("chat")]
        public async Task<IActionResult> Chat([FromBody] ChatRequest request)
        {
            var result = await _chatbotService.HandleChatRequestAsync(request.Prompt, request.AnalysisType);
            
            if (result.Success)
                return Ok(new { response = result.Response });
            else
                return StatusCode(500, new { error = result.Error });
        }

        [HttpGet("health")]
        public IActionResult Health()
        {
            return Ok(new { status = "OK", timestamp = DateTime.UtcNow });
        }
    }
}