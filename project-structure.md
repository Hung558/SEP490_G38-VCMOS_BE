# Project Structure

```
.
├── .github/              # GitHub config
├── api/                  # API documentations
├── src/                  # Main application source code
│   ├── config/           # App configuration
│   ├── controllers/      # Request handlers that return responses
│   ├── middlewares/      # Auth
│   ├── models/           # Database models and schemas
│   ├── routes/           # Maps URL endpoints to controllers
│   ├── services/         # Business logic layer
│   └── validators/       # Validates data (called in controllers)
├── tests/                # Automated tests
├── .env                  # Local environment variables
├── .env.example          # Template of required environment variables
├── .gitignore            # Files and folders excluded from Git
├── package-lock.json     # Locked dependency versions
├── package.json          # Project metadata, scripts, dependencies
├── README.md             # Project overview and setup guide
└── server.js             # Application entry point
```