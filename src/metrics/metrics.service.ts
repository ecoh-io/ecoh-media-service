import { Injectable } from '@nestjs/common';
import { Counter, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly requestCounter: Counter<string>;

  constructor() {
    const registry = new Registry();
    this.requestCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [registry],
    });
  }

  incrementRequest(method: string, route: string, status: number) {
    this.requestCounter.inc({ method, route, status: status.toString() });
  }
}
