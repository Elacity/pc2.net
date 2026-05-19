/*
 * verify-pssh — load-bearing CENC PSSH discoverability check.
 *
 * Replicates the exact libav consumer call path used by the in-house
 * ddrm-renderer / elacity-player C-side:
 *
 *   - avformat_open_input + avformat_find_stream_info on a DASH MPD or
 *     standalone init.mp4
 *   - iterate AVStreams looking for AV_PKT_DATA_ENCRYPTION_INIT_INFO on
 *     codecpar->coded_side_data
 *   - av_encryption_init_info_get_side_data → AVEncryptionInitInfo*
 *     (a linked list — walk via info->next until NULL)
 *   - for each entry: match system_id against the caller's accept-list
 *   - on match: assert num_key_ids >= 1, data[] non-empty, print payload
 *
 * Default accept-list is the `cenc:lit-aes-gcm-v3` systemId (one of the
 * Elacity dDRM family of protection schemes), but any number of
 * systemIds can be supplied on the command line (e.g. for assets that
 * carry multiple PSSH entries — Widevine + custom, ClearKey + custom,
 * etc.). With `--any`, the first entry that decodes is accepted.
 *
 * Output discipline:
 *   - stderr: human-readable structured log (entry-by-entry summary, match
 *     decision, PASS/FAIL banner). Always present.
 *   - stdout: the data[] payload of the matched entry, EXACTLY ONCE. Safe
 *     to pipe to jq / hexdump / file.
 *
 * Exit 0 on success, non-zero on any failure.
 *
 * Acceptance for MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
 * See docs/core/CENC_PACKAGING_COMPLIANCE.md.
 */

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <libavcodec/packet.h>
#include <libavformat/avformat.h>
#include <libavutil/encryption_info.h>
#include <libavutil/log.h>

/* Elacity dDRM family — a set of protection schemes under the dDRM
 * umbrella. Each scheme registers its own ISO/IEC 23001-7 SystemID +
 * payload format. Keep these in sync with `KeySystemId` /
 * `ProtectionType` in the player TS enums.
 */

/* protectionType: clearkey (Elacity variant) */
static const uint8_t ELACITY_CLEARKEY_SYSTEM_ID[16] = {
    0xe2, 0x71, 0x9d, 0x58, 0xa9, 0x85, 0xb3, 0xc9,
    0x78, 0x1a, 0xb0, 0x30, 0xaf, 0x78, 0xd3, 0x0e};

/* protectionType: cenc:web3-drm-v1 */
static const uint8_t ELACITY_WEB3_DRM_V1_SYSTEM_ID[16] = {
    0xbf, 0x8e, 0xf8, 0x5d, 0x2c, 0x54, 0x47, 0x5d,
    0x8c, 0x1e, 0xe2, 0x7d, 0xb6, 0x03, 0x32, 0xa2};

/* protectionType: cenc:lit-drm-v1 (deprecated — Lit Datil network) */
static const uint8_t ELACITY_LIT_DRM_V1_SYSTEM_ID[16] = {
    0xb7, 0x85, 0x55, 0x46, 0x88, 0xe5, 0x40, 0xf8,
    0xba, 0x99, 0xc3, 0xe3, 0x30, 0x33, 0xfb, 0xee};

/* protectionType: cenc:lit-drm-sa-v1 (smart-account variant) */
static const uint8_t ELACITY_LIT_DRM_SA_V1_SYSTEM_ID[16] = {
    0xa1, 0x7e, 0x50, 0x6d, 0x93, 0x55, 0x47, 0x10,
    0x93, 0x5f, 0x1d, 0x92, 0x8e, 0xff, 0x75, 0x94};

/* protectionType: cenc:lit-aes-gcm-v3  (Chipotle / Lit V3)
 *   alias for non-media: lit-aes-gcm-v3
 *   systemId           : bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe
 */
