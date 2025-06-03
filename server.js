// server.js - LED Line BR Parts - VERSÃO FINAL FUNCIONANDO
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    service: 'LED Line BR Parts Visualizer'
  });
});

// Função para analisar imagem do carro
async function analyzeCarImage(carImageBase64) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text", 
              text: "Analyze this car and describe: make, model, color, angle. Be concise (max 50 words)."
            },
            {
              type: "image_url",
              image_url: {
                url: carImageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Erro na análise:', error.message);
    return "a modern car";
  }
}

// Função principal de geração
async function generateCarVisualization(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    console.log('🔍 Analisando carro...');
    const carDescription = await analyzeCarImage(carImageBase64);
    console.log('📋 Carro:', carDescription);
    
    const prompt = `Photorealistic image of ${carDescription} with ${productName} (${productDescription}) professionally installed. High quality automotive photography, realistic lighting, professional installation. The LED product should look naturally integrated and properly mounted on the vehicle.`;
    
    console.log(`🎨 Gerando com DALL-E 3: ${productName}`);
    
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
      throw new Error('Imagem não gerada');
    }
    
    console.log('✅ Sucesso!');
    return response.data.data[0].url;
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key inválida');
    } else if (error.response?.status === 429) {
      throw new Error('Limite atingido, tente em alguns minutos');
    } else if (error.response?.status === 400) {
      throw new Error('Erro na imagem ou prompt');
    } else {
      throw new Error('Erro na geração: ' + error.message);
    }
  }
}

// Extração simplificada para LED Line
async function extractLEDLineProduct(url) {
  try {
    console.log('🔍 Extraindo de LED Line:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    
    // Seletores específicos para LED Line
    const name = $('h1.product__title, .product-meta__title, h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                'Produto LED Line';
                
    const description = $('.product__description, .product-description, .rte').first().text().trim().substring(0, 300) ||
                       $('meta[name="description"]').attr('content') ||
                       'Produto automotivo LED de alta qualidade';
                       
    const image = $('.product__media img, .product-gallery img, .featured-image img').first().attr('src') ||
                  $('meta[property="og:image"]').attr('content') ||
                  '';
    
    // Garantir URL absoluta da imagem
    let finalImage = image;
    if (image && image.startsWith('//')) {
      finalImage = 'https:' + image;
    } else if (image && image.startsWith('/')) {
      finalImage = 'https://ledlinebrparts.com' + image;
    }
    
    console.log('✅ Extraído:', { name, hasImage: !!finalImage });
    
    return {
      name,
      description,
      image: finalImage,
      vendor: 'LED Line BR Parts',
      sourceUrl: url
    };
    
  } catch (error) {
    console.error('❌ Erro extração:', error.message);
    throw new Error('Não foi possível carregar o produto. Verifique a URL.');
  }
}

// ROTAS SIMPLIFICADAS

// Extrair produto
app.post('/api/extract-product', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL obrigatória' });
    }
    
    console.log('🔍 Extraindo:', url);
    
    // Limpar URL
    const cleanUrl = url.split('?')[0];
    const productData = await extractLEDLineProduct(cleanUrl);
    
    res.json({
      success: true,
      product: productData
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Gerar visualização
app.post('/api/generate-visualization', async (req, res) => {
  try {
    const { carImageBase64, productName, productDescription } = req.body;
    
    if (!carImageBase64 || !productName) {
      return res.status(400).json({ 
        error: 'Imagem do carro e nome do produto obrigatórios' 
      });
    }
    
    console.log(`🎨 Gerando: ${productName}`);
    
    const resultImageUrl = await generateCarVisualization(
      carImageBase64, 
      productName,
      productDescription || 'produto LED automotivo'
    );
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName,
      model: 'dall-e-3'
    });
    
  } catch (error) {
    console.error('❌ Erro visualização:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Teste
app.get('/api/test', (req, res) => {
  res.json({
    status: 'API funcionando',
    timestamp: new Date().toISOString(),
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });
});

// Catch all para SPAs
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((error, req, res, next) => {
  console.error('💥 Erro:', error);
  res.status(500).json({ 
    error: 'Erro interno do servidor' 
  });
});

// Export para Vercel
module.exports = app;

// Local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔑 OpenAI: ${!!process.env.OPENAI_API_KEY}`);
  });
}
