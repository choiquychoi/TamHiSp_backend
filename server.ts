import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import Product from "./models/Product.js";
import Admin from "./models/Admin.js";
import Contact from "./models/Contact.js";
import newsRoutes from "./routes/newsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import Order from "./models/Order.js";
import News from "./models/News.js";
import { protect } from "./middleware/authMiddleware.js";
import { generatePresignedUrl, uploadToS3 } from "./config/s3.js";
import multer from "multer";

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// 1. API PROXY UPLOAD
app.post("/api/admin/s3/upload", protect, upload.single("file"), async (req: any, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "Không tìm thấy file." });
  try {
    const result = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json(result);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.post("/api/admin/s3/upload-url", protect, async (req: Request, res: Response) => {
  const { fileName, fileType } = req.body;
  try {
    const result = await generatePresignedUrl(fileName, fileType);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 2. API DASHBOARD STATS
app.get("/api/admin/stats", protect, async (req: Request, res: Response) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalNews = await News.countDocuments();
    
    // 1. Tính tổng doanh thu (không tính đơn bị hủy)
    const allActiveOrders = await Order.find({ status: { $ne: "Cancelled" } });
    const totalRevenue = allActiveOrders.reduce((acc: number, o: any) => acc + (o.totalAmount || 0), 0);

    // 2. Thống kê doanh thu 6 tháng gần nhất
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthName = d.toLocaleString('default', { month: 'short' });
      const year = d.getFullYear();
      const month = d.getMonth();

      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

      const monthOrders = await Order.find({
        status: { $ne: "Cancelled" },
        createdAt: { $gte: startOfMonth, $lte: endOfMonth }
      });
      const revenue = monthOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
      monthlyRevenue.push({ name: monthName, revenue });
    }

    // 3. Thống kê trạng thái đơn hàng
    const statusStats = [
      { name: "Chờ duyệt", value: await Order.countDocuments({ status: "Pending" }) },
      { name: "Đã xác nhận", value: await Order.countDocuments({ status: "Confirmed" }) },
      { name: "Đang giao", value: await Order.countDocuments({ status: "Shipping" }) },
      { name: "Đã giao", value: await Order.countDocuments({ status: "Delivered" }) },
      { name: "Đã hủy", value: await Order.countDocuments({ status: "Cancelled" }) },
    ];

    // 4. Sản phẩm bán chạy (dựa trên soldCount)
    const topProducts = await Product.find().sort({ soldCount: -1 }).limit(5);
    const topSellingData = topProducts.map(p => ({
      name: p.name,
      sold: p.soldCount || 0
    }));

    res.json({
      totalRevenue,
      totalOrders,
      totalProducts,
      totalNews,
      monthlyRevenue,
      statusStats,
      topSellingData,
      recentOrders: await Order.find().sort({ createdAt: -1 }).limit(5)
    });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

// 3. API PRODUCTS (Logic Sắp xếp Sản phẩm nổi bật)
app.get("/api/products", async (req: Request, res: Response) => {
  const pageSize = Number(req.query.limit) || 8;
  const page = Number(req.query.page) || 1;
  const isAdmin = req.query.isAdmin === "true";
  let query: any = {};
  if (!isAdmin) query.isActive = true;
  if (req.query.category) query.category = req.query.category;
  if (req.query.brand) query.brand = req.query.brand;
  
  let sortOption: any = { createdAt: -1 }; // Mặc định mới nhất

  if (req.query.isFeatured === "true") {
    query.isFeatured = true;
    sortOption = { featuredAt: -1 }; 
  }

  if (req.query.keyword) {
    const kw = (req.query.keyword as string).trim();
    query.$or = [{ name: { $regex: kw, $options: "i" } }, { brand: { $regex: kw, $options: "i" } }];
  }

  try {
    const count = await Product.countDocuments(query);
    const products = await Product.find(query).sort(sortOption).limit(pageSize).skip(pageSize * (page - 1));
    
    // Lấy danh sách thương hiệu thực tế có trong danh mục này
    let brandQuery: any = { isActive: true };
    if (req.query.category) brandQuery.category = req.query.category;
    const brands = await Product.distinct("brand", brandQuery);
    
    res.json({ products, page, pages: Math.ceil(count / pageSize), total: count, brands });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.get("/api/products/:slug", async (req: Request, res: Response) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (product) res.json(product);
    else res.status(404).json({ message: "Không tìm thấy." });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

// 4. ADMIN CRUD (Cập nhật featuredAt)
app.post("/api/admin/products", protect, async (req: Request, res: Response) => {
  try {
    if (req.body.isFeatured) req.body.featuredAt = new Date();
    res.status(201).json(await new Product(req.body).save());
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.put("/api/admin/products/:id", protect, async (req: Request, res: Response) => {
  try {
    const oldProduct = await Product.findById(req.params.id);
    if (req.body.isFeatured && !oldProduct?.isFeatured) {
      req.body.featuredAt = new Date(); // Chỉ gán khi bắt đầu nổi bật
    }
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.delete("/api/admin/products/:id", protect, async (req: Request, res: Response) => {
  try { await Product.findByIdAndDelete(req.params.id); res.json({ message: "Đã xóa" }); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.use("/api/admin", newsRoutes);
app.use("/api", newsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/banners", bannerRoutes);

app.post("/api/admin/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) return res.status(401).json({ message: "Sai thông tin." });
    const secret = process.env.JWT_SECRET || "tam_hi_sports_secret_2026_secure";
    const token = jwt.sign({ id: admin._id }, secret, { expiresIn: "1d" });
    res.json({ _id: admin._id, username: admin.username, token });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.get("/api/contact", async (req: Request, res: Response) => {
  try { 
    let contact = await Contact.findOne();
    if (!contact) {
      contact = await Contact.create({ 
        companyName: "TÂM HÍ SPORTS",
        address: "Số 02 Nguyễn Thế Truyện, P. Tân Sơn Nhì, Q. Tân Phú, TP. HCM",
        phone: "090 251 39 39",
        email: "tamhisports@gmail.com",
        socialLinks: {
          facebook: "https://www.facebook.com/tamhisports",
          zalo: "0902513939"
        }
      });
    } else if (contact.companyName.includes("NGUYÊN BÍNH")) {
      contact.companyName = "TÂM HÍ SPORTS";
      contact.email = "tamhisports@gmail.com";
      contact.socialLinks.facebook = "https://www.facebook.com/tamhisports";
      await contact.save();
    }
    res.json(contact); 
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

app.put("/api/admin/contact", protect, async (req: Request, res: Response) => {
  try { res.json(await Contact.findOneAndUpdate({}, req.body, { upsert: true, returnDocument: "after" })); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
