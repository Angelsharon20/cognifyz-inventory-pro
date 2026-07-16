const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    product_name: {
      type: String,
      required: [true, 'Product name is required.'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters long.'],
      maxlength: [120, 'Product name cannot exceed 120 characters.'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required.'],
      min: [0, 'Price cannot be negative.'],
      // Prices are stored canonically in USD; the frontend converts to
      // EUR / INR on the fly using live rates from /api/currency/rates.
    },
    category: {
      type: String,
      required: [true, 'Category is required.'],
      trim: true,
      enum: {
        values: [
          'Electronics',
          'Clothing',
          'Groceries',
          'Home & Kitchen',
          'Books',
          'Toys',
          'Health & Beauty',
          'Sports & Outdoors',
          'Other',
        ],
        message: '{VALUE} is not a supported category.',
      },
    },
    stock_quantity: {
      type: Number,
      required: [true, 'Stock quantity is required.'],
      min: [0, 'Stock quantity cannot be negative.'],
      validate: {
        validator: Number.isInteger,
        message: 'Stock quantity must be a whole number.',
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual field: total inventory value for this line item (price * stock)
ProductSchema.virtual('total_value').get(function getTotalValue() {
  return Number((this.price * this.stock_quantity).toFixed(2));
});

ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', ProductSchema);
