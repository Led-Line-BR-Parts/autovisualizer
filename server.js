// server.js - Backend Node.js para o AutoVisualizer
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://autovisualizer.com', 'https://sualojaaqui.myshopify.com'], // Adicione seus domínios
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Configuração do multer para upload de imagens
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// Configuração OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Função para extrair dados de produto de URLs
async function extractProductFromUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    let productData = {};
    
    // Detecção específica por plataforma
    if (url.includes('shopify')) {
      productData = extractShopifyProduct($);
    } else if (url.includes('mercadolivre') || url.includes('mercadolibre')) {
      productData = extractMercadoLivreProduct($);
    } else {
      // Extração genérica
      productData = extractGenericProduct($);
    }
    
    return productData;
    
  } catch (error) {
    console.error('Erro ao extrair produto:', error);
    throw new Error('Não foi possível extrair dados do produto');
  }
}

function extractShopifyProduct($) {
  return {
    name: $('h1.product-single__title, .product__title, h1[data-product-title]').first().text().trim(),
    description: $('.product-single__description, .product__description, .rte').first().text().trim().substring(0, 300),
    image: $('img.product-single__photo, .product__photo img, .product-featured-image').first().attr('src'),
    price: $('.product-single__price, .price, .product__price').first().text().trim(),
    vendor: $('.product-single__vendor, .product__vendor').first().text().trim()
  };
}

function extractMercadoLivreProduct($) {
  return {
    name: $('h1.x-item-title-label, .it-ttl').first().text().trim(),
    description: $('.item-description, .item-description-text').first().text().trim().substring(0, 300),
    image: $('img.gallery-image, .gallery-image-container img').first().attr('src'),
    price: $('.price-tag-fraction, .notranslate').first().text().trim(),
    vendor: $('.seller-info__title, .profile-info-name').first().text().trim()
  };
}

function extractGenericProduct($) {
  return {
    name: $('h1, .product-title, .title').first().text().trim(),
    description: $('meta[name="description"]').attr('content') || $('.description').first().text().trim().substring(0, 300),
    image: $('meta[property="og:image"]').attr('content') || $('img').first().attr('src'),
    price: $('.price, .cost, .valor').first().text().trim(),
    vendor: $('meta[property="og:site_name"]').attr('content') || ''
  };
}

// Função para chamar a API do OpenAI
async function generateCarVisualization(carImageBuffer, productImageUrl, productName) {
  try {
    // Converter imagem do carro para base64
    const carImageBase64 = carImageBuffer.toString('base64');
    
    // Prompt otimizado para diferentes tipos de produtos
    const prompts = {
      'spoiler': `Adicione um spoiler traseiro esportivo neste carro, posicionado naturalmente na parte traseira. Mantenha a iluminação, sombras e perspectiva originais. O spoiler deve parecer profissionalmente instalado.`,
      'rodas': `Substitua as rodas deste carro pelas rodas esportivas mostradas na imagem de referência. Mantenha o tamanho proporcional e a perspectiva correta. As rodas devem parecer naturalmente instaladas.`,
      'adesivos': `Aplique os adesivos/decalques mostrados na imagem de referência nas laterais deste carro. Os adesivos devem seguir as curvas naturais da carroceria e ter aparência realística.`,
      'escapamento': `Adicione o escapamento esportivo mostrado na imagem de referência na parte traseira inferior deste carro. O escapamento deve parecer profissionalmente instalado.`,
      'default': `Adicione o produto automotivo "${productName}" neste carro de forma realística e natural, mantendo a iluminação, sombras e perspectiva originais. O produto deve parecer profissionalmente instalado.`
    };
    
    // Detectar tipo de produto
    const productType = detectProductType(productName);
    const prompt = prompts[productType] || prompts.default;
    
    const response = await axios.post('https://api.openai.com/v1/images/edits', {
      image: carImageBase64,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url"
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.data[0].url;
    
  } catch (error) {
    console.error('Erro OpenAI:', error);
    throw new Error('Erro ao processar imagem com IA');
  }
}

function detectProductType(productName) {
  const name = productName.toLowerCase();
  
  if (name.includes('spoiler') || name.includes('aerofólio')) return 'spoiler';
  if (name.includes('roda') || name.includes('aro') || name.includes('jante')) return 'rodas';
  if (name.includes('adesivo') || name.includes('decalque') || name.includes('faixa')) return 'adesivos';
  if (name.includes('escapamento') || name.includes('ponteira')) return 'escapamento';
  
  return 'default';
}

// ROTAS DA API

// Rota para extrair produto de URL
app.post('/api/extract-product', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }
    
    const productData = await extractProductFromUrl(url);
    
    res.json({
      success: true,
      product: productData
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para gerar visualização
app.post('/api/generate-visualization', upload.single('carImage'), async (req, res) => {
  try {
    const { productName, productImageUrl } = req.body;
    const carImageBuffer = req.file.buffer;
    
    if (!carImageBuffer || !productName) {
      return res.status(400).json({ 
        error: 'Imagem do carro e nome do produto são obrigatórios' 
      });
    }
    
    // Redimensionar imagem do carro se necessário
    const processedCarImage = await sharp(carImageBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    // Gerar visualização com OpenAI
    const resultImageUrl = await generateCarVisualization(
      processedCarImage, 
      productImageUrl, 
      productName
    );
    
    // Log para analytics
    console.log(`Visualização gerada: ${productName} - ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      resultImage: resultImageUrl,
      productName: productName
    });
    
  } catch (error) {
    console.error('Erro na visualização:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para servir o frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
    }
  }
  
  console.error('Erro:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 AutoVisualizer rodando na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});

// Função para atualizar o frontend com dados reais
function updateFrontendAPI() {
  // Substitua as chamadas simuladas no frontend por estas URLs reais:
  
  // Para extrair produto de URL:
  // POST /api/extract-product
  // Body: { "url": "https://loja.com/produto" }
  
  // Para gerar visualização:
  // POST /api/generate-visualization
  // FormData: { carImage: File, productName: string, productImageUrl: string }
}

module.exports = app;
