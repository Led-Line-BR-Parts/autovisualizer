// server.js - LED Line BR Parts - GPT-Image-1
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const FormData = require('form-data');
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
    service: 'LED Line BR Parts Visualizer - GPT-Image-1'
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

// Função otimizada para GPT-Image-1
async function generateCarVisualizationGPTImage1(carImageBase64, productName, productDescription) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('API Key da OpenAI não configurada');
  }

  try {
    // Detectar tipo de produto LED para prompt específico
    const productType = detectLEDProductType(productName, productDescription);
    const prompt = getLEDPromptForGPTImage1(productType, productName, productDescription);
    
    console.log(`🎨 Gerando com GPT-Image-1: ${productName} (Tipo: ${productType})`);
    console.log(`📝 Prompt: ${prompt.substring(0, 150)}...`);
    
    // Converter base64 para buffer
    const imageBuffer = Buffer.from(carImageBase64.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
    
    // Criar FormData para envio
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', prompt);
    formData.append('image', imageBuffer, {
      filename: 'car.jpg',
      contentType: 'image/jpeg'
    });
    formData.append('size', '1024x1024');
    formData.append('quality', 'high');
    formData.append('n', '1');
    
    // Chamar API GPT-Image-1 Edits
    const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 90000, // 90 segundos para GPT-Image-1
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Resposta inválida do GPT-Image-1');
    }
    
    // GPT-Image-1 retorna base64 sempre
    const imageBase64 = response.data.data[0].b64_json;
    if (!imageBase64) {
      throw new Error('Imagem não gerada pelo GPT-Image-1');
    }
    
    // Converter base64 para URL de dados para exibição
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;
    
    console.log('✅ Visualização GPT-Image-1 gerada com sucesso');
    console.log('📊 Tokens usados:', response.data.usage?.total_tokens || 'N/A');
    
    return imageDataUrl;
    
  } catch (error) {
    console.error('❌ Erro GPT-Image-1 detalhado:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('API Key da OpenAI inválida. Verifique suas configurações.');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de uso da OpenAI atingido. Tente novamente em alguns minutos.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.error?.message || 'Requisição inválida';
      throw new Error(`Erro na requisição: ${errorMsg}`);
    } else if (error.response?.status === 403) {
      throw new Error('Acesso negado. Verifique se sua conta tem acesso ao GPT-Image-1.');
    } else {
      throw new Error(`Erro GPT-Image-1: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Prompts específicos para GPT-Image-1 (mais avançados)
function getLEDPromptForGPTImage1(productType, productName, productDescription) {
  const baseStyle = "High-quality photorealistic automotive modification. Professional installation. Maintain original car aesthetics while enhancing with LED technology.";
  
  const prompts = {
    headlight: `${baseStyle} Install ${productName} LED headlights on this car. Replace the existing headlights with modern, bright white LED headlights that have a crisp, clean appearance with visible LED elements and proper beam pattern. The new headlights should look professionally integrated, maintaining the car's original design language while providing noticeably brighter and more advanced lighting technology. Show realistic lighting effects and proper alignment.`,
    
    taillight: `${baseStyle} Upgrade this car with ${productName} LED taillights. Replace the existing taillights with modern LED units featuring bright red illumination, clear lenses, and distinctive LED light patterns. The new taillights should maintain the vehicle's original design proportions while adding a premium, contemporary LED appearance. Show the LEDs as if they're illuminated with proper light distribution.`,
    
    lightbar: `${baseStyle} Install ${productName} LED light bar on this car. Mount the LED light bar in an appropriate location (roof, front bumper, or grille area) that complements the vehicle's design. The light bar should appear to emit bright white light with realistic beam pattern and mounting hardware that looks professionally installed and integrated with the vehicle's aesthetic.`,
    
    foglight: `${baseStyle} Add ${productName} LED fog lights to this car's front bumper. Install the LED fog lights in the factory fog light positions or create clean, integrated mounting points. The fog lights should emit bright white light with proper beam pattern for fog conditions and appear professionally installed with clean wiring and mounting.`,
    
    indicator: `${baseStyle} Replace the turn signals with ${productName} LED indicators. Install modern LED turn signal lights that emit bright amber light with crisp LED patterns. The indicators should be positioned where the original turn signals are located and maintain proper visibility while adding a modern LED appearance to the vehicle.`,
    
    interior: `${baseStyle} Install ${productName} LED interior lighting in this car. Add subtle LED ambient lighting in appropriate interior areas such as footwells, door panels, dashboard trim, or center console. The lighting should create a premium atmosphere with even light distribution and appear professionally installed without overpowering the interior.`,
    
    license: `${baseStyle} Install ${productName} LED license plate lighting on this car. Add bright, even LED illumination for the rear license plate area that provides excellent visibility while maintaining a clean, professional appearance. The LED lights should be properly positioned and integrated with the vehicle's rear design.`,
    
    generic: `${baseStyle} Install ${productName} on this car. Add this LED automotive product to the vehicle in the most appropriate location based on its function. The installation should look professional, maintain the car's original design aesthetic, and showcase the LED technology with realistic lighting effects. Ensure proper integration and realistic appearance.`
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

// Rota para gerar visualização com GPT-Image-1
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
    
    console.log(`🎨 Iniciando visualização GPT-Image-1: ${productName}`);
    
    // Gerar visualização com GPT-Image-1
    const resultImageDataUrl = await generateCarVisualizationGPTImage1(
      carImageBase64, 
      productName,
      productDescription || 'produto LED automotivo LED Line BR Parts'
    );
    
    // Log para analytics
    console.log(`📊 Visualização GPT-Image-1 concluída: ${productName} - ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      resultImage: resultImageDataUrl,
      productName: productName,
      model: 'gpt-image-1',
      message: 'Visualização LED Line criada com GPT-Image-1!'
    });
    
  } catch (error) {
    console.error('❌ Erro na visualização GPT-Image-1:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar GPT-Image-1
app.get('/api/test-gpt-image', async (req, res) => {
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
    
    // Verificar se GPT-Image-1 está disponível
    const models = response.data.data.map(model => model.id);
    const hasGPTImage1 = models.some(model => model.includes('gpt-image-1'));
    
    res.json({
      success: true,
      message: 'OpenAI API funcionando',
      totalModels: models.length,
      hasGPTImage1: hasGPTImage1,
      availableImageModels: models.filter(model => 
        model.includes('dall-e') || model.includes('gpt-image')
      )
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
    console.log(`🚀 LED Line Visualizer GPT-Image-1 rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI configurada: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`🎨 Usando GPT-Image-1 para visualizações!`);
  });
}
