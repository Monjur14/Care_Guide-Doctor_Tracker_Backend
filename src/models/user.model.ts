import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { USER_ROLES } from '@doctor-tracker/shared';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'admin', required: true },
    /** Bumped on logout / password change: invalidates every issued JWT. */
    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export type UserHydrated = HydratedDocument<UserDoc>;
export const User = model('User', userSchema);
