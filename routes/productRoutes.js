const express = require('express');
const PDFDocument = require('pdfkit');

const Product = require('../models/Product');

const router = express.Router();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanSizes = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((s) => ({ size: String(s.size || '').trim(), stock: Math.max(0, Number(s.stock) || 0) }))
    .filter((s) => s.size);

const totalFromSizes = (sizes) => sizes.reduce((sum, s) => sum + s.stock, 0);

router.get('/api/products', async (req, res) => {
  try {
    const { search, category, size } = req.query;
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

    if (size && size !== 'Tümü') {
      query['sizes.size'] = String(size).trim();
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
    const { name, category, barcode, stock, price, image, sizes } = req.body;
    const parsedPrice = toNumber(price);

    if (!name || !category || parsedPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı, kategori ve fiyat zorunludur'
      });
    }

    const sizeList = cleanSizes(sizes);
    const totalStock = sizeList.length > 0
      ? totalFromSizes(sizeList)
      : Math.max(0, toNumber(stock) ?? 0);

    const product = await Product.create({
      name: String(name).trim(),
      category: String(category).trim(),
      barcode: barcode ? String(barcode).trim() : undefined,
      stock: totalStock,
      sizes: sizeList,
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
    const { name, category, price, barcode, sizes } = req.body;
    const parsedPrice = toNumber(price);

    if (!name || !category || parsedPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı, kategori ve fiyat zorunludur'
      });
    }

    const updateData = {
      name: String(name).trim(),
      category: String(category).trim(),
      price: Math.max(0, parsedPrice)
    };

    if (barcode && String(barcode).trim()) {
      updateData.barcode = String(barcode).trim();
    }

    if (Array.isArray(sizes)) {
      const sizeList = cleanSizes(sizes);
      updateData.sizes = sizeList;
      updateData.stock = totalFromSizes(sizeList);
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.json({ success: true, product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Bu barkod zaten kayıtlı' });
    }
    console.error('Ürün güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün güncellenemedi' });
  }
});

router.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const parsedQuantity = toNumber(req.body.quantity);
    const sizeParam = req.body.size ? String(req.body.size).trim() : null;

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

    if (sizeParam) {
      const existing = product.sizes.find((s) => s.size === sizeParam);
      if (existing) {
        existing.stock = (Number(existing.stock) || 0) + parsedQuantity;
      } else {
        product.sizes.push({ size: sizeParam, stock: parsedQuantity });
      }
      product.stock = totalFromSizes(product.sizes);
    } else {
      product.stock = (Number(product.stock) || 0) + parsedQuantity;
    }

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

    if (product.sizes && product.sizes.length > 0) {
      doc.text(`Toplam Stok: ${product.stock}`);
      doc.text(`Bedenler:`);
      product.sizes.forEach((s) => {
        doc.text(`  ${s.size}: ${s.stock} adet`);
      });
    } else {
      doc.text(`Stok: ${product.stock}`);
    }

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
