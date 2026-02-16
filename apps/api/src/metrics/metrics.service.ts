import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.httpRequestsTotal = new Counter({
      name: 'stageos_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry]
    });

    this.httpRequestDuration = new Histogram({
      name: 'stageos_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
      registers: [this.registry]
    });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  async snapshot() {
    return this.registry.getMetricsAsJSON();
  }
}
