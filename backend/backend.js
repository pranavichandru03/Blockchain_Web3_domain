require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require("openai");
const { ethers } = require('ethers');
const { Transaction } = require('@ethereumjs/tx');
const { Common } = require('@ethereumjs/common');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Enhanced Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json({ limit: '10kb' }));
app.use(morgan('combined'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize OpenAI API with enhanced configuration
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing in .env file');
  }
  openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 3,
    organization: process.env.OPENAI_ORG_ID
  });
} catch (error) {
  console.error('OpenAI initialization failed:', error.message);
  process.exit(1);
}

// Enhanced Ethers Provider Configuration
let provider;
try {
  const network = process.env.ETHEREUM_NETWORK || 'homestead';
  const providerOptions = {
    timeout: 5000,
    pollingInterval: 10000
  };

  if (process.env.INFURA_API_KEY) {
    provider = new ethers.InfuraProvider(
      network,
      process.env.INFURA_API_KEY,
      providerOptions
    );
  } else if (process.env.ALCHEMY_API_KEY) {
    provider = new ethers.AlchemyProvider(
      network,
      process.env.ALCHEMY_API_KEY,
      providerOptions
    );
  } else {
    console.warn('Using default provider (limited functionality)');
    provider = ethers.getDefaultProvider(network, providerOptions);
  }
} catch (error) {
  console.error('Provider initialization failed:', error.message);
  process.exit(1);
}

// Constants
const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const ENS_REGISTRY_ABI = [
  'function resolver(bytes32 node) external view returns (address)'
];
const DOMAIN_BLACKLIST = ["vitalik", "coinbase", "opensea", "trustwallet"];
const TRADEMARKS = ["google", "amazon", "microsoft", "binance", "twitter", "facebook", "apple"];

// Data stores with TTL consideration
const domains = {};
const recoveryShards = {};
const sessionCache = new Map();

// Enhanced AI Helper with caching
async function getAIResponse(messages, cacheKey = null, retries = 3) {
  if (cacheKey && sessionCache.has(cacheKey)) {
    return sessionCache.get(cacheKey);
  }

  while (retries > 0) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
        messages,
        temperature: 0.7,
        max_tokens: 500,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      if (cacheKey) {
        sessionCache.set(cacheKey, response);
        setTimeout(() => sessionCache.delete(cacheKey), 60000); // 1 minute cache
      }

      return response;
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.warn(Retrying AI request (${retries} left)...);
      await new Promise(resolve => setTimeout(resolve, 2000 * (4 - retries)));
    }
  }
}

// Enhanced API Documentation
app.get('/', (req, res) => {
  res.json({
    status: 'Web3 Domain Chatbot API',
    version: '1.1',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      chat: {
        method: 'POST',
        path: '/api/chat',
        description: 'Get AI-powered answers about Web3 domains',
        exampleBody: { 
          message: "How do I buy an ENS domain?",
          sessionId: "optional-cache-key" 
        }
      },
      domainCheck: {
        method: 'POST',
        path: '/api/domain/check',
        description: 'Check domain availability and pricing',
        exampleBody: { 
          domain: "example.eth",
          checkLegal: true 
        }
      },
      recoverySetup: {
        method: 'POST',
        path: '/api/recovery/setup',
        description: 'Setup social recovery for wallet',
        exampleBody: { 
          walletAddress: "0x...", 
          guardians: ["email1@test.com", "email2@test.com"],
          threshold: 2 
        }
      },
      urlValidate: {
        method: 'POST',
        path: '/api/url/validate',
        description: 'Validate URL format and safety',
        exampleBody: { url: "https://example.com" },
        responseFormat: {
          valid: "boolean",
          message: "string",
          examples: "[array] (when invalid)",
          details: {
            protocol: "string",
            domain: "string",
            hasPath: "boolean"
          }
        }
      }
    }
  });
});

