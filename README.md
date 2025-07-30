# BankersGPS Analytics Chatbot

A specialized banking analytics chatbot that provides intelligent analysis of financial data including rate risk management and net interest margin simulations. Built for integration with BankersGPS banking software.

## Project Structure

```
plansmith-chatbot/
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

**Note**: The `documents/` folders contain proprietary documentation and are not included in the GitHub repository.

## Development Approach

- **JavaScript Version**: Used for rapid development and testing on macOS
- **.NET Version**: Production-ready version adapted from JavaScript code
- **Same Functionality**: Both versions implement identical chatbot logic and OpenAI integration

## Disclaimer

⚠️ **This project is currently built with .NET 9.0 for development purposes. It will be downgraded to .NET Framework 4.6 once access to a Windows computer supporting that framework version is available.**

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

## Features

- Banking-specific AI analysis for rate risk and net interest margin data
- Document integration for contextual responses
- CSV data processing and visualization
- RESTful API endpoints
- Responsive web interface