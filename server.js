// server.js - LED Line BR Parts - OpenAI DALL-E 3
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
app.use(express.static('public'));

// Servir arquivos estáticos
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

// Função para extrair dados de produto de URLs
async function extractProductFromUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    
    let productData = {};
    
    // Detecção específica por plataforma
    if (url.includes('shopify') || url.includes('myshopify')) {
      productData = extractShopifyProduct($);
    } else if (url.includes('mercadolivre') || url.includes('mercadolibre')) {
      productData = extractMercadoLivreProduct($);
    } else if (url.includes('amazon')) {
      productData = extractAmazonProduct($);
    } else {
      productData = extractGenericProduct($);
    }
    
    // Validar se conseguiu extrair dados mínimos
    if (!productData.name || productData.name.length < 3) {
      throw new Error('Não foi possível extrair informações válidas do produto');
    }
    
    return productData;
    
  } catch (error) {
    console.error('Erro ao extrair produto:', error.message);
    throw new Error(`Erro ao carregar produto: ${error.message}`);
  }
}

function extractShopifyProduct($) {
  // Múltiplos seletores para maior compatibilidade
  const nameSelectors = [
    'h1.product-single__title',
    '.product__title',
    'h1[data-product-title]',
    '.product-title',
    'h1.product_title',
    '.pdp-product-name',
    'h1'
  ];
  
  const imageSelectors = [
    'img.product-single__photo',
    '.product__photo img',
    '.product-featured-image',
    '.product-gallery img',
    '.product-image-main img',
    'img[data-image-id]'
  ];
  
  const descSelectors = [
    '.product-single__description',
    '.product__description',
    '.rte',
    '.product-description',
    '.product-details'
  ];

  let name = '';
  let image = '';
  let description = '';

  // Tentar múltiplos seletores para nome
  for (const selector of nameSelectors) {
    const element = $(selector).first();
    if (element.length && element.text().trim()) {
      name = element.text().trim();
      break;
    }
  }

  // Tentar múltiplos seletores para imagem
  for (const selector of imageSelectors) {
    const element = $(selector).first();
    if (element.length && element.attr('src')) {
      image = element.attr('src');
      // Garantir URL completa
      if (image.startsWith('//')) {
        image = 'https:' + image;
      } else if (image.startsWith('/')) {
        image = 'https://cdn.shopify.com' + image;
      }
      break;
    }
  }

  // Tentar múltiplos seletores para descrição
  for (const selector of descSelectors) {
    const element = $(selector).first();
    if (element.length && element.text().trim()) {
      description = element.text().trim().substring(0, 300);
      break;
    }
  }

  return {
    name: name || 'Produto LED Line',
    description: description || 'Produto automotivo LED de alta qualidade',
    image: image || '',
    price: $('.product-single__price, .price, .product__price').first().text().trim() || '',
    vendor: $('.product-single__vendor, .product__vendor').first().text().trim() || 'LED Line BR Parts'
  };
}

function extractMercadoLivreProduct($) {
  return {
    name: $('h1.x-item-title-label, .it-ttl, .ui-pdp-title').first().text().trim() || 'Produto Automotivo',
    description: $('.item-description, .item-description-text, .ui-pdp-description').first().text().trim().substring(0, 300) || 'Produto para veículos',
    image: $('img.gallery-image, .gallery-image-container img, .ui-pdp-gallery img').first().attr('src') || '',
    price: $('.price-tag-fraction, .notranslate, .ui-pdp-price').first().text().trim() || '',
    vendor: $('.seller-info__title, .profile-info-name').first().text().trim() || ''
  };
}

function extractAmazonProduct($) {
  return {
    name: $('#productTitle, .product-title').first().text().trim() || 'Produto Amazon',
    description: $('.feature-bullets ul li, .a-unordered-list li').first().text().trim().substring(0, 300) || 'Produto automotivo',
    image: $('#landingImage, .a-dynamic-image').first().attr('src') || '',
    price: $('.a-price-whole, .a-offscreen').first().text().trim() || '',
    vendor: $('.a-link-normal').first().text().trim() || ''
  };
}

function extractGenericProduct($) {
  return {
    name: $('h1, .product-title, .title, [class*="title"]').first().text().trim() || 'Produto',
    description: $('meta[name="description"]').attr('content') || $('.description, [class*="description"]').first().text().trim().substring(0, 300) || 'Produto automotivo',
    image: $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '',
    price: $('.price, .cost, .valor, [class*="price"]').first().text().trim() || '',
    vendor: $('meta[property="og:site_name"]').attr('content') || ''
  };
}

