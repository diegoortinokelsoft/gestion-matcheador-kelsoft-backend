import { Injectable, Logger } from '@nestjs/common';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly appsScriptClient: AppsScriptClientService) {}

  async record(
    eventType: string,
    actorUserId: number,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const payload = {
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.appsScriptClient.call('set_new_log', {
        user_id: actorUserId,
        log_data: payload,
      }, {
        legacyArgs: [actorUserId, payload],
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Failed to persist audit in upstream; fallback to structured log',
          event_type: eventType,
          actor_user_id: actorUserId,
          entity_type: entityType,
          entity_id: entityId,
          metadata,
        }),
      );
    }
  }
}
