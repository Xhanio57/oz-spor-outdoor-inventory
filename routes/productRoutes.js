const express = require('express');
const PDFDocument = require('pdfkit');

const Product = require('../models/Product');

const router = express.Router();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/api/products', async (req, res) => {
  try {
    const { search, category } = req.query;
    const query = {};

    if (search && String(search).trim()) {
      const term = escapeRegex(String(search).trim());
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { barcode: { $regex: term, $options: 'i' } }
      ];
    }

    if (category && category !== 'Tümü') {
      query.category = category;
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    console.error('Ürün listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi' });
  }
});

router.post('/api/products', async (req, res) => {
  try {
    const { name, category, barcode, stock, price, image } = req.body;
    const parsedPrice = toNumber(price);
    const parsedStock = toNumber(stock);

    if (!name || !category || parsedPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı, kategori ve fiyat zorunludur'
      });
    }

    const product = await Product.create({
      name: String(name).trim(),
      category: String(category).trim(),
      barcode: barcode ? String(barcode).trim() : undefined,
      stock: parsedStock === null ? 0 : Math.max(0, parsedStock),
      price: Math.max(0, parsedPrice),
      image
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Bu barkod zaten kayıtlı' });
    }
    console.error('Ürün ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün eklenemedi' });
  }
});

router.put('/api/products/:id', async (req, res) => {
  try {
    const { name, category, price } = req.body;
    const parsedPrice = toNumber(price);

    if (!name || !category || parsedPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı, kategori ve fiyat zorunludur'
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name: String(name).trim(),
        category: String(category).trim(),
        price: Math.max(0, parsedPrice)
      },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.json({ success: true, product });
  } catch (error) {
    console.error('Ürün güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün güncellenemedi' });
  }
});

router.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const parsedQuantity = toNumber(req.body.quantity);

    if (parsedQuantity === null) {
      return res.status(400).json({ success: false, message: 'Geçerli bir stok miktarı girin' });
    }
    if (parsedQuantity <= 0) {
      return res.status(400).json({ success: false, message: 'Stok miktarı pozitif olmalıdır' });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    const currentStock = Number(product.stock) || 0;
    product.stock = currentStock + parsedQuantity;
    await product.save();

    res.json({ success: true, product });
  } catch (error) {
    console.error('Stok güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Stok güncellenemedi' });
  }
});

router.get('/api/products/:id/label-pdf', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    const safeId = encodeURIComponent(String(product._id || 'urun'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="etiket-${safeId}.pdf"`);

    const doc = new PDFDocument({ size: 'A6', margin: 24 });
    doc.pipe(res);

    doc.fontSize(16).text('Ürün Etiketi', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Ürün: ${product.name}`);
    doc.text(`Kategori: ${product.category}`);
    doc.text(`Barkod: ${product.barcode || '-'}`);
    doc.text(`Fiyat: ${Number(product.price).toFixed(2)} ₺`);
    doc.text(`Stok: ${product.stock}`);

    doc.end();
  } catch (error) {
    console.error('Etiket PDF hatası:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Etiket oluşturulamadı' });
    }
    res.end();
  }
});

router.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.json({ success: true, message: 'Ürün silindi' });
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün silinemedi' });
  }
});

module.exports = router;