// Função otimizada para OpenAI DALL-E 3
async function generateCarVisualization(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    // Limpar base64
    const cleanBase64 = carImageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Detectar tipo de produto LED para prompt específico
    const productType = detectLEDProductType(productName, productDescription);
    const prompt = getLEDPrompt(productType, productName, productDescription);
    
    console.log(`🚗 Gerando visualização: ${productName} (Tipo: ${productType})`);
    
    // Usar DALL-E 3 via API de edição de imagens
    const response = await axios.post('https://api.openai.com/v1/images/edits', {
      image: cleanBase64,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 segundos
    });
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Resposta inválida da OpenAI');
    }
    
    console.log('✅ Visualização gerada com sucesso');
    return response.data.data[0].url;
    
  } catch (error) {
    console.error('❌ Erro OpenAI detalhado:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key da OpenAI inválida. Verifique suas configurações.');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de uso da OpenAI atingido. Tente novamente em alguns minutos.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.error?.message || 'Imagem inválida';
      throw new Error(`Erro na imagem: ${errorMsg}`);
    } else {
      throw new Error(`Erro ao processar com IA: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Detectar tipo de produto LED
function detectLEDProductType(productName, productDescription) {
  const text = (productName + ' ' + productDescription).toLowerCase();
  
  if (text.includes('farol') || text.includes('headlight') || text.includes('drl')) {
    return 'headlight';
  }
  if (text.includes('lanterna') || text.includes('taillight') || text.includes('traseiro')) {
    return 'taillight';
  }
  if (text.includes('seta') || text.includes('pisca') || text.includes('indicator')) {
    return 'indicator';
  }
  if (text.includes('strip') || text.includes('fita') || text.includes('barra')) {
    return 'lightbar';
  }
  if (text.includes('interior') || text.includes('ambiente')) {
    return 'interior';
  }
  if (text.includes('placa') || text.includes('license')) {
    return 'license';
  }
  if (text.includes('fog') || text.includes('milha') || text.includes('neblina')) {
    return 'foglight';
  }
  
  return 'generic';
}

// Prompts específicos para produtos LED
function getLEDPrompt(productType, productName, productDescription) {
  const basePrompt = `Install ${productName} on this car in a professional and realistic way. The LED lighting should be bright and properly positioned. Maintain the original car's lighting, shadows, and perspective.`;
  
  const specificPrompts = {
    headlight: `Replace or upgrade the headlights of this car with ${productName}. The new LED headlights should be bright white, properly aligned, and look professionally installed. Maintain the car's original design aesthetic while making the headlights noticeably brighter and more modern.`,
    
    taillight: `Replace or upgrade the taillights of this car with ${productName}. The new LED taillights should have a modern appearance with bright red illumination. The installation should look factory-professional and maintain the vehicle's original design language.`,
    
    lightbar: `Install ${productName} on this car. The LED light bar should be mounted appropriately (roof, bumper, or grille area) and appear to emit bright white light. The mounting should look professional and integrated with the vehicle's design.`,
    
    indicator: `Replace the turn signal lights with ${productName}. The LED indicators should emit bright amber/orange light and be properly positioned where the original turn signals are located. The installation should look clean and professional.`,
    
    interior: `Install ${productName} inside this car's interior. The LED ambient lighting should create a subtle glow in appropriate interior areas like footwells, door panels, or dashboard. The lighting should be visible but not overpowering.`,
    
    license: `Install ${productName} to illuminate the license plate area of this car. The LED lighting should provide bright, even illumination of the rear license plate area and look professionally mounted.`,
    
    foglight: `Install ${productName} as fog lights on this car. The LED fog lights should be mounted in the front bumper area and emit bright white light. The installation should look factory-professional and properly integrated.`,
    
    generic: basePrompt
  };
  
  return specificPrompts[productType] || basePrompt;
}

// ROTAS DA API

// Rota para extrair produto de URL
app.post('/api/extract-product', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }
    
    // Validar URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }
    
    console.log('🔍 Extraindo produto de:', url);
    const productData = await extractProductFromUrl(url);
    
    console.log('✅ Produto extraído:', productData.name);
    
    res.json({
      success: true,
      product: productData
    });
    
  } catch (error) {
    console.error('❌ Erro na extração:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para gerar visualização
app.post('/api/generate-visualization', async (req, res) => {
  try {
    const { carImageBase64, productName, productDescription } = req.body;
    
    if (!carImageBase64 || !productName) {
      return res.status(400).json({ 
        error: 'Imagem do carro (base64) e nome do produto são obrigatórios' 
      });
    }
    
    // Validar base64
    if (!carImageBase64.includes('data:image/')) {
      return res.status(400).json({ 
        error: 'Formato de imagem inválido. Use base64 válido.' 
      });
    }
    
    console.log(`🚗 Iniciando visualização LED: ${productName}`);
    
    // Gerar visualização com OpenAI
    const resultImageUrl = await generateCarVisualization(
      carImageBase64, 
      productName,
      productDescription || 'produto LED automotivo'
    );
    
    // Log para analytics
    console.log(`📊 Visualização LED concluída: ${productName} - ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName,
      message: 'Visualização LED Line criada com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro na visualização:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar OpenAI
app.get('/api/test-openai', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API Key não configurada' });
    }
    
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    
    res.json({
      success: true,
      message: 'OpenAI API funcionando',
      models: response.data.data.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('💥 Erro geral:', error);
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
    console.log(`🚀 LED Line Visualizer rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI configurada: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`⚡ Pronto para visualizações LED!`);
  });
}
