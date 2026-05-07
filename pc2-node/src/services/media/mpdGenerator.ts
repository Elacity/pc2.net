/**
 * MPD Generator — creates DASH MPD XML from track metadata and segment info.
 *
 * Generates output compatible with our mpdParser.ts (SegmentTemplate + SegmentTimeline).
 * Matches the Bento4 mp4dash output format so existing playback code works unchanged.
 */

import { type TrackInfo, type SegmentInfo } from './mp4split.js';

export interface MPDSegment {
  duration: number;
}

export interface MPDTrack {
  info: TrackInfo;
  segments: MPDSegment[];
  repId: string;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (mins > 0) result += `${mins}M`;
  result += `${secs.toFixed(3)}S`;
  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSegmentTimeline(segments: MPDSegment[]): string {
  if (segments.length === 0) return '';

  const lines: string[] = [];
  lines.push('            <SegmentTimeline>');

  let i = 0;
  while (i < segments.length) {
    // segment.duration is already an integer in timescale units (sum of trun
    // sample-durations), so no rounding is needed. The previous Math.round
    // here was a no-op for typical inputs but disguised this fact.
    const d = segments[i].duration;
    let r = 0;
    while (i + r + 1 < segments.length && segments[i + r + 1].duration === d) {
      r++;
    }

    if (i === 0) {
      if (r > 0) {
        lines.push(`              <S t="0" d="${d}" r="${r}"/>`);
      } else {
        lines.push(`              <S t="0" d="${d}"/>`);
      }
    } else {
      if (r > 0) {
        lines.push(`              <S d="${d}" r="${r}"/>`);
      } else {
        lines.push(`              <S d="${d}"/>`);
      }
    }

    i += r + 1;
  }

  lines.push('            </SegmentTimeline>');
  return lines.join('\n');
}

/**
 * Compute the longest track's effective duration directly from its
 * SegmentTimeline. Using the SegmentTimeline sum (rather than the
 * tkhd/mdhd-derived `totalDuration` we receive from the splitter) guarantees
 * `mediaPresentationDuration` exactly equals what the player can actually
 * fetch, which prevents dash.js / shaka from progressively extending the
 * timeline as new segments arrive (the "growing timeline" UX bug reported
 * by community testers in v1.2.7.6).
 */
function computeEffectiveDuration(tracks: MPDTrack[], fallbackSeconds: number): number {
  let bestSeconds = 0;
  for (const track of tracks) {
    if (!track.segments.length || !track.info.timescale) continue;
    const sumUnits = track.segments.reduce((acc, s) => acc + s.duration, 0);
    const seconds = sumUnits / track.info.timescale;
    if (seconds > bestSeconds) bestSeconds = seconds;
  }
  // If we somehow got no segments, fall back to the splitter's value so we
  // never emit `PT0S` for an otherwise-valid stream.
  return bestSeconds > 0 ? bestSeconds : fallbackSeconds;
}

export function generateMPD(tracks: MPDTrack[], totalDuration: number): string {
  const lines: string[] = [];

  // Use SegmentTimeline-derived duration so MPD@duration always matches the
  // sum of <S d=...> entries. dash.js trusts the asserted total when the
  // numbers agree; if they drift even slightly (e.g. a partial trailing
  // segment, editlist offset in tkhd, or per-segment rounding from the
  // splitter), the player falls back to "what's loaded" and the visible
  // timeline grows as segments arrive — see the community report in v1.2.7.6.
  const effectiveDuration = computeEffectiveDuration(tracks, totalDuration);

  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push(`<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:mpeg:dash:schema:mpd:2011" xsi:schemaLocation="urn:mpeg:dash:schema:mpd:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd" type="static" mediaPresentationDuration="${formatDuration(effectiveDuration)}" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">`);
  lines.push('  <Period>');

  for (const track of tracks) {
    const { info } = track;
    const mimeType = info.type === 'video' ? 'video/mp4' : 'audio/mp4';
    const contentType = info.type;

    let asAttrs = `mimeType="${escapeXml(mimeType)}" contentType="${contentType}"`;
    if (info.type === 'video' && info.width && info.height) {
      asAttrs += ` maxWidth="${info.width}" maxHeight="${info.height}"`;
    }
    if (info.audioSampleRate) {
      asAttrs += ` audioSamplingRate="${info.audioSampleRate}"`;
    }

    lines.push(`    <AdaptationSet ${asAttrs}>`);

    const segTimeline = buildSegmentTimeline(track.segments);
    lines.push(`      <SegmentTemplate timescale="${info.timescale}" initialization="$RepresentationID$/init.mp4" media="$RepresentationID$/seg-$Number$.m4s" startNumber="1">`);
    lines.push(segTimeline);
    lines.push('      </SegmentTemplate>');

    let repAttrs = `id="${escapeXml(track.repId)}" codecs="${escapeXml(info.codec)}" bandwidth="${info.bandwidth}"`;
    if (info.type === 'video' && info.width && info.height) {
      repAttrs += ` width="${info.width}" height="${info.height}"`;
    }
    if (info.audioChannels) {
      repAttrs += ` audioSamplingRate="${info.audioSampleRate}"`;
    }

    lines.push(`      <Representation ${repAttrs} />`);
    lines.push('    </AdaptationSet>');
  }

  lines.push('  </Period>');
  lines.push('</MPD>');

  return lines.join('\n');
}

export function buildMPDTracks(
  trackInfos: TrackInfo[],
  segmentInfos: SegmentInfo[],
): MPDTrack[] {
  return trackInfos.map(info => {
    const trackSegs = segmentInfos.filter(s => s.trackId === info.trackId);
    const repId = info.type === 'video' ? `video/${info.codec.split('.')[0]}` : `audio/und/${info.codec}`;

    return {
      info,
      segments: trackSegs.map(s => ({ duration: s.duration })),
      repId,
    };
  });
}
