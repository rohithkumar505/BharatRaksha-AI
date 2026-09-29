import { logAudit, getClientIp, getUserAgent } from "./audit";

export async function auditAccess(
  request: Request,
  params: {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  }
) {
  await logAudit({
    userId: params.userId,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    details: params.details,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });
}