// Enhanced Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, domain = "", sessionId } = req.body;
    
    if (!message || typeof message !== 'string' || message.length > 500) {
      return res.status(400).json({ 
        error: "Message must be a string (max 500 characters)" 
      });
    }

    // Domain validation if provided
    if (domain) {
      if (typeof domain !== 'string' || domain.length > 100) {
        return res.status(400).json({ 
          error: "Domain must be a string (max 100 characters)" 
        });
      }

      const scamCheck = await checkForScams(domain);
      if (scamCheck.isScam) {
        return res.status(403).json({ 
          reply: scamCheck.message,
          flagged: true
        });
      }

      const legalCheck = await checkLegalCompliance(domain);
      if (legalCheck.hasIssue) {
        return res.status(403).json({ 
          reply: legalCheck.message,
          legalWarning: true
        });
      }
    }

    const response = await getAIResponse([
      {
        role: "system",
        content: "You are a Web3 domain expert specializing in ENS, Unstoppable Domains, and .sol domains. " +
                 "Provide concise, accurate answers about registration, management, and security. " +
                 "Format responses with Markdown for better readability. " +
                 "If a question is unclear, ask for clarification."
      },
      { role: "user", content: message }
    ], sessionId);

    if (!response?.choices?.[0]?.message?.content) {
      throw new Error("Invalid response structure from OpenAI");
    }

    res.json({ 
      reply: response.choices[0].message.content,
      model: response.model,
      usage: response.usage
    });
    
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ 
      error: "Service temporarily unavailable",
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message,
        stack: error.stack 
      })
    });
  }
});

// Enhanced Domain Check Endpoint
app.post('/api/domain/check', async (req, res) => {
  try {
    const { domain, checkLegal = true } = req.body;
    
    if (!domain || typeof domain !== 'string' || domain.length > 100) {
      return res.status(400).json({ 
        error: "Domain must be a valid string (max 100 characters)" 
      });
    }

    const domainLower = domain.toLowerCase();
    const domainParts = domainLower.split('.');
    
    if (domainParts.length !== 2 || !domainParts[0] || !domainParts[1]) {
      return res.status(400).json({ 
        error: "Invalid domain format (expected 'name.tld')" 
      });
    }

    // Legal check if requested
    let legalWarning = null;
    if (checkLegal) {
      const legalCheck = await checkLegalCompliance(domainLower);
      if (legalCheck.hasIssue) {
        legalWarning = legalCheck.message;
      }
    }

    // Availability check
    const isAvailable = await checkDomainAvailability(domainLower);
    const price = isAvailable ? await estimateDomainPrice(domainLower) : 0;
    
    res.json({ 
      domain: domainLower,
      available: isAvailable, 
      price,
      currency: "ETH",
      legalWarning,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Domain Check Error:", error);
    res.status(500).json({ 
      error: "Domain check service unavailable",
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message 
      })
    });
  }
});

// Enhanced Recovery Setup Endpoint
app.post('/api/recovery/setup', async (req, res) => {
  try {
    const { walletAddress, guardians, threshold = 2 } = req.body;
    
    // Input validation
    if (!ethers.utils.isAddress(walletAddress)) {
      return res.status(400).json({ 
        error: "Invalid Ethereum address" 
      });
    }

    if (!Array.isArray(guardians) || guardians.length < threshold || guardians.length > 5) {
      return res.status(400).json({ 
        error: Requires 2-5 guardians (received ${guardians?.length || 0}) 
      });
    }

    if (threshold < 2 || threshold > guardians.length) {
      return res.status(400).json({ 
        error: Threshold must be between 2 and ${guardians.length} 
      });
    }

    // Create recovery shards
    const shards = createRecoveryShards(walletAddress, guardians);
    recoveryShards[walletAddress.toLowerCase()] = {
      shards,
      threshold,
      createdAt: new Date().toISOString()
    };

    res.json({ 
      success: true,
      wallet: walletAddress,
      threshold,
      guardianCount: guardians.length,
      setupAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Recovery Setup Error:", error);
    res.status(500).json({ 
      error: "Recovery setup failed",
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message 
      })
    });
  }
});

