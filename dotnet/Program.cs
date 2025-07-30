using dotnet.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddHttpClient<ChatbotService>();

var app = builder.Build();

// Configure the HTTP request pipeline
app.UseStaticFiles();
app.UseRouting();
app.MapControllers();

// Fallback to serve index.html for SPA
app.MapFallbackToFile("index.html");

app.Run();