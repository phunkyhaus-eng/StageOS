import { Test } from '@nestjs/testing';
import { SyncController } from '../src/sync/sync.controller';
import { SyncService } from '../src/sync/sync.service';
import type { AuthUser } from '../src/common/types/auth-user';

describe('SyncController (integration)', () => {
  const user: AuthUser = {
    id: 'user-1',
    organisationId: 'org-1',
    email: 'owner@stageos.local',
    roles: ['OWNER'],
    permissions: ['write:events']
  };

  const syncServiceMock = {
    pull: jest.fn().mockResolvedValue({ cursor: null, changes: [], hasMore: false }),
    push: jest.fn().mockResolvedValue({ accepted: [], conflicts: [] }),
    merge: jest.fn().mockResolvedValue({ ok: true })
  };

  it('forwards sync payloads to service layer', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: SyncService, useValue: syncServiceMock }]
    }).compile();

    const controller = moduleRef.get(SyncController);

    const response = await controller.push(user, {
      deviceId: '8f5709f6-71d8-4f45-8f70-a3f2c0cf65ba',
      bandId: '7f5709f6-71d8-4f45-8f70-a3f2c0cf65bb',
      operations: []
    });

    expect(response).toEqual({ accepted: [], conflicts: [] });
    expect(syncServiceMock.push).toHaveBeenCalledTimes(1);
  });
});
