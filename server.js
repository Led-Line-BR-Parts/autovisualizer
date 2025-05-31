// server.js - Versão corrigida para Vercel
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
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função para extrair dados de produto de URLs
async function extractProductFromUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    let productData = {};
    
    // Detecção específica por plataforma
    if (url.includes('shopify')) {
      productData = extractShopifyProduct($);
    } else if (url.includes('mercadolivre') || url.includes('mercadolibre')) {
      productData = extractMercadoLivreProduct($);
    } else {
      productData = extractGenericProduct($);
    }
    
    return productData;
    
  } catch (error) {
    console.error('Erro ao extrair produto:', error.message);
    throw new Error('Não foi possível extrair dados do produto');
  }
}

function extractShopifyProduct($) {
  return {
    name: $('h1.product-single__title, .product__title, h1[data-product-title]').first().text().trim() || 'Produto',
    description: $('.product-single__description, .product__description, .rte').first().text().trim().substring(0, 300) || 'Descrição do produto',
    image: $('img.product-single__photo, .product__photo img, .product-featured-image').first().attr('src') || '',
    price: $('.product-single__price, .price, .product__price').first().text().trim() || '',
    vendor: $('.product-single__vendor, .product__vendor').first().text().trim() || ''
  };
}

function extractMercadoLivreProduct($) {
  return {
    name: $('h1.x-item-title-label, .it-ttl').first().text().trim() || 'Produto',
    description: $('.item-description, .item-description-text').first().text().trim().substring(0, 300) || 'Descrição do produto',
    image: $('img.gallery-image, .gallery-image-container img').first().attr('src') || '',
    price: $('.price-tag-fraction, .notranslate').first().text().trim() || '',
    vendor: $('.seller-info__title, .profile-info-name').first().text().trim() || ''
  };
}

function extractGenericProduct($) {
  return {
    name: $('h1, .product-title, .title').first().text().trim() || 'Produto',
    description: $('meta[name="description"]').attr('content') || $('.description').first().text().trim().substring(0, 300) || 'Descrição do produto',
    image: $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '',
    price: $('.price, .cost, .valor').first().text().trim() || '',
    vendor: $('meta[property="og:site_name"]').attr('content') || ''
  };
}

// Função para chamar a API do OpenAI (simplificada para Vercel)
async function generateCarVisualization(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    // Remover prefixo data:image se existir
    const cleanBase64 = carImageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    
    const prompt = `Transform this car image by adding ${productName} (${productDescription}) in a realistic and professional way. The modification should look natural, maintaining the original lighting, shadows, and perspective. The automotive product should appear properly installed on the vehicle.`;
    
    console.log('Enviando para OpenAI:', { productName, promptLength: prompt.length });
    
    const response = await axios.post('https://api.openai.com/v1/images/edits', {
      image: cleanBase64,
      prompt: prompt,
      n: 1,
      size: "1024x1024"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('Resposta OpenAI recebida');
    return response.data.data[0].url;
    
  } catch (error) {
    console.error('Erro OpenAI detalhado:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key da OpenAI inválida');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de uso da OpenAI atingido');
    } else {
      throw new Error('Erro ao processar imagem com IA: ' + (error.response?.data?.error?.message || error.message));
    }
  }
}

// ROTAS DA API

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });
});

// Rota para extrair produto de URL
app.post('/api/extract-product', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }
    
    console.log('Extraindo produto de:', url);
    const productData = await extractProductFromUrl(url);
    
    res.json({
      success: true,
      product: productData
    });
    
  } catch (error) {
    console.error('Erro na extração:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para gerar visualização (sem multer - usando base64 direto)
app.post('/api/generate-visualization', async (req, res) => {
  try {
    const { carImageBase64, productName, productDescription } = req.body;
    
    if (!carImageBase64 || !productName) {
      return res.status(400).json({ 
        error: 'Imagem do carro (base64) e nome do produto são obrigatórios' 
      });
    }
    
    console.log('Iniciando geração de visualização para:', productName);
    
    // Gerar visualização com OpenAI
    const resultImageUrl = await generateCarVisualization(
      carImageBase64, 
      productName,
      productDescription || 'produto automotivo'
    );
    
    console.log('Visualização gerada com sucesso');
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName
    });
    
  } catch (error) {
    console.error('Erro na visualização:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('Erro geral:', error);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Para Vercel, exportar o app
if (process.env.VERCEL) {
  module.exports = app;
} else {
  // Para desenvolvimento local
  app.listen(PORT, () => {
    console.log(`🚀 AutoVisualizer rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI configurada: ${!!process.env.OPENAI_API_KEY}`);
  });
}
