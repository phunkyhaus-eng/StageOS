export const webConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  appName: 'StageOS',
  defaultBandId: process.env.NEXT_PUBLIC_DEFAULT_BAND_ID ?? ''
} as const;