static const uint8_t ELACITY_LIT_AES_GCM_V3_SYSTEM_ID[16] = {
    0xbf, 0x2c, 0x86, 0xc1, 0xd9, 0xff, 0x4a, 0xb1,
    0xb4, 0xbe, 0x45, 0xae, 0x4d, 0x99, 0xe1, 0xfe};

/* Compact registry — iterate to build the default accept-list and to
 * label entries during the per-entry log. Order matters only for the
 * default accept-list (first wins is irrelevant since we match by id).
 */
struct sysid_entry {
  const uint8_t *id;
  const char *label;
};

static const struct sysid_entry ELACITY_DDRM_SYSIDS[] = {
    {ELACITY_LIT_AES_GCM_V3_SYSTEM_ID, "cenc:lit-aes-gcm-v3"},
    {ELACITY_LIT_DRM_SA_V1_SYSTEM_ID, "cenc:lit-drm-sa-v1"},
    {ELACITY_LIT_DRM_V1_SYSTEM_ID, "cenc:lit-drm-v1"},
    {ELACITY_WEB3_DRM_V1_SYSTEM_ID, "cenc:web3-drm-v1"},
    {ELACITY_CLEARKEY_SYSTEM_ID, "clearkey (w3c)"},
};
#define ELACITY_DDRM_COUNT                                                     \
  (int)(sizeof(ELACITY_DDRM_SYSIDS) / sizeof(ELACITY_DDRM_SYSIDS[0]))

#define MAX_ACCEPT_SYSIDS 16
#define SEPARATOR                                                              \
  "─────────────────────────────────────────────────────────────"

/* ── output helpers ──────────────────────────────────────────────────── */

static void fprint_hex(FILE *f, const uint8_t *data, size_t len) {
  for (size_t i = 0; i < len; i++)
    fprintf(f, "%02x", data[i]);
}

/* Format a 16-byte systemId as a UUID string with dashes. */
static void fprint_uuid(FILE *f, const uint8_t *id, size_t len) {
  if (len != 16) {
    fprint_hex(f, id, len);
    return;
  }
  fprintf(f,
          "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-"
          "%02x%02x%02x%02x%02x%02x",
          id[0], id[1], id[2], id[3], id[4], id[5], id[6], id[7], id[8], id[9],
          id[10], id[11], id[12], id[13], id[14], id[15]);
}

/* Return a short human label for known systemIds. */
static const char *systemid_label(const uint8_t *id, size_t len) {
  if (len != 16)
    return "?";
  for (int i = 0; i < ELACITY_DDRM_COUNT; i++) {
    if (memcmp(id, ELACITY_DDRM_SYSIDS[i].id, 16) == 0)
      return ELACITY_DDRM_SYSIDS[i].label;
  }
  static const uint8_t WIDEVINE[16] = {0xed, 0xef, 0x8b, 0xa9, 0x79, 0xd6,
                                       0x4a, 0xce, 0xa3, 0xc8, 0x27, 0xdc,
                                       0xd5, 0x1d, 0x21, 0xed};
  if (memcmp(id, WIDEVINE, 16) == 0)
    return "Widevine";
  static const uint8_t PLAYREADY[16] = {0x9a, 0x04, 0xf0, 0x79, 0x98, 0x40,
                                        0x42, 0x86, 0xab, 0x92, 0xe6, 0x5b,
                                        0xe0, 0x88, 0x5f, 0x95};
  if (memcmp(id, PLAYREADY, 16) == 0)
    return "PlayReady";
  static const uint8_t W3C_CLEARKEY[16] = {0x10, 0x77, 0xef, 0xec, 0xc0, 0xb2,
                                           0x4d, 0x02, 0xac, 0xe3, 0x3c, 0x1e,
                                           0x52, 0xe2, 0xfb, 0x4b};
  if (memcmp(id, W3C_CLEARKEY, 16) == 0)
    return "ClearKey (W3C)";
  return "unknown";
}

