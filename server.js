// server.js - LED Line BR Parts - Multipart Form-Data Corrigido
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

// Função para multipart form-data manual (compatível com Vercel)
function createMultipartFormData(fields, files) {
  const boundary = `----formdata-boundary-${Date.now()}`;
  let formData = '';
  
  // Adicionar campos de texto
  for (const [key, value] of Object.entries(fields)) {
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    formData += `${value}\r\n`;
  }
  
  // Adicionar arquivos
  for (const [key, file] of Object.entries(files)) {
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="${key}"; filename="image.jpg"\r\n`;
    formData += `Content-Type: image/jpeg\r\n\r\n`;
    formData += file; // Aqui seria o buffer da imagem
    formData += `\r\n`;
  }
  
  formData += `--${boundary}--\r\n`;
  
  return {
    data: formData,
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

// Função simplificada usando DALL-E 2 (mais compatível com Vercel)
async function generateCarVisualizationDALLE2(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    // Detectar tipo de produto LED para prompt específico
    const productType = detectLEDProductType(productName, productDescription);
    const prompt = getLEDPromptForDALLE2(productType, productName, productDescription);
    
    console.log(`🎨 Gerando com DALL-E 2: ${productName} (Tipo: ${productType})`);
    console.log(`📝 Prompt: ${prompt.substring(0, 150)}...`);
    
    // Converter base64 para buffer
    const imageBuffer = Buffer.from(carImageBase64.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
    
    // Criar boundary para multipart
    const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;
    
    // Construir dados multipart manualmente
    let formData = '';
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="image"; filename="car.png"\r\n`;
    formData += `Content-Type: image/png\r\n\r\n`;
    
    // Criar payload como buffer
    const header = Buffer.from(formData, 'utf8');
    const footer = Buffer.from(`\r\n--${boundary}\r\n`, 'utf8');
    
    const promptPart = `Content-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n--${boundary}\r\n`;
    const sizePart = `Content-Disposition: form-data; name="size"\r\n\r\n1024x1024\r\n--${boundary}\r\n`;
    const nPart = `Content-Disposition: form-data; name="n"\r\n\r\n1\r\n--${boundary}--\r\n`;
    
    const promptBuffer = Buffer.from(promptPart, 'utf8');
    const sizeBuffer = Buffer.from(sizePart, 'utf8');
    const nBuffer = Buffer.from(nPart, 'utf8');
    
    // Combinar todos os buffers
    const payload = Buffer.concat([
      header,
      imageBuffer,
      footer,
      promptBuffer,
      sizeBuffer,
      nBuffer
    ]);
    
    // Chamar API DALL-E 2 Edits
    const response = await axios.post('https://api.openai.com/v1/images/edits', payload, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Resposta inválida do DALL-E 2');
    }
    
    // DALL-E 2 retorna URL
    const imageUrl = response.data.data[0].url;
    if (!imageUrl) {
      throw new Error('Imagem não gerada pelo DALL-E 2');
    }
    
    console.log('✅ Visualização DALL-E 2 gerada com sucesso');
    
    return imageUrl;
    
  } catch (error) {
    console.error('❌ Erro DALL-E 2 detalhado:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key da OpenAI inválida. Verifique suas configurações.');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de uso da OpenAI atingido. Tente novamente em alguns minutos.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.error?.message || 'Requisição inválida';
      throw new Error(`Erro na requisição: ${errorMsg}`);
    } else {
      throw new Error(`Erro DALL-E 2: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Prompts otimizados para DALL-E 2
function getLEDPromptForDALLE2(productType, productName, productDescription) {
  const baseStyle = "Professional automotive installation, realistic lighting, high quality";
  
  const prompts = {
    headlight: `${baseStyle}. Install LED headlights (${productName}) on this car, bright white modern headlights, clean installation`,
    
    taillight: `${baseStyle}. Install LED taillights (${productName}) on this car, bright red LED lights, professional installation`,
    
    lightbar: `${baseStyle}. Install LED light bar (${productName}) on this car, bright white LED bar, proper mounting`,
    
    foglight: `${baseStyle}. Install LED fog lights (${productName}) on this car, bright white fog lights in bumper`,
    
    indicator: `${baseStyle}. Install LED turn signals (${productName}) on this car, bright amber LED indicators`,
    
    interior: `${baseStyle}. Install LED interior lighting (${productName}) in this car, ambient LED lighting`,
    
    license: `${baseStyle}. Install LED license plate lights (${productName}) on this car, bright license illumination`,
    
    generic: `${baseStyle}. Install ${productName} LED product on this car, professional automotive installation`
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

// Rota para gerar visualização com DALL-E 2
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
    
    console.log(`🎨 Iniciando visualização DALL-E 2: ${productName}`);
    
    // Gerar visualização com DALL-E 2
    const resultImageUrl = await generateCarVisualizationDALLE2(
      carImageBase64, 
      productName,
      productDescription || 'produto LED automotivo LED Line BR Parts'
    );
    
    // Log para analytics
    console.log(`📊 Visualização DALL-E 2 concluída: ${productName} - ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName,
      model: 'dall-e-2',
      message: 'Visualização LED Line criada com DALL-E 2!'
    });
    
  } catch (error) {
    console.error('❌ Erro na visualização DALL-E 2:', error.message);
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
      model.includes('dall-e') || model.includes('gpt-image')
    );
    
    res.json({
      success: true,
      message: 'OpenAI API funcionando',
      totalModels: models.length,
      imageModels: imageModels,
      usingModel: 'dall-e-2'
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
    console.log(`🚀 LED Line Visualizer DALL-E 2 rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI configurada: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`🎨 Usando DALL-E 2 para visualizações!`);
  });
}
