import express, { Request, Response } from 'express';
import Banner from '../models/Banner.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get all active banners (Public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
    res.json(banners);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all banners (Admin)
router.get('/admin', protect, async (req: Request, res: Response) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json(banners);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a banner (Admin)
router.post('/', protect, async (req: Request, res: Response) => {
  try {
    const banner = new Banner(req.body);
    const createdBanner = await banner.save();
    res.status(201).json(createdBanner);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update a banner (Admin)
router.put('/:id', protect, async (req: Request, res: Response) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (banner) {
      Object.assign(banner, req.body);
      const updatedBanner = await banner.save();
      res.json(updatedBanner);
    } else {
      res.status(404).json({ message: 'Không tìm thấy banner' });
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete a banner (Admin)
router.delete('/:id', protect, async (req: Request, res: Response) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (banner) {
      await banner.deleteOne();
      res.json({ message: 'Đã xóa banner' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy banner' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
