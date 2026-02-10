/**
 * 구조화 JSON 로거
 * CloudWatch Logs Insights 쿼리 최적화
 * PII/토큰은 절대 포함하지 않음
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlation_id?: string;
  [key: string]: unknown;
}

// AsyncLocalStorage로 요청 컨텍스트 관리
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  correlation_id: string;
  tenant_id?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function emit(level: LogLevel, message: string, extra: Record<string, unknown> = {}) {
  const ctx = requestContext.getStore();
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(ctx?.correlation_id && { correlation_id: ctx.correlation_id }),
    ...(ctx?.tenant_id && { tenant_id: ctx.tenant_id }),
    ...extra,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case 'ERROR':
      process.stderr.write(line + '\n');
      break;
    case 'WARN':
      process.stderr.write(line + '\n');
      break;
    default:
      process.stdout.write(line + '\n');
  }
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => emit('INFO', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('WARN', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('ERROR', msg, extra),
  debug: (msg: string, extra?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'DEBUG') emit('DEBUG', msg, extra);
  },

  /**
   * 커스텀 메트릭 로그 (CloudWatch Metric Filter 대상)
   * 패턴: { "_metric": "anchor_worker_success", "value": 1 }
   */
  metric: (name: string, value: number = 1, dimensions?: Record<string, string>) =>
    emit('INFO', `METRIC ${name}`, { _metric: name, value, ...dimensions }),
};

export default logger;
