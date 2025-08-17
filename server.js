import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Replace with your frontend domain
    : true, // Allow all origins in development
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Crystal Companions Backend'
  });
});

// OpenAI Chat Completions Proxy Endpoint
app.post('/api/chat/completions', async (req, res) => {
  try {
    console.log('Received chat completion request');
    
    // Validate request body
    const { model, messages, max_completion_tokens, ...otherParams } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required',
          type: 'invalid_request_error'
        }
      });
    }

    // Validate messages format
    for (const message of messages) {
      if (!message.role || !message.content) {
        return res.status(400).json({
          error: {
            message: 'Each message must have role and content',
            type: 'invalid_request_error'
          }
        });
      }
    }

    // Prepare OpenAI request
    const openaiRequest = {
      model: model || 'gpt-4o-mini',
      messages: messages,
      max_completion_tokens: max_completion_tokens || 40,
      ...otherParams
    };

    console.log(`Making OpenAI request with ${messages.length} messages`);

    // Call OpenAI API
    const completion = await openai.chat.completions.create(openaiRequest);

    console.log('OpenAI request successful');

    // Return the response in the same format as OpenAI
    res.json(completion);

  } catch (error) {
    console.error('OpenAI API Error:', error);

    // Handle different types of errors
    if (error.code === 'insufficient_quota') {
      return res.status(429).json({
        error: {
          message: 'API quota exceeded',
          type: 'insufficient_quota',
          code: 'insufficient_quota'
        }
      });
    }

    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded, please try again later',
          type: 'rate_limit_exceeded',
          code: 'rate_limit_exceeded'
        }
      });
    }

    if (error.status) {
      // OpenAI API error
      return res.status(error.status).json({
        error: {
          message: error.message || 'OpenAI API error',
          type: error.type || 'api_error',
          code: error.code || 'api_error'
        }
      });
    }

    // Generic server error
    res.status(500).json({
      error: {
        message: 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'server_error'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      type: 'not_found'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Crystal Companions Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 OpenAI Chat API: http://localhost:${PORT}/api/chat/completions`);
  
  // Log environment status
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 OpenAI API Key: '✅ Set' : '❌ Missing'}`);
});