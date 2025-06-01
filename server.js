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

// Função para limpar URL de parâmetros desnecessários
function cleanProductUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Manter apenas parâmetros essenciais para produtos
    const allowedParams = ['variant', 'color', 'size'];
    const cleanParams = new URLSearchParams();
    
    for (const [key, value] of urlObj.searchParams) {
      if (allowedParams.includes(key.toLowerCase())) {
        cleanParams.set(key, value);
      }
    }
    
    // Construir URL limpa
    const cleanUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    const paramString = cleanParams.toString();
    
    return paramString ? `${cleanUrl}?${paramString}` : cleanUrl;
  } catch (error) {
    console.log('⚠️ Erro ao limpar URL, usando original:', error.message);
    return url;
  }
}
// Função para extrair dados de produto de URLs
async function extractProductFromUrl(url) {
  try {
    // Limpar URL de parâmetros desnecessários
    const cleanUrl = cleanProductUrl(url);
    console.log(`🔍 URL original: ${url}`);
    console.log(`🧹 URL limpa: ${cleanUrl}`);
    
    console.log(`🌐 Tentando extrair produto de: ${cleanUrl}`);
    
    const response = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Referer': 'https://google.com/'
      },
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
    
    // Verificar se a resposta é HTML
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      throw new Error('URL não retorna uma página HTML válida');
    }
    
    console.log(`✅ Página carregada. Content-Type: ${contentType}`);
    console.log(`📄 Tamanho da resposta: ${response.data.length} caracteres`);
    
    const $ = cheerio.load(response.data);
    
    let productData = {};
    
    // Detecção específica por plataforma
    if (cleanUrl.includes('shopify') || cleanUrl.includes('myshopify') || cleanUrl.includes('ledlinebrparts.com')) {
      console.log('🛒 Detectada loja Shopify/LED Line');
      productData = extractShopifyProduct($, cleanUrl);
    } else if (cleanUrl.includes('mercadolivre') || cleanUrl.includes('mercadolibre')) {
      console.log('🏪 Detectado Mercado Livre');
      productData = extractMercadoLivreProduct($, cleanUrl);
    } else if (cleanUrl.includes('amazon')) {
      console.log('📦 Detectada Amazon');
      productData = extractAmazonProduct($, cleanUrl);
    } else {
      console.log('🌐 Usando extração genérica');
      productData = extractGenericProduct($, cleanUrl);
    }
    
    console.log('🎯 Dados extraídos:', {
      name: productData.name?.substring(0, 50) + '...',
      hasImage: !!productData.image,
      hasDescription: !!productData.description
    });
    
    // Validar se conseguiu extrair dados mínimos
    if (!productData.name || productData.name.length < 3) {
      throw new Error('Não foi possível extrair o nome do produto. Verifique se a URL está correta e se é uma página de produto válida.');
    }
    
    // Garantir que tenha pelo menos dados básicos
    productData.name = productData.name || 'Produto LED Line';
    productData.description = productData.description || 'Produto automotivo LED de alta qualidade da LED Line BR Parts';
    productData.vendor = productData.vendor || 'LED Line BR Parts';
    
    return productData;
    
  } catch (error) {
    console.error('❌ Erro detalhado ao extrair produto:', {
      message: error.message,
      url: url,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    // Mensagens de erro mais específicas
    if (error.code === 'ENOTFOUND') {
      throw new Error('URL não encontrada. Verifique se o endereço está correto.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Timeout ao carregar a página. Tente novamente em alguns segundos.');
    } else if (error.response?.status === 404) {
      throw new Error('Página não encontrada (404). Verifique se a URL do produto está correta.');
    } else if (error.response?.status === 403) {
      throw new Error('Acesso negado pelo site. Tente copiar a URL diretamente da página do produto.');
    } else if (error.response?.status >= 500) {
      throw new Error('Erro no servidor do site. Tente novamente em alguns minutos.');
    } else {
      throw new Error(`Erro ao carregar produto: ${error.message}`);
    }
  }
}

function extractShopifyProduct($, url) {
  // Múltiplos seletores para máxima compatibilidade
  const nameSelectors = [
    'h1.product-single__title',
    '.product__title',
    'h1[data-product-title]',
    '.product-title',
    'h1.product_title',
    '.pdp-product-name',
    '.product-meta h1',
    '.product-form__title',
    'h1',
    '.h1',
    '[class*="product"][class*="title"] h1',
    '[class*="product"][class*="name"]'
  ];
  
  const imageSelectors = [
    'img.product-single__photo',
    '.product__photo img',
    '.product-featured-image',
    '.product-gallery img',
    '.product-image-main img',
    'img[data-image-id]',
    '.product-media img',
    '.featured-image img',
    '.product-image img',
    'img[alt*="product"]',
    '.gallery img:first-child',
    '.product-photos img:first-child'
  ];
  
  const descSelectors = [
    '.product-single__description',
    '.product__description',
    '.rte',
    '.product-description',
    '.product-details',
    '.product-content',
    '.description',
    '[class*="description"]',
    '.product-meta .rte'
  ];

  let name = '';
  let image = '';
  let description = '';

  // Tentar múltiplos seletores para nome
  for (const selector of nameSelectors) {
    try {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        name = element.text().trim();
        console.log(`✅ Nome encontrado com seletor: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Tentar múltiplos seletores para imagem
  for (const selector of imageSelectors) {
    try {
      const element = $(selector).first();
      if (element.length && element.attr('src')) {
        image = element.attr('src');
        
        // Limpar e garantir URL completa
        if (image.startsWith('//')) {
          image = 'https:' + image;
        } else if (image.startsWith('/')) {
          // Extrair domínio da URL original
          const urlObj = new URL(url);
          image = `${urlObj.protocol}//${urlObj.hostname}${image}`;
        } else if (!image.startsWith('http')) {
          const urlObj = new URL(url);
          image = `${urlObj.protocol}//${urlObj.hostname}/${image}`;
        }
        
        console.log(`✅ Imagem encontrada com seletor: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Tentar múltiplos seletores para descrição
  for (const selector of descSelectors) {
    try {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        description = element.text().trim().substring(0, 300);
        console.log(`✅ Descrição encontrada com seletor: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallbacks usando meta tags
  if (!name) {
    name = $('meta[property="og:title"]').attr('content') || 
           $('title').text().trim() || 
           'Produto LED Line';
  }
  
  if (!image) {
    image = $('meta[property="og:image"]').attr('content') || '';
  }
  
  if (!description) {
    description = $('meta[name="description"]').attr('content') || 
                 $('meta[property="og:description"]').attr('content') || 
                 'Produto automotivo LED de alta qualidade';
  }

  return {
    name: name || 'Produto LED Line',
    description: description || 'Produto automotivo LED de alta qualidade',
    image: image || '',
    price: $('.product-single__price, .price, .product__price, .money, [class*="price"]').first().text().trim() || '',
    vendor: $('.product-single__vendor, .product__vendor, .brand').first().text().trim() || 'LED Line BR Parts',
    sourceUrl: url
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

function extractGenericProduct($, url) {
  console.log('🌐 Executando extração genérica...');
  
  // Seletores muito abrangentes para qualquer site
  const nameSelectors = [
    'h1',
    '.title h1',
    '.product-title',
    '.item-title', 
    '[class*="title"]:has(h1)',
    '[class*="product"][class*="name"]',
    '[class*="product"][class*="title"]',
    '.name',
    '.product-name',
    'h2:first-of-type',
    '.main-title'
  ];
  
  const imageSelectors = [
    '.product-image img',
    '.main-image img',
    '.featured-image img',
    '.hero-image img',
    '.gallery img:first-child',
    '.product-gallery img:first-child',
    'img[alt*="product"]',
    'img[alt*="item"]',
    '.image-container img',
    '.product-photo img',
    'img:not([class*="icon"]):not([class*="logo"])'
  ];
  
  const descSelectors = [
    '.description',
    '.product-description',
    '.item-description',
    '.details',
    '.content',
    '.summary',
    '[class*="description"]',
    '.product-details',
    '.info'
  ];

  let name = '';
  let image = '';
  let description = '';

  // Buscar nome
  for (const selector of nameSelectors) {
    try {
      const element = $(selector).first();
      if (element.length && element.text().trim() && element.text().trim().length > 5) {
        name = element.text().trim();
        console.log(`✅ Nome genérico encontrado: ${name.substring(0, 50)}...`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Buscar imagem
  for (const selector of imageSelectors) {
    try {
      const elements = $(selector);
      for (let i = 0; i < Math.min(elements.length, 5); i++) {
        const img = elements.eq(i);
        const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy');
        
        if (src && !src.includes('placeholder') && !src.includes('loading')) {
          image = src;
          
          // Garantir URL absoluta
          if (image.startsWith('//')) {
            image = 'https:' + image;
          } else if (image.startsWith('/')) {
            const urlObj = new URL(url);
            image = `${urlObj.protocol}//${urlObj.hostname}${image}`;
          } else if (!image.startsWith('http')) {
            const urlObj = new URL(url);
            image = `${urlObj.protocol}//${urlObj.hostname}/${image}`;
          }
          
          console.log(`✅ Imagem genérica encontrada: ${image.substring(0, 50)}...`);
          break;
        }
      }
      if (image) break;
    } catch (e) {
      continue;
    }
  }

  // Buscar descrição
  for (const selector of descSelectors) {
    try {
      const element = $(selector).first();
      if (element.length && element.text().trim() && element.text().trim().length > 20) {
        description = element.text().trim().substring(0, 300);
        console.log(`✅ Descrição genérica encontrada: ${description.substring(0, 50)}...`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallbacks com meta tags
  if (!name) {
    name = $('meta[property="og:title"]').attr('content') || 
           $('meta[name="title"]').attr('content') ||
           $('title').text().trim().split(' - ')[0] || 
           'Produto Automotivo';
  }
  
  if (!image) {
    image = $('meta[property="og:image"]').attr('content') || 
           $('meta[name="image"]').attr('content') || 
           '';
  }
  
  if (!description) {
    description = $('meta[name="description"]').attr('content') || 
                 $('meta[property="og:description"]').attr('content') || 
                 'Produto automotivo de qualidade';
  }

  console.log('📋 Extração genérica concluída:', {
    hasName: !!name,
    hasImage: !!image,
    hasDescription: !!description
  });

  return {
    name: name || 'Produto Automotivo',
    description: description || 'Produto automotivo de qualidade',
    image: image || '',
    price: $('.price, .cost, .valor, [class*="price"], .money').first().text().trim() || '',
    vendor: $('meta[property="og:site_name"]').attr('content') || 'Loja Online',
    sourceUrl: url
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

// Rota para extrair produto de URL com debug completo
app.post('/api/extract-product', async (req, res) => {
  try {
    const { url } = req.body;
    
    console.log('🔍 Iniciando extração de produto...');
    console.log('📝 URL recebida:', url);
    console.log('📝 Tipo da URL:', typeof url);
    console.log('📝 Request body completo:', req.body);
    
    if (!url) {
      console.log('❌ URL não fornecida');
      return res.status(400).json({ error: 'URL é obrigatória' });
    }
    
    // Validar URL
    try {
      const urlObj = new URL(url);
      console.log('✅ URL válida:', {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname
      });
    } catch (urlError) {
      console.log('❌ URL inválida:', urlError.message);
      return res.status(400).json({ error: 'URL inválida: ' + urlError.message });
    }
    
    console.log('🌐 Iniciando requisição HTTP...');
    
    // Fazer requisição com headers completos
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      },
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
    
    console.log('✅ Resposta HTTP recebida:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      dataType: typeof response.data,
      dataLength: response.data ? response.data.length : 0,
      firstChars: response.data ? response.data.substring(0, 100) : 'N/A'
    });
    
    // Verificar se é HTML
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      console.log('❌ Content-Type não é HTML:', contentType);
      return res.status(400).json({ 
        error: `URL não retorna uma página HTML. Content-Type: ${contentType}` 
      });
    }
    
    // Verificar se os dados são string
    if (typeof response.data !== 'string') {
      console.log('❌ Dados não são string:', typeof response.data);
      return res.status(400).json({ 
        error: 'Resposta não é texto HTML válido' 
      });
    }
    
    console.log('🔍 Carregando HTML com Cheerio...');
    const $ = cheerio.load(response.data);
    console.log('✅ HTML carregado com sucesso');
    
    let productData = {};
    
    // Detecção de plataforma
    if (url.includes('shopify') || url.includes('myshopify')) {
      console.log('🛒 Detectada loja Shopify');
      productData = extractShopifyProduct($, url);
    } else if (url.includes('mercadolivre') || url.includes('mercadolibre')) {
      console.log('🏪 Detectado Mercado Livre');
      productData = extractMercadoLivreProduct($, url);
    } else if (url.includes('amazon')) {
      console.log('📦 Detectada Amazon');
      productData = extractAmazonProduct($, url);
    } else {
      console.log('🌐 Usando extração genérica');
      productData = extractGenericProduct($, url);
    }
    
    console.log('🎯 Dados extraídos:', {
      name: productData.name,
      hasImage: !!productData.image,
      hasDescription: !!productData.description,
      imageUrl: productData.image?.substring(0, 100) + '...'
    });
    
    // Validação final
    if (!productData.name || productData.name.length < 3) {
      console.log('❌ Nome do produto inválido:', productData.name);
      return res.status(400).json({ 
        error: 'Não foi possível extrair o nome do produto. Verifique se a URL é de uma página de produto válida.' 
      });
    }
    
    console.log('✅ Extração bem-sucedida');
    
    res.json({
      success: true,
      product: productData,
      debug: {
        url: url,
        platform: url.includes('shopify') ? 'shopify' : 
                 url.includes('mercadolivre') ? 'mercadolivre' : 
                 url.includes('amazon') ? 'amazon' : 'generic',
        extractedFields: {
          name: !!productData.name,
          image: !!productData.image,
          description: !!productData.description
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro completo na extração:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: typeof error.response.data === 'string' ? 
              error.response.data.substring(0, 200) + '...' : 
              typeof error.response.data
      } : 'Sem response'
    });
    
    // Mensagens de erro específicas
    let userMessage = '';
    
    if (error.code === 'ENOTFOUND') {
      userMessage = 'URL não encontrada. Verifique se o endereço está correto.';
    } else if (error.code === 'ETIMEDOUT') {
      userMessage = 'Timeout ao carregar a página. Tente novamente em alguns segundos.';
    } else if (error.response?.status === 404) {
      userMessage = 'Página não encontrada (404). Verifique se a URL do produto está correta.';
    } else if (error.response?.status === 403) {
      userMessage = 'Acesso negado pelo site. Tente copiar a URL diretamente da página do produto.';
    } else if (error.response?.status >= 500) {
      userMessage = 'Erro no servidor do site. Tente novamente em alguns minutos.';
    } else if (error.message.includes('JSON')) {
      userMessage = 'Erro interno de processamento. Verifique se a URL é de uma página de produto válida.';
    } else {
      userMessage = `Erro ao processar: ${error.message}`;
    }
    
    res.status(500).json({
      success: false,
      error: userMessage,
      debug: process.env.NODE_ENV === 'development' ? {
        originalError: error.message,
        errorCode: error.code,
        statusCode: error.response?.status
      } : undefined
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

// Rota para testar extração (debug)
app.get('/api/test-extraction', async (req, res) => {
  try {
    const testUrl = req.query.url || 'https://httpbin.org/html';
    
    console.log('🧪 Testando extração com URL:', testUrl);
    
    const response = await axios.get(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    res.json({
      success: true,
      debug: {
        url: testUrl,
        status: response.status,
        contentType: response.headers['content-type'],
        dataType: typeof response.data,
        dataLength: response.data ? response.data.length : 0,
        firstChars: response.data ? response.data.substring(0, 200) : 'N/A',
        isString: typeof response.data === 'string',
        cheerioTest: typeof response.data === 'string' ? 'OK' : 'FAIL'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      debug: {
        errorType: error.name,
        errorCode: error.code,
        hasResponse: !!error.response
      }
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
