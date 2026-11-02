import { getSql } from '@/db';
import { createPlayerApi } from '@/lib/player-api';

export const dynamic = 'force-dynamic';
export const { GET, POST, DELETE } = createPlayerApi(getSql);
