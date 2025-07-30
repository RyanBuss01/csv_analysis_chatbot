# Data analysis Chatbot

A specialized banking analytics chatbot that provides intelligent analysis of financial data including rate risk management and net interest margin simulations.

## Project Structure

```
cvs_analysis_chatbot/
├── javascript/          # Node.js/Express development version
│   ├── index.html       # Frontend interface
│   ├── Chatbot.js       # Core chatbot logic
│   ├── server.js        # Express server
│   └── documents/       # Word documents for context (not in repo)
└── dotnet/              # .NET version (current: .NET 9.0)
    ├── Controllers/     # API endpoints
    ├── Services/        # Business logic
    ├── Models/          # Data models
    ├── wwwroot/         # Static files (HTML, CSS, assets)
    └── documents/       # Word documents for context (not in repo)
```

**Note**: The `documents/` folders contain pre-made documents and are not included here in the GitHub repository.

## Development

- **JavaScript Version**: Used for rapid development and testing
- **.NET Version**: Production version adapted from JavaScript code
- **Same Functionality**: Both versions implement identical chatbot logic and OpenAI integration

## Disclaimer

⚠️ **This project is currently built with .NET 9.0 for development purposes. It will be downgraded to .NET Framework 4.6 once access to a compatible computer supporting that framework version is available.**

## Quick Start

### JavaScript Version
```bash
cd javascript
npm install
# Add OPENAI_API_KEY key to .env file
npm start
```

### .NET Version
```bash
cd dotnet
# Add your OpenAI API key to appsettings.json under "OpenAI:ApiKey"
dotnet run
```