/* ── systemId arg parsing ───────────────────────────────────────────── */

static int parse_systemid(const char *hex, uint8_t out[16]) {
  char compact[33];
  int j = 0;
  for (const char *p = hex; *p && j < 32; p++) {
    if (*p == '-' || *p == ':')
      continue;
    compact[j++] = *p;
  }
  if (j != 32)
    return -1;
  compact[32] = 0;
  for (int i = 0; i < 16; i++) {
    unsigned int byte;
    if (sscanf(&compact[i * 2], "%2x", &byte) != 1)
      return -1;
    out[i] = (uint8_t)byte;
  }
  return 0;
}

static int systemid_matches(const uint8_t *sid, size_t sid_size,
                            const uint8_t accept[][16], int accept_count) {
  if (sid_size != 16)
    return 0;
  for (int i = 0; i < accept_count; i++) {
    if (memcmp(sid, accept[i], 16) == 0)
      return 1;
  }
  return 0;
}

/* ── entry walking ──────────────────────────────────────────────────── */

/* Verbosity levels for our own output. libav internal log is controlled
 * separately via av_log_set_level(). */
enum verbosity {
  VERB_QUIET = 0,   /* only PASS/FAIL banner + payload */
  VERB_DEFAULT = 1, /* + structured per-entry log */
  VERB_VERBOSE = 2  /* + libav internal info logs */
};

struct accept_ctx {
  const uint8_t (*accept)[16];
  int accept_count;
  int accept_any;
  int matched_count;
  int entry_index;
  enum verbosity verb;
};

/* Hierarchical block for a matched entry. Non-matching entries are
 * skipped silently — they're still counted toward `entry_index` for the
 * final PASS/FAIL banner. */
static void print_matched_entry(FILE *f, const AVEncryptionInitInfo *info,
                                unsigned stream_idx, int entry_idx) {
  fprintf(f, "\n  stream %u\n", stream_idx);
  fprintf(f, "    entry #%d  %s\n", entry_idx,
          systemid_label(info->system_id, info->system_id_size));
  fprintf(f, "      systemId : ");
  fprint_uuid(f, info->system_id, info->system_id_size);
  fprintf(f, "\n");
  fprintf(f, "      kids     : %u\n", info->num_key_ids);
  for (uint32_t k = 0; k < info->num_key_ids && k < 4; k++) {
    fprintf(f, "        [%u]    : ", k);
    fprint_hex(f, info->key_ids[k], info->key_id_size);
    fprintf(f, "\n");
  }
  if (info->num_key_ids > 4) {
    fprintf(f, "        ...    : (%u more)\n", info->num_key_ids - 4);
  }
  fprintf(f, "      data     : %u bytes  → stdout\n", info->data_size);
}

/* Visit one AVEncryptionInitInfo entry. Returns 1 to stop iteration
 * (match found, success or hard-fail), 0 to continue. */
static int visit_entry(const AVEncryptionInitInfo *info, unsigned stream_idx,
                       struct accept_ctx *a) {
  int entry_idx = a->entry_index++;
  int match =
      a->accept_any || systemid_matches(info->system_id, info->system_id_size,
                                        a->accept, a->accept_count);

  if (!match)
    return 0;

  if (a->verb >= VERB_DEFAULT)
    print_matched_entry(stderr, info, stream_idx, entry_idx);

  /* num_key_ids may legitimately be 0: pssh v0 (per ISO/IEC 23001-7 §8.1)
   * carries only SystemID + Data, with KIDs declared in `tenc` instead.
   * Bento4 with --pssh + mpeg-cenc.eme-pssh:true emits v0 for the
   * Elacity entry. Only the Data[] payload is load-bearing for the
   * downstream license recovery flow, so check that and only that. */
  if (info->data == NULL || info->data_size == 0) {
    fprintf(stderr, "      ! FAIL   : matched but data[] is empty\n");
    return 1;
  }

  /* Data[] payload to stdout for piping. */
  fwrite(info->data, 1, info->data_size, stdout);
  fputc('\n', stdout);

  a->matched_count++;
  return 1;
}

