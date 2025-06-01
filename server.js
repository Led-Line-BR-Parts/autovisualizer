// server.js - LED Line BR Parts - DALL-E 3 Generations (Compatível Vercel)
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
    service: 'LED Line BR Parts Visualizer - DALL-E 3'
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

// Função para detectar tipo de produto LED
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

// Função para analisar imagem do carro usando GPT-4 Vision
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
              text: "Analyze this car image and describe: car type, color, angle/view, and overall appearance. Be specific but concise (max 100 words)."
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
      max_tokens: 150
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Erro na análise da imagem:', error.message);
    // Fallback se não conseguir analisar
    return "a modern car";
  }
}

// Função usando DALL-E 3 Generations (SEM multipart)
async function generateCarVisualizationDALLE3(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    // Analisar imagem do carro primeiro
    console.log('🔍 Analisando foto do carro...');
    const carDescription = await analyzeCarImage(carImageBase64);
    console.log('📋 Descrição do carro:', carDescription);
    
    // Detectar tipo de produto LED
    const productType = detectLEDProductType(productName, productDescription);
    
    // Criar prompt detalhado para DALL-E 3
    const prompt = createAdvancedPrompt(carDescription, productType, productName, productDescription);
    
    console.log(`🎨 Gerando com DALL-E 3: ${productName} (Tipo: ${productType})`);
    console.log(`📝 Prompt: ${prompt.substring(0, 200)}...`);
    
    // Usar DALL-E 3 Generations (JSON simples)
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
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Resposta inválida do DALL-E 3');
    }
    
    const imageUrl = response.data.data[0].url;
    if (!imageUrl) {
      throw new Error('Imagem não gerada pelo DALL-E 3');
    }
    
    console.log('✅ Visualização DALL-E 3 gerada com sucesso');
    console.log('🔗 URL gerada:', imageUrl.substring(0, 50) + '...');
    
    return imageUrl;
    
  } catch (error) {
    console.error('❌ Erro DALL-E 3 detalhado:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key da OpenAI inválida. Verifique suas configurações.');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de uso da OpenAI atingido. Tente novamente em alguns minutos.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.error?.message || 'Prompt inválido';
      throw new Error(`Erro no prompt: ${errorMsg}`);
    } else if (error.response?.status === 403) {
      throw new Error('Acesso negado. Verifique se sua conta tem acesso ao DALL-E 3.');
    } else {
      throw new Error(`Erro DALL-E 3: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Criar prompt avançado baseado na análise do carro
function createAdvancedPrompt(carDescription, productType, productName, productDescription) {
  const baseStyle = "Photorealistic, high-quality automotive photography, professional lighting, detailed";
  
  const prompts = {
    headlight: `${baseStyle}. Create an image of ${carDescription} with upgraded LED headlights (${productName}). The car should have modern, bright white LED headlights with a crisp, clean appearance and visible LED elements. The headlights should look professionally installed and significantly brighter than standard headlights. Maintain the car's original design while showcasing the premium LED technology. Show realistic lighting effects and proper beam pattern.`,
    
    taillight: `${baseStyle}. Create an image of ${carDescription} with upgraded LED taillights (${productName}). The car should have modern LED taillights with bright red illumination, clear lenses, and distinctive LED light patterns. The taillights should look factory-professional and maintain the vehicle's design language while adding a contemporary LED appearance. Show the LEDs as illuminated with proper light distribution.`,
    
    lightbar: `${baseStyle}. Create an image of ${carDescription} with an LED light bar (${productName}) professionally mounted. The LED light bar should be appropriately positioned on the roof, front bumper, or grille area and appear to emit bright white light. The mounting should look clean and integrated with the vehicle's design. Show realistic beam pattern and professional installation.`,
    
    foglight: `${baseStyle}. Create an image of ${carDescription} with LED fog lights (${productName}) installed in the front bumper. The LED fog lights should emit bright white light with proper beam pattern and be professionally integrated into the bumper design. The installation should look factory-quality with clean mounting and proper alignment.`,
    
    indicator: `${baseStyle}. Create an image of ${carDescription} with LED turn signal indicators (${productName}). The car should have modern LED turn signals that emit bright amber light with crisp LED patterns. The indicators should be positioned where original turn signals are located and maintain proper visibility while adding a modern LED appearance.`,
    
    interior: `${baseStyle}. Create an image of ${carDescription} with LED interior ambient lighting (${productName}). Show the car's interior with subtle LED lighting in areas like footwells, door panels, or dashboard trim. The lighting should create a premium atmosphere with even light distribution and appear professionally installed.`,
    
    license: `${baseStyle}. Create an image of ${carDescription} with LED license plate lighting (${productName}). The rear of the car should have bright, even LED illumination for the license plate area that provides excellent visibility. The LED lights should be properly positioned and integrated with the vehicle's rear design.`,
    
    generic: `${baseStyle}. Create an image of ${carDescription} with ${productName} LED automotive product installed. The installation should look professional, maintain the car's original design aesthetic, and showcase LED technology with realistic lighting effects. Show proper integration and realistic appearance based on the product type.`
  };
  
  return prompts[productType] || prompts.generic;
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

// Rota para gerar visualização com DALL-E 3
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
    
    console.log(`🎨 Iniciando visualização DALL-E 3: ${productName}`);
    
    // Gerar visualização com DALL-E 3
    const resultImageUrl = await generateCarVisualizationDALLE3(
      carImageBase64, 
      productName,
      productDescription || 'produto LED automotivo LED Line BR Parts'
    );
    
    // Log para analytics
    console.log(`📊 Visualização DALL-E 3 concluída: ${productName} - ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName,
      model: 'dall-e-3',
      message: 'Visualização LED Line criada com DALL-E 3!'
    });
    
  } catch (error) {
    console.error('❌ Erro na visualização DALL-E 3:', error.message);
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
    
    // Testar acesso aos modelos
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    
    // Verificar modelos disponíveis
    const models = response.data.data.map(model => model.id);
    const imageModels = models.filter(model => 
      model.includes('dall-e') || model.includes('gpt-4o')
    );
    
    res.json({
      success: true,
      message: 'OpenAI API funcionando',
      totalModels: models.length,
      imageModels: imageModels,
      usingModel: 'dall-e-3 + gpt-4o-mini',
      strategy: 'generations (não edits)'
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
    console.log(`🚀 LED Line Visualizer DALL-E 3 rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI configurada: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`🎨 Usando DALL-E 3 + GPT-4o-mini para visualizações!`);
  });
}
