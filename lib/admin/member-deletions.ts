export const ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH = 500;

export type AdminMemberDeletionStatus = 'requested' | 'completed' | 'failed';
export type AdminMemberDeletionFailureStage = 'storage' | 'database' | 'auth';

export type AdminMemberDeletionRequestResult = {
  requestId: string;
  targetUserId: string;
  status: AdminMemberDeletionStatus;
  isDuplicate: boolean;
  createdAt: string;
};
export type AdminMemberDeletionResultUpdate = {
  requestId: string;
  status: 'completed' | 'failed';
  failureStage: AdminMemberDeletionFailureStage | null;
  isDuplicate: boolean;
  updatedAt: string;
};

export type AdminMemberDeletionActionState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
  requestId?: string;
  resetRequestId?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isAdminMemberDeletionUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isDeletionStatus = (value: unknown): value is AdminMemberDeletionStatus => (
  value === 'requested' || value === 'completed' || value === 'failed'
);

const isFailureStage = (value: unknown): value is AdminMemberDeletionFailureStage => (
  value === 'storage' || value === 'database' || value === 'auth'
);

export const parseAdminMemberDeletionRequestResult = (
  value: unknown,
): AdminMemberDeletionRequestResult | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (
    !isAdminMemberDeletionUuid(row.request_id)
    || !isAdminMemberDeletionUuid(row.target_user_id)
    || !isDeletionStatus(row.status)
    || typeof row.is_duplicate !== 'boolean'
    || typeof row.created_at !== 'string'
    || !Number.isFinite(Date.parse(row.created_at))
  ) return null;

  return {
    requestId: row.request_id,
    targetUserId: row.target_user_id,
    status: row.status,
    isDuplicate: row.is_duplicate,
    createdAt: row.created_at,
  };
};

export const parseAdminMemberDeletionResultUpdate = (
  value: unknown,
): AdminMemberDeletionResultUpdate | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (
    !isAdminMemberDeletionUuid(row.request_id)
    || (row.status !== 'completed' && row.status !== 'failed')
    || !(row.failure_stage === null || isFailureStage(row.failure_stage))
    || typeof row.is_duplicate !== 'boolean'
    || typeof row.updated_at !== 'string'
    || !Number.isFinite(Date.parse(row.updated_at))
  ) return null;

  return {
    requestId: row.request_id,
    status: row.status,
    failureStage: row.failure_stage,
    isDuplicate: row.is_duplicate,
    updatedAt: row.updated_at,
  };
};