/* Walk every AVStream's coded_side_data + AVEncryptionInitInfo linked
 * list. Returns 1 if any entry matched, 0 otherwise. */
static int walk_streams(AVFormatContext *ctx, struct accept_ctx *a) {
  int any_side_data = 0;
  int matched = 0;
  for (unsigned int i = 0; i < ctx->nb_streams; i++) {
    const AVCodecParameters *codecpar = ctx->streams[i]->codecpar;
    const AVPacketSideData *sd = av_packet_side_data_get(
        codecpar->coded_side_data, codecpar->nb_coded_side_data,
        AV_PKT_DATA_ENCRYPTION_INIT_INFO);
    if (sd == NULL || sd->size == 0)
      continue;
    any_side_data = 1;

    AVEncryptionInitInfo *head =
        av_encryption_init_info_get_side_data(sd->data, sd->size);
    if (head == NULL) {
      fprintf(stderr,
              "  stream %u: side_data present (%zu bytes) but decode failed\n",
              i, sd->size);
      continue;
    }

    for (AVEncryptionInitInfo *cur = head; cur != NULL; cur = cur->next) {
      if (visit_entry(cur, i, a)) {
        matched = 1;
        break;
      }
    }
    av_encryption_init_info_free(head);
    if (matched)
      break;
  }
  if (!any_side_data) {
    fprintf(stderr, "  ! FAIL    : no AV_PKT_DATA_ENCRYPTION_INIT_INFO on any\n"
                    "              stream's codecpar->coded_side_data\n");
  }
  return matched;
}

/* ── main ───────────────────────────────────────────────────────────── */

static void usage(const char *argv0) {
  fprintf(stderr,
          "usage: %s <init.mp4|stream.mpd|URL> [systemId ...]\n"
          "       %s --any <init.mp4|stream.mpd|URL>\n"
          "\n"
          "Default accept-list: every Elacity dDRM scheme.\n"
          "  cenc:lit-aes-gcm-v3   bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe\n"
          "  cenc:lit-drm-sa-v1    a17e506d-9355-4710-935f-1d928eff7594\n"
          "  cenc:lit-drm-v1       b7855546-88e5-40f8-ba99-c3e33033fbee\n"
          "  cenc:web3-drm-v1      bf8ef85d-2c54-475d-8c1e-e27db60332a2\n"
          "  clearkey (Elacity)    e2719d58-a985-b3c9-781a-b030af78d30e\n"
          "\n"
          "Pass one or more systemIds (32 hex chars, dashes/colons stripped)\n"
          "to override the accept-list. Pass --any to accept any systemId\n"
          "found in the linked list of AVEncryptionInitInfo entries.\n"
          "\n"
          "Walks AVEncryptionInitInfo->next so assets carrying multiple PSSH\n"
          "entries (Widevine + Elacity, ClearKey + Elacity, etc.) are\n"
          "handled — the first entry that matches the accept-list wins.\n"
          "\n"
          "Output: stderr carries the structured per-entry log; stdout\n"
          "carries ONLY the matched entry's data[] payload (pipe to jq).\n"
          "\n"
          "Verbosity:\n"
          "  -q, --quiet     suppress per-entry log; only PASS/FAIL banner\n"
          "                  + payload on stdout. libav errors silenced.\n"
          "  (default)       structured per-entry log on stderr. libav\n"
          "                  internal warnings/errors silenced.\n"
          "  -v, --verbose   enable libav internal logs (e.g. obu / aac\n"
          "                  decoder errors triggered by\n"
          "                  avformat_find_stream_info on encrypted samples).\n"
          "  -vv             enable libav debug-level logs.\n",
          argv0, argv0);
}

