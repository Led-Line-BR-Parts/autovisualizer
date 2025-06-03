const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    openai: !!process.env.OPENAI_API_KEY
  });
});

// Geração de visualização
app.post('/api/generate-visualization', async (req, res) => {
  try {
    const { carImageBase64, productName, productDescription } = req.body;
    
    if (!carImageBase64 || !productName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Imagem do carro e nome do produto são obrigatórios' 
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'API Key não configurada' 
      });
    }

    console.log('🎨 Gerando visualização:', productName);

    // Análise da imagem do carro
    const carAnalysis = await analyzeCarImage(carImageBase64);
    console.log('🚗 Análise do carro:', carAnalysis);

    // Prompt otimizado
    const prompt = `Photorealistic image: ${carAnalysis} with ${productName} (${productDescription || 'LED automotive product'}) professionally installed. High-quality automotive photography, realistic lighting, natural integration. The LED product should look factory-installed and properly integrated with the vehicle design.`;

    console.log('📝 Prompt:', prompt.substring(0, 100) + '...');

    // Gerar com DALL-E 3
    const response = await axios.post('https://api.openai.com/v1/images/generations', {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (!response.data?.data?.[0]?.url) {
      throw new Error('Falha na geração da imagem');
    }

    console.log('✅ Imagem gerada com sucesso!');

    res.json({
      success: true,
      resultImage: response.data.data[0].url,
      productName: productName
    });

  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    
    let userError = 'Erro na geração da imagem';
    
    if (error.response?.status === 401) {
      userError = 'API Key inválida';
    } else if (error.response?.status === 429) {
      userError = 'Limite de uso atingido. Tente em alguns minutos.';
    } else if (error.response?.status === 400) {
      userError = 'Erro na imagem ou prompt';
    }

    res.status(500).json({
      success: false,
      error: userError
    });
  }
});

// Análise da imagem do carro
async function analyzeCarImage(carImageBase64) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          {
            type: "text", 
            text: "Describe this car briefly: make, model, color, angle. Max 30 words."
          },
          {
            type: "image_url",
            image_url: { url: carImageBase64 }
          }
        ]
      }],
      max_tokens: 50
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('⚠️ Erro na análise:', error.message);
    return "a modern car";
  }
}

// Catch all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((error, req, res, next) => {
  console.error('💥 Erro:', error);
  res.status(500).json({ error: 'Erro interno' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    console.log(`🔑 OpenAI: ${!!process.env.OPENAI_API_KEY}`);
  });
}
