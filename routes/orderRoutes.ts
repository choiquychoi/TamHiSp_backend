import express, { Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. API ĐẶT HÀNG (CÔNG KHAI)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customer, items, totalAmount, paymentMethod } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Giỏ hàng trống' });
    }

    // Kiểm tra và trừ tồn kho trước khi tạo đơn hàng
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Sản phẩm ${item.name} không tồn tại` });
      }

      // Giảm số lượng bán được
      product.soldCount += item.quantity;
      // Không tự động trừ kho theo yêu cầu của user
      await product.save();
    }

    // Tạo mã đơn hàng ngẫu nhiên: ORD + Timestamp + 4 số ngẫu nhiên
    const orderNumber = `ORD${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder = new Order({
      orderNumber,
      customer,
      items,
      totalAmount,
      paymentMethod
    });

    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 2. API LẤY DANH SÁCH ĐƠN HÀNG (CHỈ ADMIN)
router.get('/admin/all', protect, async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    const query: any = {};
    if (status && status !== 'All') {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      orders,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 3. API CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (CHỈ ADMIN)
router.patch('/:id/status', protect, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 4. API XÓA ĐƠN HÀNG (CHỈ ADMIN)
router.delete('/:id', protect, async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Đơn hàng đã được xóa thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 5. API TRA CỨU ĐƠN HÀNG (CÔNG KHAI)
router.get('/track/:orderNumber', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) {
      return res.status(400).json({ message: 'Vui lòng cung cấp số điện thoại để tra cứu' });
    }

    const order = await Order.findOne({ 
      orderNumber: req.params.orderNumber,
      'customer.phone': phone 
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng với thông tin cung cấp' });
    }

    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
