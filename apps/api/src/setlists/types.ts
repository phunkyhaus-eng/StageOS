import { z } from 'zod';
import { setlistOperationSchema } from '@stageos/shared';

export type SetlistOperation = z.infer<typeof setlistOperationSchema>;
