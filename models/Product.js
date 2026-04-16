const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Ürün adı zorunludur'],
      trim: true,
      maxlength: [100, 'Ürün adı 100 karakteri geçemez']
    },
    category: {
      type: String,
      required: [true, 'Kategori zorunludur'],
      trim: true,
      default: 'Diğer'
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stok negatif olamaz']
    },
    price: {
      type: Number,
      required: [true, 'Fiyat zorunludur'],
      min: [0, 'Fiyat negatif olamaz']
    },
    image: {
      type: String,
      default: '/images/default-product.png'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
