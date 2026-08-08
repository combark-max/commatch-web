export type AdminServiceStatistics = {
  totalMatchCount: number;
  activeMatchCount: number;
  endedMatchCount: number;
  totalMessageCount: number;
  newMemberLast7DaysCount: number;
  reportLast7DaysCount: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const parseCount = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    return null;
  }

  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
};

export const parseAdminServiceStatistics = (
  value: unknown,
): AdminServiceStatistics => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('Invalid administrator service statistics response');
  }

  const row = value[0];
  const counts = [
    row.total_match_count,
    row.active_match_count,
    row.ended_match_count,
    row.total_message_count,
    row.new_member_last_7_days_count,
    row.report_last_7_days_count,
  ].map(parseCount);

  if (counts.some((count) => count === null)) {
    throw new Error('Invalid administrator service statistics response');
  }

  return {
    totalMatchCount: counts[0]!,
    activeMatchCount: counts[1]!,
    endedMatchCount: counts[2]!,
    totalMessageCount: counts[3]!,
    newMemberLast7DaysCount: counts[4]!,
    reportLast7DaysCount: counts[5]!,
  };
};
