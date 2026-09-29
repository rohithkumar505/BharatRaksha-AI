import { z } from "zod";

export const createCaseSchema = z.object({
  crimeType: z.string().min(3).max(200),
  location: z.string().max(200).optional(),
  incidentDate: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  description: z.string().max(10000).optional(),
  policeStation: z.string().max(200).optional(),
});

export const updateCaseSchema = z.object({
  crimeType: z.string().min(3).max(200).optional(),
  location: z.string().max(200).optional().nullable(),
  incidentDate: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "UNDER_INVESTIGATION", "PENDING_REVIEW", "CLOSED", "ARCHIVED"]).optional(),
  description: z.string().max(10000).optional().nullable(),
  investigatingOfficerId: z.string().cuid().optional().nullable(),
  policeStation: z.string().max(200).optional().nullable(),
});

export const createNoteSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const evidenceTypeSchema = z.enum([
  "FIR",
  "CDR",
  "BANK_TXN",
  "VEHICLE",
  "EMAIL",
  "TOWER",
  "SURVEILLANCE",
  "OTHER",
]);

export const ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(2).max(100),
  role: z.enum(["INVESTIGATOR", "SENIOR_OFFICER", "ADMIN", "AUDITOR"]),
  policeStation: z.string().max(200).optional(),
  badgeNumber: z.string().max(50).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(["INVESTIGATOR", "SENIOR_OFFICER", "ADMIN", "AUDITOR"]).optional(),
  policeStation: z.string().max(200).optional().nullable(),
  badgeNumber: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

export const mfaVerifySchema = z.object({
  token: z.string().length(6),
});