// Enhanced URL Validation Endpoint with Debugging
app.post('/api/url/validate', async (req, res) => {
  console.log('URL validation request received:', req.body); // Debug log
  
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || url.length > 2048) {
      console.log('Invalid URL input:', url); // Debug log
      return res.status(400).json({
        valid: false,
        message: 'URL must be a string (max 2048 characters)',
        error: 'Invalid input format'
      });
    }

    // Enhanced URL validation regex
    const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+([/\w- .?%&=]*)?$/;
    const isValidFormat = urlRegex.test(url);

    if (!isValidFormat) {
      console.log('URL format validation failed:', url); // Debug log
      return res.json({
        valid: false,
        message: 'Invalid URL format. Please include protocol (http/https) and domain',
        examples: [
          'https://example.com',
          'http://subdomain.example.com/path',
          'https://example.com/page.html?param=value'
        ]
      });
    }

    // Additional security checks
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      console.log('Localhost URL blocked:', url); // Debug log
      return res.json({
        valid: false,
        message: 'Localhost URLs are not allowed for security reasons'
      });
    }

    // Basic validation response (without actual HTTP check)
    const result = {
      valid: true,
      message: 'URL is properly formatted',
      details: {
        protocol: url.startsWith('https') ? 'HTTPS (Secure)' : 
                 url.startsWith('http') ? 'HTTP' : 'None (Added automatically)',
        domain: url.replace(/^(https?:\/\/)?([^\/]+).*$/, '$2'),
        hasPath: url.includes('/') && url.split('/').length > 3
      }
    };

    console.log('URL validation successful:', result); // Debug log
    res.json(result);

  } catch (error) {
    console.error("URL Validation Error:", error);
    res.status(500).json({ 
      valid: false,
      error: "URL validation service unavailable",
      message: "We couldn't validate the URL due to a server error",
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message,
        stack: error.stack 
      })
    });
  }
});

// Helper Functions with Enhanced Features
async function checkForScams(domain) {
  try {
    const domainLower = domain.toLowerCase();
    const isScam = DOMAIN_BLACKLIST.some(name => 
      domainLower.includes(name.toLowerCase())
    );
    
    return {
      isScam,
      message: isScam ? 
        Security Alert: The domain '${domain}' may be impersonating a well-known Web3 entity. : 
        null
    };
  } catch (error) {
    console.error("Scam Check Error:", error);
    return { isScam: false };
  }
}

async function checkLegalCompliance(domain) {
  try {
    const domainName = domain.toLowerCase().split('.')[0];
    const hasIssue = TRADEMARKS.some(tm => 
      domainName === tm.toLowerCase()
    );
    
    return {
      hasIssue,
      message: hasIssue ? 
        Legal Notice: The domain '${domain}' may violate trademark rights. : 
        null
    };
  } catch (error) {
    console.error("Legal Check Error:", error);
    return { hasIssue: false };
  }
}

async function checkDomainAvailability(domain) {
  try {
    const domainLower = domain.toLowerCase();
    
    // For non-ETH domains, check in-memory storage
    if (!domainLower.endsWith('.eth')) {
      return !domains[domainLower];
    }

    const registry = new ethers.Contract(
      ENS_REGISTRY_ADDRESS, 
      ENS_REGISTRY_ABI, 
      provider
    );
    
    const namehash = ethers.utils.namehash(domainLower);
    const resolverAddress = await registry.resolver(namehash);
    
    return resolverAddress === ethers.constants.AddressZero;
  } catch (error) {
    console.error("Domain availability check failed:", error);
    return false;
  }
}

async function estimateDomainPrice(domain) {
  const namePart = domain.split('.')[0];
  const length = namePart.length;
  
  // Dynamic pricing based on length and desirability
  if (length <= 3) return 1.0;    // 3 characters or less
  if (length <= 5) return 0.5;    // 4-5 characters
  return 0.1;                      // 6+ characters
}

function createRecoveryShards(walletAddress, guardians) {
  return guardians.map(guardian => ({
    guardian,
    shard: uuidv4(),
    wallet: walletAddress.toLowerCase(),
    createdAt: new Date().toISOString()
  }));
}

// Enhanced Server Startup with Port Configuration
const PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PORT_ATTEMPTS = 10;

const startServer = (port, attempt = 0) => {
  const server = app.listen(port, HOST, () => {
    console.log(Server running on http://${HOST}:${port});
    console.log(Environment: ${process.env.NODE_ENV || 'development'});
    console.log(OpenAI Ready: ${!!openai});
    console.log(Provider Ready: ${!!provider});
    console.log(Allowed Origins: ${process.env.ALLOWED_ORIGINS || 'All'});
    console.log('Available Endpoints:');
    console.log(- POST /api/chat);
    console.log(- POST /api/domain/check);
    console.log(- POST /api/recovery/setup);
    console.log(- POST /api/url/validate);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      const newPort = port + 1;
      console.log(Port ${port} in use, trying ${newPort}...);
      startServer(newPort, attempt + 1);
    } else {
      console.error('Server failed to start:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
};

startServer(PORT);