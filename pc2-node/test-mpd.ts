import { buildMPDTracks, generateMPD } from './src/services/media/mpdGenerator.js';

const mockTracks = [
  {
    type: 'video' as const,
    trackId: 1,
    codec: 'av01.0.01M.08',
    bandwidth: 320187,
    timescale: 24000,
    width: 1920,
    height: 1080
  },
  {
    type: 'audio' as const,
    trackId: 2,
    codec: 'mp4a.40.2',
    bandwidth: 4054,
    timescale: 48000,
    audioChannels: 2,
    audioSampleRate: 48000
  }
];

const mockSegments = [
  { trackId: 1, duration: 96096, data: Buffer.alloc(0) },
  { trackId: 1, duration: 96096, data: Buffer.alloc(0) },
  { trackId: 1, duration: 96096, data: Buffer.alloc(0) },
  { trackId: 1, duration: 84084, data: Buffer.alloc(0) },
  { trackId: 2, duration: 192512, data: Buffer.alloc(0) },
  { trackId: 2, duration: 191488, data: Buffer.alloc(0) },
  { trackId: 2, duration: 192512, data: Buffer.alloc(0) },
  { trackId: 2, duration: 167936, data: Buffer.alloc(0) },
  { trackId: 2, duration: 2048, data: Buffer.alloc(0) }
];

const mpdTracks = buildMPDTracks(mockTracks, mockSegments);
const mpdXml = generateMPD(mpdTracks, 15.515);

console.log(mpdXml);
