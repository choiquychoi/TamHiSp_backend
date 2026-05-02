import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface DecodedToken {
  id: string;
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      const secret = process.env.JWT_SECRET || 'tam_hi_sports_secret_2026_secure';
      const decoded = jwt.verify(token, secret) as DecodedToken;
      
      (req as any).adminId = decoded.id;
      
      return next(); // Quan trọng: Phải return ở đây để dừng middleware
    } catch (error) {
      return res.status(401).json({ message: 'Không có quyền truy cập, token không hợp lệ.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Không có quyền truy cập, thiếu token.' });
  }
};