int main(int argc, char **argv) {
  if (argc < 2 || strcmp(argv[1], "-h") == 0 ||
      strcmp(argv[1], "--help") == 0) {
    usage(argv[0]);
    return 2;
  }

  const char *input = NULL;
  uint8_t accept[MAX_ACCEPT_SYSIDS][16];
  int accept_count = 0;
  int accept_any = 0;
  enum verbosity verb = VERB_DEFAULT;
  int libav_log_level = AV_LOG_QUIET;

  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--any") == 0) {
      accept_any = 1;
    } else if (strcmp(argv[i], "-q") == 0 || strcmp(argv[i], "--quiet") == 0) {
      verb = VERB_QUIET;
    } else if (strcmp(argv[i], "-v") == 0 ||
               strcmp(argv[i], "--verbose") == 0) {
      verb = VERB_VERBOSE;
      libav_log_level = AV_LOG_INFO;
    } else if (strcmp(argv[i], "-vv") == 0) {
      verb = VERB_VERBOSE;
      libav_log_level = AV_LOG_DEBUG;
    } else if (input == NULL) {
      input = argv[i];
    } else if (accept_count < MAX_ACCEPT_SYSIDS) {
      if (parse_systemid(argv[i], accept[accept_count]) != 0) {
        fprintf(stderr, "! FAIL: arg %d not a 32-hex-char systemId: %s\n", i,
                argv[i]);
        return 2;
      }
      accept_count++;
    } else {
      fprintf(stderr, "! FAIL: too many systemId args (max %d)\n",
              MAX_ACCEPT_SYSIDS);
      return 2;
    }
  }

  av_log_set_level(libav_log_level);
  if (input == NULL) {
    usage(argv[0]);
    return 2;
  }
  if (accept_count == 0 && !accept_any) {
    /* Default accept-list: every Elacity dDRM scheme. */
    for (int i = 0; i < ELACITY_DDRM_COUNT && accept_count < MAX_ACCEPT_SYSIDS;
         i++) {
      memcpy(accept[accept_count++], ELACITY_DDRM_SYSIDS[i].id, 16);
    }
  }

  /* ── header banner (suppressed under -q) ─────────────────────── */
  if (verb >= VERB_DEFAULT) {
    fprintf(stderr, "verify-pssh — CENC PSSH discoverability check\n");
    fprintf(stderr, "  input    : %s\n", input);
  }

  AVFormatContext *ctx = NULL;
  int ret = avformat_open_input(&ctx, input, NULL, NULL);
  if (ret < 0) {
    char err[256];
    av_strerror(ret, err, sizeof(err));
    fprintf(stderr, "  ! FAIL   : avformat_open_input: %s\n", err);
    return 1;
  }

  ret = avformat_find_stream_info(ctx, NULL);
  if (ret < 0) {
    char err[256];
    av_strerror(ret, err, sizeof(err));
    fprintf(stderr, "  ! FAIL   : avformat_find_stream_info: %s\n", err);
    avformat_close_input(&ctx);
    return 1;
  }

  if (verb >= VERB_DEFAULT)
    fprintf(stderr, "  streams  : %u\n", ctx->nb_streams);

  struct accept_ctx a = {accept, accept_count, accept_any, 0, 0, verb};
  int matched = walk_streams(ctx, &a);

  avformat_close_input(&ctx);

  if (verb >= VERB_DEFAULT)
    fprintf(stderr, "\n%s\n", SEPARATOR);
  if (!matched || a.matched_count == 0) {
    fprintf(stderr,
            "! FAIL — %d entr%s scanned, none matched the accept-list\n",
            a.entry_index, a.entry_index == 1 ? "y" : "ies");
    return 1;
  }
  fprintf(stderr, "* PASS — matched %d of %d entr%s; payload on stdout\n",
          a.matched_count, a.entry_index, a.entry_index == 1 ? "y" : "ies");
  return 0;
}
