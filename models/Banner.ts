import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  image: string;
  title: string;
  subtitle: string;
  buttonText: string;
  link: string;
  order: number;
  isActive: boolean;
}

const BannerSchema: Schema = new Schema({
  image: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String },
  buttonText: { type: String, default: 'MUA NGAY' },
  link: { type: String, default: '/' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model<IBanner>('Banner', BannerSchema);
