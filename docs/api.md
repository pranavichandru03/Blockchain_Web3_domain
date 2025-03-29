# API Reference

## Base URL
`http://localhost:3000` (Development)  
`https://api.yourdomain.com` (Production)

## Authentication
None (Public API)

## Endpoints

### `POST /api/chat`
**Request:**
```json
{
  "message": "How do I buy an ENS domain?",
  "sessionId": "optional-cache-key"
}
```

**Response:**
```json
{
  "reply": "To buy an ENS domain...",
  "model": "gpt-4-turbo-preview",
  "usage": { "total_tokens": 42 }
}
```

### `POST /api/domain/check`
**Request:**
```json
{ "domain": "vitalik.eth" }
```

**Response:**
```json
{
  "domain": "vitalik.eth",
  "available": false,
  "legalWarning": "This domain may violate trademark rights."
}
```