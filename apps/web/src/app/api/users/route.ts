import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { createUserSchema } from "@/lib/validators";
import { validatePassword } from "@/lib/password-policy";

export async function GET() {
  const { error } = await requireAuth("users:manage");
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      policeStation: true,
      badgeNumber: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth("users:manage");
  if (error) return error;

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordCheck = validatePassword(parsed.data.password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.errors }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      name: parsed.data.name,
      role: parsed.data.role,
      policeStation: parsed.data.policeStation,
      badgeNumber: parsed.data.badgeNumber,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      policeStation: true,
      badgeNumber: true,
      isActive: true,
    },
  });

  await logAudit({
    userId: session!.user.id,
    action: "CREATE",
    resource: "user",
    resourceId: user.id,
    details: { email: user.email, role: user.role },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(user, { status: 201 });
}
