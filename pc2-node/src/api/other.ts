/**
 * Other API Endpoints
 * 
 * Additional endpoints: /sign, /version, /os/user, /kv, etc.
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { SignRequest, SignResponse } from '../types/api.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { logger } from '../utils/logger.js';
import { broadcastItemUpdated } from '../websocket/events.js';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';
import { AIChatService } from '../services/ai/AIChatService.js';
import { getBaseUrl } from '../utils/urlUtils.js';
import { getGatewayService } from '../services/gateway/GatewayService.js';
import type { AgentConfig } from '../services/gateway/types.js';
import * as pdfjsLib from 'pdfjs-dist';
import fs from 'fs/promises';
import path from 'path';

// Hardcoded base64 icons - must match apps.ts and info.ts for consistency
const hardcodedIcons: Record<string, string> = {
  'editor': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImVkZ3JhZCIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2MzY2RjEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM0RjQ2RTUiLz48L2xpbmVhckdyYWRpZW50PjxjbGlwUGF0aCBpZD0icm91bmRlZCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTAiLz48L2NsaXBQYXRoPjwvZGVmcz48ZyBjbGlwLXBhdGg9InVybCgjcm91bmRlZCkiPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNlZGdyYWQpIi8+PHJlY3QgeD0iMTIiIHk9IjgiIHdpZHRoPSIyNCIgaGVpZ2h0PSIzMiIgcng9IjIiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIxNiIgeT0iMTQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIyIiBmaWxsPSIjYzdkMmZlIi8+PHJlY3QgeD0iMTYiIHk9IjIwIiB3aWR0aD0iMTYiIGhlaWdodD0iMiIgZmlsbD0iI2M3ZDJmZSIvPjxyZWN0IHg9IjE2IiB5PSIyNiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjIiIGZpbGw9IiNjN2QyZmUiLz48cmVjdCB4PSIxNiIgeT0iMzIiIHdpZHRoPSI4IiBoZWlnaHQ9IjIiIGZpbGw9IiNjN2QyZmUiLz48L2c+PC9zdmc+',
  'viewer': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InZpZXdncmFkIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzU2ODRmNSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzAzNjNhZCIvPjwvbGluZWFyR3JhZGllbnQ+PGNsaXBQYXRoIGlkPSJyb3VuZGVkIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMCIvPjwvY2xpcFBhdGg+PC9kZWZzPjxnIGNsaXAtcGF0aD0idXJsKCNyb3VuZGVkKSI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSJ1cmwoI3ZpZXdncmFkKSIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTQiIHI9IjUiIGZpbGw9IiNmZmQ3NjQiLz48cGF0aCBkPSJNNiAzOGwxMC0xMiA4IDYgMTAtMTQgMTAgMTR2MTJINnoiIGZpbGw9IiNjYmVhZmIiLz48L2c+PC9zdmc+',
  'player': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDUxMi4wMDEgNTEyLjAwMSIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNTEyLjAwMSA1MTIuMDAxOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cGF0aCBzdHlsZT0iZmlsbDojNTE1MDRFOyIgZD0iTTQ5MC42NjUsNDMuNTU3SDIxLjMzM0M5LjU1Miw0My41NTcsMCw1My4xMDgsMCw2NC44OXYzODIuMjJjMCwxMS43ODIsOS41NTIsMjEuMzM0LDIxLjMzMywyMS4zMzQNCgloNDY5LjMzMmMxMS43ODMsMCwyMS4zMzUtOS41NTIsMjEuMzM1LTIxLjMzNFY2NC44OUM1MTIsNTMuMTA4LDUwMi40NDgsNDMuNTU3LDQ5MC42NjUsNDMuNTU3eiIvPg0KPC9zdmc+',
  'pdf': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJDYXBhXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4Ig0KCSB2aWV3Qm94PSIwIDAgNTYgNTYiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDU2IDU2OyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cGF0aCBzdHlsZT0iZmlsbDojQ0M0QjRDOyIgZD0iTTQ4LjAzNyw1Nkg3Ljk2M0M3LjE1NSw1Niw2LjUsNTUuMzQ1LDYuNSw1NC41MzdWMzloNDN2MTUuNTM3QzQ5LjUsNTUuMzQ1LDQ4Ljg0NSw1Niw0OC4wMzcsNTZ6Ii8+DQo8L3N2Zz4=',
  'camera': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImNhbWdyYWQiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMzRkMzk5Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDU5NjY5Ii8+PC9saW5lYXJHcmFkaWVudD48Y2xpcFBhdGggaWQ9InJvdW5kZWQiPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgcng9IjEwIi8+PC9jbGlwUGF0aD48L2RlZnM+PGcgY2xpcC1wYXRoPSJ1cmwoI3JvdW5kZWQpIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9InVybCgjY2FtZ3JhZCkiLz48cmVjdCB4PSI2IiB5PSIxNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiByeD0iNCIgZmlsbD0iIzI1MjUyNSIvPjxyZWN0IHg9IjE2IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iNiIgcng9IjIiIGZpbGw9IiMzNzQxNTEiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjI2IiByPSI4IiBmaWxsPSIjMWUzYTVmIiBzdHJva2U9IiM2NGI1ZjMiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiMzYjgyZjYiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjI0IiByPSIxIiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIwLjYiLz48Y2lyY2xlIGN4PSIzOCIgY3k9IjE4IiByPSIyIiBmaWxsPSIjZWY0NDQ0Ii8+PC9nPjwvc3ZnPg==',
  'app-center': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImFwcGdyYWQiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjQ3NDhiIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMzM0MTU1Ii8+PC9saW5lYXJHcmFkaWVudD48Y2xpcFBhdGggaWQ9InJvdW5kZWQiPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgcng9IjEwIi8+PC9jbGlwUGF0aD48L2RlZnM+PGcgY2xpcC1wYXRoPSJ1cmwoI3JvdW5kZWQpIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9InVybCgjYXBwZ3JhZCkiLz48cmVjdCB4PSI4IiB5PSI4IiB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHJ4PSIzIiBmaWxsPSIjZWY0NDQ0Ii8+PHJlY3QgeD0iMjgiIHk9IjgiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxMiIgcng9IjMiIGZpbGw9IiNmOTczMTYiLz48cmVjdCB4PSI4IiB5PSIyOCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiByeD0iMyIgZmlsbD0iIzNiODJmNiIvPjxyZWN0IHg9IjI4IiB5PSIyOCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiByeD0iMyIgZmlsbD0iI2E4NTVmNyIvPjxyZWN0IHg9IjE4IiB5PSIxOCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiByeD0iMyIgZmlsbD0iIzIyYzU1ZSIvPjwvZz48L3N2Zz4=',
  'recorder': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InJlY2dyYWQiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZjk3MzE2Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZWE1ODBjIi8+PC9saW5lYXJHcmFkaWVudD48Y2xpcFBhdGggaWQ9InJvdW5kZWQiPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgcng9IjEwIi8+PC9jbGlwUGF0aD48L2RlZnM+PGcgY2xpcC1wYXRoPSJ1cmwoI3JvdW5kZWQpIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9InVybCgjcmVjZ3JhZCkiLz48cmVjdCB4PSIxOSIgeT0iOCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjE2IiByeD0iNSIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0xNSAyMHYzYzAgNC45NyA0LjAzIDkgOSA5czktNC4wMyA5LTl2LTMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxsaW5lIHgxPSIyNCIgeTE9IjMyIiB4Mj0iMjQiIHkyPSIzOCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGxpbmUgeDE9IjE4IiB5MT0iMzgiIHgyPSIzMCIgeTI9IjM4IiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L2c+PC9zdmc+',
  'solitaire-frvr': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InNvbGdyYWQiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMDY1ZjQ2Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDQ3ODU3Ii8+PC9saW5lYXJHcmFkaWVudD48Y2xpcFBhdGggaWQ9InJvdW5kZWQiPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgcng9IjEwIi8+PC9jbGlwUGF0aD48L2RlZnM+PGcgY2xpcC1wYXRoPSJ1cmwoI3JvdW5kZWQpIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9InVybCgjc29sZ3JhZCkiLz48cmVjdCB4PSIxMSIgeT0iMTEiIHdpZHRoPSIxOCIgaGVpZ2h0PSIyNiIgcng9IjIiIGZpbGw9IiMxZjI5MzciIHRyYW5zZm9ybT0icm90YXRlKC01IDIwIDI0KSIvPjxyZWN0IHg9IjE1IiB5PSI5IiB3aWR0aD0iMTgiIGhlaWdodD0iMjYiIHJ4PSIyIiBmaWxsPSIjMzc0MTUxIi8+PHJlY3QgeD0iMTkiIHk9IjciIHdpZHRoPSIxOCIgaGVpZ2h0PSIyNiIgcng9IjIiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2U1ZTdlYiIgc3Ryb2tlLXdpZHRoPSIxIi8+PHBhdGggZD0iTTI4IDEzYy0xLjUgMC0yLjUgMS0zIDItLjUtMS0xLjUtMi0zLTItMiAwLTMgMS41LTMgMy41IDAgMyAzIDUuNSA2IDggMy0yLjUgNi01IDYtOCAwLTItMS0zLjUtMy0zLjV6IiBmaWxsPSIjZWY0NDQ0Ii8+PC9nPjwvc3ZnPg==',
  'terminal': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyBzdHlsZT0iZmlsdGVyOiBkcm9wLXNoYWRvdyggMHB4IDFweCAxcHggcmdiYSgwLCAwLCAwLCAuNSkpOyIgaGVpZ2h0PSI0OCIgd2lkdGg9IjQ4IiB2aWV3Qm94PSIwIDAgNDggNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHRpdGxlPndpbmRvdyBjb2RlPC90aXRsZT4KICA8ZyBjbGFzcz0ibmMtaWNvbi13cmFwcGVyIiBzdHlsZT0iIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjk5NzcyNiwgMCwgMCwgMS4xMDI3NDgsIC0wLjAwMjc5MSwgLTIuODA5NzIxKSI+CiAgICA8cGF0aCBkPSJNIDQ1LjA5OCA0NS4zNjIgTCAzLjAwNCA0NS4zNjIgQyAxLjg5NyA0NS4zNjIgMSA0NC40NTkgMSA0My4zNDUgTCAxIDUuMDE3IEMgMSAzLjkwMyAxLjg5NyAzIDMuMDA0IDMgTCA0NS4wOTggMyBDIDQ2LjIwNiAzIDQ3LjEwMyAzLjkwMyA0Ny4xMDMgNS4wMTcgTCA0Ny4xMDMgNDMuMzQ1IEMgNDcuMTAzIDQ0LjQ1OSA0Ni4yMDYgNDUuMzYyIDQ1LjA5OCA0NS4zNjIgWiIgc3R5bGU9ImZpbGwtcnVsZTogbm9uemVybzsgcGFpbnQtb3JkZXI6IGZpbGw7IiBmaWxsPSIjZTNlNWVjIi8+CiAgICA8cmVjdCB4PSIzLjAwNCIgeT0iMTAuMDYiIGZpbGw9IiMyZTM3NDQiIHdpZHRoPSI0Mi4wOTQiIGhlaWdodD0iMzMuMjg0IiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDEwLjAyIDMxLjI0MSBDIDkuNzY0IDMxLjI0MSA5LjUwNyAzMS4xNDIgOS4zMTIgMzAuOTQ2IEMgOC45MiAzMC41NTEgOC45MiAyOS45MTQgOS4zMTIgMjkuNTIgTCAxMi42MTIgMjYuMTk4IEwgOS4zMTIgMjIuODc3IEMgOC45MiAyMi40ODIgOC45MiAyMS44NDUgOS4zMTIgMjEuNDUxIEMgOS43MDMgMjEuMDU2IDEwLjMzNyAyMS4wNTYgMTAuNzI5IDIxLjQ1MSBMIDE0LjczOCAyNS40ODUgQyAxNS4xMyAyNS44NzkgMTUuMTMgMjYuNTE3IDE0LjczOCAyNi45MTEgTCAxMC43MjkgMzAuOTQ2IEMgMTAuNTMzIDMxLjE0MiAxMC4yNzcgMzEuMjQxIDEwLjAyIDMxLjI0MSBaIiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDI4LjA2IDMxLjI0MSBMIDIwLjA0MyAzMS4yNDEgQyAxOS40ODkgMzEuMjQxIDE5LjA0IDMwLjc4OSAxOS4wNCAzMC4yMzMgQyAxOS4wNCAyOS42NzYgMTkuNDg5IDI5LjIyNCAyMC4wNDMgMjkuMjI0IEwgMjguMDYgMjkuMjI0IEMgMjguNjE0IDI5LjIyNCAyOS4wNjMgMjkuNjc2IDI5LjA2MyAzMC4yMzMgQyAyOS4wNjMgMzAuNzg5IDI4LjYxNCAzMS4yNDEgMjguMDYgMzEuMjQxIFoiIHN0eWxlPSIiLz4KICA8L2c+Cjwvc3ZnPg==',
};

// getBaseUrl is imported from ../utils/urlUtils.js - handles Active Proxy correctly

/**
 * Sign files for app access
 * POST /sign
 */
export function handleSign(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as SignRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.items || !Array.isArray(body.items)) {
    res.status(400).json({ error: 'Missing or invalid items array' });
    return;
  }

  try {
    const signatures: SignResponse['signatures'] = [];

    for (const item of body.items) {
      if (!item.uid && !item.path) {
        // Skip invalid items (don't add empty signature)
        continue;
      }

      // Find file by path or UID
      let filePath: string | null = null;
      
      if (item.path) {
        filePath = item.path;
      } else if (item.uid) {
        // Convert UUID back to path (uuid-/path/to/file -> /path/to/file)
        const uuidPath = item.uid.replace(/^uuid-/, '');
        filePath = '/' + uuidPath.replace(/-/g, '/');
      }
      
      if (!filePath) {
        // Skip invalid items
        continue;
      }

      // Normalize wallet address to lowercase for consistent lookups
      const normalizedWallet = req.user.wallet_address.toLowerCase();
      
      // Also normalize the file path to use lowercase wallet address
      const normalizedFilePath = filePath.replace(/\/0x[a-fA-F0-9]{40}/gi, (match) => match.toLowerCase());
      
      let metadata = filesystem.getFileMetadata(normalizedFilePath, normalizedWallet);
      let effectiveFilePath = normalizedFilePath;
      
      if (!metadata) {
        // Try original path as fallback
        metadata = filesystem.getFileMetadata(filePath, normalizedWallet);
        effectiveFilePath = filePath;
        if (!metadata) {
          logger.warn('[Sign] File not found:', { filePath, normalizedFilePath, wallet: normalizedWallet.slice(0, 10) + '...' });
          continue;
        }
      }
      
      // Use effectiveFilePath for the rest of the logic
      filePath = effectiveFilePath;

      // Generate signature (simplified - in production, use proper signing)
      const expires = Math.ceil(Date.now() / 1000) + 999999999; // Very long expiry
      const action = item.action || 'read';
      const signature = `sig-${filePath}-${action}-${expires}`;

      // Determine base URL
      const origin = req.headers.origin || req.headers.host;
      const isHttps = origin && typeof origin === 'string' && origin.startsWith('https://');
      const baseUrl = isHttps 
        ? `https://${origin.replace(/^https?:\/\//, '').split('/')[0]}`
        : `http://${req.headers.host || 'localhost:4200'}`;

      const fileUid = `uuid-${filePath.replace(/\//g, '-')}`;

      signatures.push({
        uid: fileUid,
        expires: expires,
        signature: signature,
        url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        read_url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        write_url: `${baseUrl}/writeFile?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        metadata_url: `${baseUrl}/itemMetadata?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        fsentry_type: metadata.mime_type || 'application/octet-stream',
        fsentry_is_dir: metadata.is_dir,
        fsentry_name: metadata.path.split('/').pop() || '',
        fsentry_size: metadata.size,
        fsentry_modified: metadata.updated_at,
        fsentry_created: metadata.created_at,
        path: filePath
      });
    }

    // Generate app token
    const appToken = `token-${req.user.wallet_address}-${Date.now()}`;

    const response: SignResponse = {
      token: appToken,
      signatures: signatures
    };

    res.json(response);
  } catch (error) {
    logger.error('Sign error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to sign files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get server version
 * GET /version
 */
export function handleVersion(req: Request, res: Response): void {
  res.json({
    version: '2.5.1',
    server: 'localhost', // Match mock server format
    deployed: new Date().toISOString()
  });
}

/**
 * Get OS user info (alias for /whoami)
 * GET /os/user
 */
export function handleOSUser(req: AuthenticatedRequest, res: Response): void {
  // Reuse whoami handler
  const { handleWhoami } = require('./whoami.js');
  handleWhoami(req, res);
}

/**
 * Key-value store operations
 * GET/POST/DELETE /kv/:key
 */
export function handleKV(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const key = req.params.key || req.path.replace('/kv/', '').replace('/api/kv/', '');

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const kvKey = `${req.user.wallet_address}:${key}`;

    if (req.method === 'GET') {
      const value = db.getSetting(kvKey);
      if (value === null) {
        res.send('null');
      } else if (typeof value === 'string') {
        res.send(value);
      } else {
        res.json(value);
      }
    } else if (req.method === 'POST') {
      const value = req.body.value !== undefined ? req.body.value : req.body;
      db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
      res.json({ success: true });
    } else if (req.method === 'DELETE') {
      db.deleteSetting(kvKey);
      res.json({ success: true });
    }
  } catch (error) {
    logger.error('KV error:', error instanceof Error ? error.message : 'Unknown error', { key });
    res.status(500).json({
      error: 'KV operation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Record app open
 * POST /rao
 * Stores recently launched apps in database for persistence
 */
export function handleRAO(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const body = req.body as { app_uid?: string; original_client_socket_id?: string };
  
  // Store recent app in database if possible
  if (db && req.user?.wallet_address && body.app_uid) {
    try {
      // Parse app name from uid (e.g., "app-camera" -> "camera", "app-file-processor" -> "file-processor")
      let appName = body.app_uid;
      if (appName.startsWith('app-')) {
        appName = appName.substring(4);
      }
      
      // Skip explorer as it's not a real app
      if (appName && appName !== 'explorer') {
        db.recordRecentApp(req.user.wallet_address, appName);
        logger.info('[RAO] Recorded recent app', { wallet: req.user.wallet_address.substring(0, 10), app: appName });
      }
    } catch (error: any) {
      // Don't fail the request if recording fails
      logger.warn('[RAO] Failed to record recent app:', error.message);
    }
  }
  
  res.json({ code: 'ok', message: 'ok' });
}

/**
 * Contact form
 * POST /contactUs
 */
export function handleContactUs(req: Request, res: Response): void {
  // Just acknowledge
  res.json({ success: true });
}

/**
 * Driver calls (for app lookups and KV store)
 * POST /drivers/call
 */
export function handleDriversCall(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  // Handle both parsed object and string body (for text/plain;actually=json)
  let body = req.body as any;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
      (req as any).body = body; // Update req.body for consistency
    } catch (e) {
      logger.error('[Drivers] Failed to parse string body:', e);
      body = {};
    }
  }

  if (!req.user) {
    logger.warn('[Drivers] Unauthorized request - no user');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  // Log request for debugging - check raw body too
  const rawBody = (req as any).rawBody;
  // Use console.log to ensure visibility in terminal
  console.log(`[Drivers] ========== REQUEST RECEIVED ==========`);
  console.log(`[Drivers] Request from ${req.user.wallet_address}`);
  console.log(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
  console.log(`[Drivers] Raw body (captured): ${rawBody ? rawBody.substring(0, 500) : 'NOT CAPTURED'} (length: ${rawBody?.length || 0})`);
  console.log(`[Drivers] Body type: ${typeof body}, is object: ${typeof body === 'object' && body !== null}`);
  console.log(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
  console.log(`[Drivers] interface=${body?.interface || 'missing'}, driver=${body?.driver || 'missing'}, method=${body?.method || 'missing'}`);
  console.log(`[Drivers] Full body:`, JSON.stringify(body || {}, null, 2));
  console.log(`[Drivers] Raw req.body:`, JSON.stringify(req.body || {}, null, 2));
  console.log(`[Drivers] Query params:`, JSON.stringify(req.query));
  console.log(`[Drivers] Request URL: ${req.url}`);
  console.log(`[Drivers] Request method: ${req.method}`);
  console.log(`[Drivers] ========================================`);
  
  // Also use logger for consistency
  logger.info(`[Drivers] Request from ${req.user.wallet_address}`);
  logger.info(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
  logger.info(`[Drivers] Raw body: ${rawBody ? rawBody.substring(0, 200) : 'NOT CAPTURED'}`);
  logger.info(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
  
  // Check if body is empty or malformed
  const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
  const isEmptyBody = !body || typeof body !== 'object' || Array.isArray(body) || bodyKeys.length === 0;
  
  // Handle empty body gracefully (matching mock server behavior)
  // Some SDK calls send empty bodies, we should handle them
  if (isEmptyBody) {
    logger.info('[Drivers] Empty or minimal request body, attempting to handle gracefully');
    
    // Try to get app name from query params as fallback
    const appNameFromQuery = req.query.name || req.query.app || req.query.id;
    if (appNameFromQuery) {
      logger.info(`[Drivers] Found app name in query params: ${appNameFromQuery}, treating as puter-apps request`);
      const bosonService = req.app?.locals?.bosonService;
      const baseUrl = getBaseUrl(req, bosonService);
      const appMap: Record<string, any> = {
        'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: hardcodedIcons['editor'], index_url: `${baseUrl}/apps/editor/index.html` },
        'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: hardcodedIcons['viewer'], index_url: `${baseUrl}/apps/viewer/index.html` },
        'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: hardcodedIcons['player'], index_url: `${baseUrl}/apps/player/index.html` },
        'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: hardcodedIcons['camera'], index_url: `${baseUrl}/apps/camera/index.html` },
        'app-center': { name: 'app-center', title: 'dApp Centre', uuid: 'app-app-center', uid: 'app-app-center', icon: hardcodedIcons['app-center'], index_url: `${baseUrl}/apps/app-center/index.html` },
        'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: hardcodedIcons['pdf'], index_url: `${baseUrl}/apps/pdf/index.html` },
        'terminal': { name: 'terminal', title: 'Terminal', uuid: 'app-terminal', uid: 'app-terminal', icon: undefined, index_url: `${baseUrl}/apps/terminal/index.html` },
        'phoenix': { name: 'phoenix', title: 'Phoenix Shell', uuid: 'app-phoenix', uid: 'app-phoenix', icon: undefined, index_url: `${baseUrl}/apps/phoenix/index.html` },
        'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: undefined, index_url: `${baseUrl}/apps/recorder/index.html` },
        'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: undefined, index_url: `${baseUrl}/apps/solitaire-frvr/index.html` },
        'calculator': { name: 'calculator', title: 'WASM Calculator', uuid: 'app-calculator', uid: 'app-calculator', icon: undefined, index_url: `${baseUrl}/apps/calculator/index.html` },
        'file-processor': { name: 'file-processor', title: 'File Processor', uuid: 'app-file-processor', uid: 'app-file-processor', icon: undefined, index_url: `${baseUrl}/apps/file-processor/index.html` }
      };
      const appInfo = appMap[String(appNameFromQuery)];
      if (appInfo) {
        res.json({ success: true, result: appInfo });
        return;
      }
    }
    
    // If we can't determine what to do with empty body, return success with null result
    // (matching mock server behavior - it doesn't error on empty bodies)
    logger.info('[Drivers] Empty body, returning null result');
    res.json({ success: true, result: null });
    return;
  }
  
  // Normalize: SDK might use 'driver' instead of 'interface'
  if (!body.interface && body.driver) {
    logger.info(`[Drivers] Converting 'driver' to 'interface': ${body.driver}`);
    body.interface = body.driver;
  }

  try {
    // Handle puter-kvstore requests (for key-value storage)
    if (body.interface === 'puter-kvstore') {
      const method = body.method;
      const key = body.args?.key;
      const wallet = req.user.wallet_address;
      const kvKey = `${wallet}:${key}`;

      if (method === 'get') {
        const value = db?.getSetting?.(kvKey);
        res.json({ success: true, result: value !== undefined ? value : null });
      } else if (method === 'set') {
        const value = body.args?.value !== undefined ? body.args.value : body.args?.va;
        if (db?.setSetting) {
          db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
        }
        res.json({ success: true, result: value });
      } else if (method === 'list') {
        // List keys matching pattern
        const pattern = body.args?.pattern || key || '*';
        const prefix = (pattern && typeof pattern === 'string') ? pattern.replace(/\*$/, '') : '';
        const walletPrefix = `${wallet}:${prefix}`;
        const matchingKeys: string[] = [];
        
        // If database supports listing settings, use it
        // Otherwise return empty array
        if (db?.listSettings) {
          const allSettings = db.listSettings();
          for (const [storedKey, _] of Object.entries(allSettings)) {
            if (typeof storedKey === 'string' && storedKey.startsWith(walletPrefix)) {
              const keyWithoutWallet = storedKey.substring(wallet.length + 1);
              matchingKeys.push(keyWithoutWallet);
            }
          }
        }
        
        res.json({ success: true, result: matchingKeys });
      } else if (method === 'delete') {
        if (db?.deleteSetting) {
          db.deleteSetting(kvKey);
        }
        res.json({ success: true, result: true });
      } else {
        res.status(400).json({ success: false, error: 'Unknown method' });
      }
      return;
    }

    // Handle puter-apps requests (for app lookups)
    if (body.interface === 'puter-apps' || body.interface === 'apps') {
      const method = body.method || 'read'; // Default to 'read' if not specified
      // Support multiple formats: body.args.id.name, body.args.name, body.name, body.args.id
      let appName = body.args?.id?.name || body.args?.name || body.name;
      // If args.id is a string, use it directly
      if (!appName && typeof body.args?.id === 'string') {
        appName = body.args.id;
      }
      // If args.id is an object with a name property, extract it
      if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
        appName = body.args.id.name;
      }
      const bosonService = req.app?.locals?.bosonService;
      const baseUrl = getBaseUrl(req, bosonService);
      
      logger.info(`[Drivers] puter-apps request: method=${method}, appName=${appName}, args=`, JSON.stringify(body.args || {}));
      
      if (method === 'read' || !method) { // Handle 'read' or missing method
        if (!appName) {
          logger.warn(`[Drivers] puter-apps read request but no app name found in args`);
          res.json({ success: true, result: null });
          return;
        }
        
        logger.info(`[Drivers] Looking up app: ${appName}`);
        
        // Define app info for each app
        // Note: launch_app.js expects 'index_url' not 'url'
        const appMap: Record<string, any> = {
          'editor': {
            name: 'editor',
            title: 'Text Editor',
            uuid: 'app-editor',
            uid: 'app-editor',
            icon: `${baseUrl}/apps/editor/img/icon.svg`,
            index_url: `${baseUrl}/apps/editor/index.html`
          },
          'viewer': {
            name: 'viewer',
            title: 'Image Viewer',
            uuid: 'app-viewer',
            uid: 'app-viewer',
            icon: hardcodedIcons['viewer'],
            index_url: `${baseUrl}/apps/viewer/index.html`
          },
          'player': {
            name: 'player',
            title: 'Media Player',
            uuid: 'app-player',
            uid: 'app-player',
            icon: hardcodedIcons['player'],
            index_url: `${baseUrl}/apps/player/index.html`
          },
          'camera': {
            name: 'camera',
            title: 'Camera',
            uuid: 'app-camera',
            uid: 'app-camera',
            icon: hardcodedIcons['camera'],
            index_url: `${baseUrl}/apps/camera/index.html`
          },
          'app-center': {
            name: 'app-center',
            title: 'dApp Centre',
            uuid: 'app-app-center',
            uid: 'app-app-center',
            icon: hardcodedIcons['app-center'],
            index_url: `${baseUrl}/apps/app-center/index.html`
          },
          'pdf': {
            name: 'pdf',
            title: 'PDF',
            uuid: 'app-pdf',
            uid: 'app-pdf',
            icon: hardcodedIcons['pdf'],
            index_url: `${baseUrl}/apps/pdf/index.html`
          },
          'terminal': {
            name: 'terminal',
            title: 'Terminal',
            uuid: 'app-terminal',
            uid: 'app-terminal',
            icon: hardcodedIcons['terminal'],
            index_url: `${baseUrl}/apps/terminal/index.html`
          },
          'recorder': {
            name: 'recorder',
            title: 'Recorder',
            uuid: 'app-recorder',
            uid: 'app-recorder',
            icon: hardcodedIcons['recorder'],
            index_url: `${baseUrl}/apps/recorder/index.html`
          },
          'solitaire-frvr': {
            name: 'solitaire-frvr',
            title: 'Solitaire FRVR',
            uuid: 'app-solitaire-frvr',
            uid: 'app-solitaire-frvr',
            icon: hardcodedIcons['solitaire-frvr'],
            index_url: `${baseUrl}/apps/solitaire-frvr/index.html`
          }
        };
        
        const appInfo = appName ? appMap[appName] : null;
        
        if (appInfo) {
          logger.info(`[Drivers] Returning app info for: ${appName}`);
          res.json({ success: true, result: appInfo });
        } else {
          logger.warn(`[Drivers] App not found in appMap: ${appName}`);
          res.json({ success: true, result: null });
        }
        return;
      } else if (method === 'list') {
        // Return empty list for now
        res.json({ success: true, result: [] });
        return;
      } else {
        res.status(400).json({ success: false, error: 'Unknown method' });
        return;
      }
    }

    // Handle puter-subdomains interface (for subdomain-based app routing)
    if (body.interface === 'puter-subdomains') {
      logger.info('[Drivers] puter-subdomains request - returning empty list (subdomains not used in PC2)');
      // PC2 node doesn't use subdomains - apps are served from /apps/* paths
      // Return empty list to indicate no subdomains are configured
      res.json({ success: true, result: [] });
      return;
    }

    // Handle puter-ocr interface (OCR for images)
    if (body.interface === 'puter-ocr') {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const method = body.method || 'recognize';
      const args = body.args || {};

      if (method === 'recognize') {
        const source = args.source;
        if (!source) {
          res.status(400).json({ 
            success: false, 
            error: 'Missing required argument: source' 
          });
          return;
        }

        // Note: OCR is best handled by vision-capable AI models
        // For now, return a message suggesting to use vision models
        // Future: Could integrate Tesseract.js or cloud OCR services
        
        logger.info('[Drivers] OCR requested for:', source);
        res.json({ 
          success: true, 
          result: { 
            text: '',
            note: 'OCR is handled by vision-capable AI models. The image will be analyzed directly by the AI model.'
          } 
        });
        return;
      }

      res.status(400).json({ 
        success: false, 
        error: `Unknown method: ${method}` 
      });
      return;
    }

    // Handle puter-pdf interface (PDF text extraction)
    if (body.interface === 'puter-pdf') {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const method = body.method || 'extract_text';
      const args = body.args || {};

      if (method === 'extract_text') {
        const source = args.source;
        if (!source) {
          res.status(400).json({ 
            success: false, 
            error: 'Missing required argument: source' 
          });
          return;
        }

        // Extract text from PDF using pdfjs-dist
        (async () => {
          try {
            if (!req.user) {
              res.status(401).json({ success: false, error: 'Unauthorized' });
              return;
            }

            const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
            if (!filesystem) {
              res.status(500).json({ 
                success: false, 
                error: 'Filesystem not initialized' 
              });
              return;
            }

            // Get file path - source could be a path or UID
            let filePath: string;
            if (source.startsWith('/')) {
              filePath = source;
            } else {
              // Assume it's a UID, need to resolve to path
              // For now, treat as path
              filePath = source;
            }

            // Ensure path is within user's directory
            const walletAddress = req.user.wallet_address;
            const userPath = `/${walletAddress}`;
            if (!filePath.startsWith(userPath)) {
              res.status(403).json({ 
                success: false, 
                error: 'Access denied' 
              });
              return;
            }

            // Read PDF file
            const fileContent = await filesystem.readFile(filePath, walletAddress);
            if (!fileContent) {
              res.status(404).json({ 
                success: false, 
                error: 'File not found' 
              });
              return;
            }

            // Convert Buffer to Uint8Array for pdfjs-dist
            const uint8Array = new Uint8Array(fileContent);

            // Load PDF with pdfjs-dist
            const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            let fullText = '';

            // Extract text from all pages
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((item: any) => item.str).join(' ');
              fullText += pageText + '\n\n';
            }

            res.json({ 
              success: true, 
              result: { 
                text: fullText.trim(),
                pages: pdf.numPages
              } 
            });
          } catch (error: any) {
            logger.error('[Drivers] PDF extraction error:', error);
            res.status(500).json({ 
              success: false, 
              error: error.message || 'PDF text extraction failed' 
            });
          }
        })();
        return;
      }

      res.status(400).json({ 
        success: false, 
        error: `Unknown method: ${method}` 
      });
      return;
    }

    // Handle puter-chat-completion interface (AI chat)
    if (body.interface === 'puter-chat-completion') {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const aiService = (req.app.locals.aiService as AIChatService | undefined);
      if (!aiService) {
        res.status(503).json({ 
          success: false, 
          error: 'AI service not available. Please ensure Ollama is installed and running.' 
        });
        return;
      }

      const method = body.method || 'complete';

      // Make handler async to support streaming
      (async () => {
        try {
          if (method === 'complete') {
            const args = body.args || {};
            let messages = args.messages || [];
            let model = args.model;
            const stream = args.stream || false;
            const tools = args.tools;
            const max_tokens = args.max_tokens;
            let temperature = args.temperature;
            const agentId = args.agentId; // Optional agent ID for agent-specific config
            
            // If agentId is provided, load agent config and apply its settings
            let agentConfig: AgentConfig | undefined;
            if (agentId) {
              try {
                const gateway = getGatewayService();
                agentConfig = gateway.getAgent(agentId);
                
                if (agentConfig && agentConfig.enabled) {
                  logger.info('[Drivers] Using agent config:', agentConfig.id, agentConfig.name);
                  
                  // Apply agent's model if not explicitly set in request
                  if (!model && agentConfig.model) {
                    const provider = agentConfig.provider || 'ollama';
                    model = provider !== 'ollama' ? `${provider}:${agentConfig.model}` : agentConfig.model;
                    logger.info('[Drivers] Using agent model:', model);
                  }
                  
                  // Apply agent's thinking level (maps to temperature)
                  if (temperature === undefined && agentConfig.thinkingLevel) {
                    const tempMap: Record<string, number> = { fast: 0.3, balanced: 0.7, deep: 0.9 };
                    temperature = tempMap[agentConfig.thinkingLevel] || 0.3;
                    logger.info('[Drivers] Using agent thinking level:', agentConfig.thinkingLevel, '-> temperature:', temperature);
                  }
                  
                  // Apply agent's soul content as system prompt
                  const soulContent = agentConfig.soulContent || agentConfig.customSoul;
                  if (soulContent) {
                    // Prepend system message with soul content if not already present
                    const hasSystemMessage = messages.some((m: any) => m.role === 'system');
                    if (!hasSystemMessage) {
                      messages = [{ role: 'system', content: soulContent }, ...messages];
                      logger.info('[Drivers] Prepended agent soul content as system message');
                    }
                  }
                } else if (agentId) {
                  logger.warn('[Drivers] Agent not found or disabled:', agentId);
                }
              } catch (e) {
                logger.warn('[Drivers] Error loading agent config:', e);
              }
            }
            
            // Get user's AI config to use default model/provider if not specified
            const db = (req.app.locals.db as any);
            const walletAddress = req.user?.wallet_address;
            if (db && walletAddress && !model) {
              try {
                const userConfig = db.getAIConfig(walletAddress);
                if (userConfig) {
                  const provider = userConfig.default_provider || 'ollama';
                  const defaultModel = userConfig.default_model || (provider === 'ollama' ? 'deepseek-r1:1.5b' : null);
                  if (defaultModel) {
                    // Format: provider:model (e.g., "ollama:deepseek-r1:1.5b" or "claude:claude-3-5-sonnet-20240620")
                    model = `${provider}:${defaultModel}`;
                    logger.info('[Drivers] Using user default model from config:', model);
                  }
                }
              } catch (e) {
                // Config not found or error - use default
                logger.debug('[Drivers] Could not load user AI config, using defaults');
              }
            }
            
            // If model still not set, use default
            if (!model) {
              model = 'ollama:deepseek-r1:1.5b';
            }

            if (!messages || !Array.isArray(messages) || messages.length === 0) {
              res.status(400).json({ 
                success: false, 
                error: 'Missing or invalid messages array' 
              });
              return;
            }

            // Log message sizes for debugging
            const totalMessageLength = JSON.stringify(messages).length;
            logger.info('[Drivers] AI chat request:', {
              messageCount: messages.length,
              totalMessageLength,
              model,
              stream,
              hasTools: !!tools,
            });
            
            // Log the last user message to help debug content generation issues
            const lastUserMessage = messages.find((m: any) => m.role === 'user');
            if (lastUserMessage) {
              const userText = typeof lastUserMessage.content === 'string' 
                ? lastUserMessage.content 
                : (Array.isArray(lastUserMessage.content) 
                  ? lastUserMessage.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
                  : JSON.stringify(lastUserMessage.content));
              logger.info('[Drivers] Last user message:', userText.substring(0, 200));
            }
            
            // Warn if message is very large
            if (totalMessageLength > 100000) {
              logger.warn('[Drivers] Large AI chat request detected:', {
                totalMessageLength,
                messageCount: messages.length,
              });
            }

            if (stream) {
              // Streaming response - Use Puter's exact format: application/x-ndjson
              res.status(200); // Set status before headers
              res.setHeader('Content-Type', 'application/x-ndjson');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
              
              // Disable Express response buffering
              res.setTimeout(0); // No timeout
              
              // Send headers immediately (don't wait for first write)
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
              });

              try {
                // Get filesystem and wallet address for tool execution
                // CRITICAL: filesystem must be available for tool execution
                let filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
                const walletAddress = req.user?.wallet_address;
                const smartAccountAddress = req.user?.smart_account_address || undefined;

                // Get WebSocket server for live updates
                const io = (req.app.locals.io as any | undefined);
                logger.info('[Drivers] AI streamComplete - io available:', !!io, 'filesystem:', !!filesystem, 'walletAddress:', walletAddress, 'smartAccount:', !!smartAccountAddress);
                
                if (!filesystem) {
                  logger.error('[Drivers] ⚠️ CRITICAL: filesystem not available in app.locals - tool execution will be disabled!');
                  logger.error('[Drivers] app.locals keys:', Object.keys(req.app.locals || {}));
                  logger.error('[Drivers] app.locals.filesystem type:', typeof req.app.locals.filesystem);
                  logger.error('[Drivers] app.locals.filesystem value:', req.app.locals.filesystem);
                  
                  // Try to get filesystem from global if available
                  const globalFilesystem = (global as any).__filesystem;
                  if (globalFilesystem) {
                    logger.warn('[Drivers] Found filesystem in global, using it as fallback');
                    filesystem = globalFilesystem;
                  }
                }

                // Register user providers before streaming (loads API keys from database)
                if (walletAddress) {
                  await (aiService as any).registerUserProviders(walletAddress);
                }

                // Emit status: thinking at the start of streaming
                res.write(`${JSON.stringify({ type: 'status', status: 'thinking' })}\n`);
                if (typeof (res as any).flush === 'function') {
                  (res as any).flush();
                }

                // Track usage statistics
                let totalTokens = 0;
                let promptTokens = 0;
                let completionTokens = 0;

                for await (const chunk of aiService.streamComplete({
                  messages,
                  model,
                  stream: true,
                  tools,
                  max_tokens,
                  temperature,
                  walletAddress,
                  smartAccountAddress,
                  filesystem,
                  io,
                })) {
                  // Track usage if available
                  if (chunk.usage) {
                    if (chunk.usage.total_tokens) totalTokens = chunk.usage.total_tokens;
                    if (chunk.usage.prompt_tokens) promptTokens = chunk.usage.prompt_tokens;
                    if (chunk.usage.completion_tokens) completionTokens = chunk.usage.completion_tokens;
                  }

                  // Puter's format: {"type": "text", "text": "chunk content"}\n
                  // Also parse DeepSeek <think> tags and emit as reasoning chunks
                  const content = chunk.message?.content || '';
                  if (content) {
                    // Check for DeepSeek thinking tags
                    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                    if (thinkMatch) {
                      // Extract thinking content
                      const thinkingContent = thinkMatch[1];
                      const remainingContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                      
                      // Emit reasoning chunk
                      if (thinkingContent) {
                        const reasoningChunk = JSON.stringify({
                          type: 'reasoning',
                          content: thinkingContent,
                        });
                        res.write(`${reasoningChunk}\n`);
                        if (typeof (res as any).flush === 'function') {
                          (res as any).flush();
                        }
                      }
                      
                      // Emit remaining text if any
                      if (remainingContent) {
                        const textChunk = JSON.stringify({
                          type: 'text',
                          text: remainingContent,
                        });
                        res.write(`${textChunk}\n`);
                        if (typeof (res as any).flush === 'function') {
                          (res as any).flush();
                        }
                      }
                    } else {
                      // No thinking tags, emit as regular text
                      const textChunk = JSON.stringify({
                        type: 'text',
                        text: content,
                      });
                      res.write(`${textChunk}\n`);
                      if (typeof (res as any).flush === 'function') {
                        (res as any).flush();
                      }
                    }
                  }
                  
                  // NOTE: We no longer handle message.tool_calls here because AIChatService
                  // now yields explicit tool_use/tool_result chunks with accurate total_tools count.
                  // This prevents duplicate tool tracking on the frontend.
                  
                  // Handle explicit tool_use chunks (from our streaming tool execution)
                  if ((chunk as any).type === 'tool_use') {
                    const toolChunk = {
                      type: 'tool_use',
                      id: (chunk as any).id,
                      name: (chunk as any).name,
                      input: (chunk as any).input,
                      tool_index: (chunk as any).tool_index,
                      total_tools: (chunk as any).total_tools,
                    };
                    logger.info('[Drivers] Writing tool_use chunk:', toolChunk.name, 'step', (toolChunk.tool_index || 0) + 1, 'of', toolChunk.total_tools);
                    res.write(`${JSON.stringify(toolChunk)}\n`);
                    if (typeof (res as any).flush === 'function') {
                      (res as any).flush();
                    }
                  }
                  
                  // Handle explicit tool_result chunks (from our streaming tool execution)
                  if ((chunk as any).type === 'tool_result') {
                    const resultChunk = {
                      type: 'tool_result',
                      tool_use_id: (chunk as any).tool_use_id,
                      name: (chunk as any).name,
                      result: (chunk as any).result,
                      error: (chunk as any).error,
                      is_error: (chunk as any).is_error,
                      tool_index: (chunk as any).tool_index,
                      total_tools: (chunk as any).total_tools,
                    };
                    res.write(`${JSON.stringify(resultChunk)}\n`);
                    if (typeof (res as any).flush === 'function') {
                      (res as any).flush();
                    }
                  }
                }
                
                // Emit done chunk with usage statistics
                const doneChunk = JSON.stringify({
                  type: 'done',
                  usage: {
                    total_tokens: totalTokens,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                  }
                });
                res.write(`${doneChunk}\n`);
                if (typeof (res as any).flush === 'function') {
                  (res as any).flush();
                }
                
                res.end();
              } catch (error: any) {
                const errorMessage = error?.message || 'AI stream error';
                const errorStack = error?.stack;
                
                logger.error('[Drivers] AI stream error:', error);
                logger.error('[Drivers] AI stream error message:', errorMessage);
                logger.error('[Drivers] AI stream error stack:', errorStack);
                logger.error('[Drivers] AI stream error details:', {
                  message: errorMessage,
                  name: error?.name,
                  cause: error?.cause,
                  toString: String(error),
                });
                
                // Check if headers are already sent (stream might have started)
                if (!res.headersSent) {
                  // Headers not sent yet - send error as regular JSON response
                  res.status(500).json({ 
                    success: false, 
                    error: errorMessage,
                    errorName: error?.name,
                    details: errorStack?.substring(0, 1000)
                  });
                } else {
                  // Headers already sent - send error in ndjson format
                  try {
                    const errorChunk = JSON.stringify({
                      type: 'error',
                      message: errorMessage,
                      errorName: error?.name,
                      details: errorStack?.substring(0, 1000)
                    });
                    res.write(`${errorChunk}\n`);
                    res.end();
                  } catch (writeError) {
                    logger.error('[Drivers] Failed to write stream error:', writeError);
                    // Can't write to stream, just end it
                    res.end();
                  }
                }
              }
            } else {
              // Non-streaming response
              try {
                // Get filesystem and wallet address for tool execution
                const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
                const walletAddress = req.user?.wallet_address;
                const smartAccountAddress = req.user?.smart_account_address || undefined;

                // Get WebSocket server for live updates
                const io = (req.app.locals.io as any | undefined);

                const result = await aiService.complete({
                  messages,
                  model,
                  stream: false,
                  tools,
                  max_tokens,
                  temperature,
                  walletAddress,
                  smartAccountAddress,
                  filesystem,
                  io,
                });

                res.json({ 
                  success: true, 
                  result: result 
                });
              } catch (completeError: any) {
                const errorMessage = completeError?.message || 'AI chat completion failed';
                const errorStack = completeError?.stack;
                
                logger.error('[Drivers] AI complete error:', completeError);
                logger.error('[Drivers] AI complete error message:', errorMessage);
                logger.error('[Drivers] AI complete error stack:', errorStack);
                logger.error('[Drivers] AI complete error details:', {
                  message: errorMessage,
                  name: completeError?.name,
                  cause: completeError?.cause,
                  toString: String(completeError),
                });
                
                // Always return error message to client for debugging
                res.status(500).json({ 
                  success: false, 
                  error: errorMessage,
                  errorName: completeError?.name,
                  details: errorStack?.substring(0, 1000) // First 1000 chars of stack
                });
              }
            }
          } else if (method === 'models' || method === 'list') {
            // List available models
            const models = await aiService.listModels();
            res.json({ 
              success: true, 
              result: models 
            });
          } else if (method === 'providers') {
            // List available providers
            const providers = aiService.listProviders();
            res.json({ 
              success: true, 
              result: providers 
            });
          } else {
            res.status(400).json({ 
              success: false, 
              error: `Unknown method: ${method}` 
            });
          }
        } catch (error: any) {
          logger.error('[Drivers] AI chat error:', error);
          logger.error('[Drivers] AI chat error stack:', error.stack);
          logger.error('[Drivers] AI chat error details:', {
            message: error.message,
            name: error.name,
            cause: error.cause,
          });
          res.status(500).json({ 
            success: false, 
            error: error.message || 'AI chat completion failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      })();
      return;
    }

    // Unknown interface - log what we received
    logger.warn(`[Drivers] Unknown interface: ${body.interface || 'missing'}, body:`, JSON.stringify(body));
    
    // Check if this might be a puter-apps request with different format
    // SDK might send various formats:
    // 1. { driver: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }
    // 2. { interface: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }
    // 3. { method: 'read', args: { id: { name: 'app-name' } } } (no interface/driver field)
    // 4. { name: 'app-name' } (direct app name)
    // 5. Empty body {} - try to infer from context
    const hasAppLookupStructure = body.driver === 'puter-apps' || body.driver === 'apps' || 
        (!body.interface && !body.driver && (body.args?.id || body.name || body.args?.name));
    
    if (hasAppLookupStructure || (bodyKeys.length === 0 && req.method === 'POST')) {
      // Even if body is empty, if it's a POST to /drivers/call, it might be an app lookup
      // Try to infer from URL or other context
      logger.info(`[Drivers] Attempting to handle as puter-apps request (hasStructure=${hasAppLookupStructure}, emptyBody=${bodyKeys.length === 0})`);
      logger.info(`[Drivers] Detected puter-apps request format (driver=${body.driver || 'none'}, has args=${!!body.args}, has name=${!!body.name})`);
      body.interface = 'puter-apps';
      // Handle app lookup
      const method = body.method || 'read'; // Default to 'read' if method not specified
      let appName = body.args?.id?.name || body.args?.name || body.name;
      if (!appName && typeof body.args?.id === 'string') {
        appName = body.args.id;
      }
      // If args.id is an object with a name property, extract it
      if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
        appName = body.args.id.name;
      }
      
      // If still no app name and body is empty, we can't proceed
      if (!appName && bodyKeys.length === 0) {
        logger.warn(`[Drivers] Cannot determine app name from empty body. Request might be malformed.`);
        res.status(400).json({ 
          success: false, 
          error: 'Cannot determine app name from empty request body. Expected format: { interface: "puter-apps", method: "read", args: { id: { name: "app-name" } } }' 
        });
        return;
      }
      const bosonService = req.app?.locals?.bosonService;
      const baseUrl = getBaseUrl(req, bosonService);
      
      logger.info(`[Drivers] puter-apps (driver format): method=${method}, appName=${appName}`);
      
      if (method === 'read' || !method) { // Default to 'read' if method not specified
        const appMap: Record<string, any> = {
          'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: hardcodedIcons['editor'], index_url: `${baseUrl}/apps/editor/index.html` },
          'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: hardcodedIcons['viewer'], index_url: `${baseUrl}/apps/viewer/index.html` },
          'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: hardcodedIcons['player'], index_url: `${baseUrl}/apps/player/index.html` },
          'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: hardcodedIcons['camera'], index_url: `${baseUrl}/apps/camera/index.html` },
          'app-center': { name: 'app-center', title: 'dApp Centre', uuid: 'app-app-center', uid: 'app-app-center', icon: hardcodedIcons['app-center'], index_url: `${baseUrl}/apps/app-center/index.html` },
          'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: hardcodedIcons['pdf'], index_url: `${baseUrl}/apps/pdf/index.html` },
          'terminal': { name: 'terminal', title: 'Terminal', uuid: 'app-terminal', uid: 'app-terminal', icon: hardcodedIcons['terminal'], index_url: `${baseUrl}/apps/terminal/index.html` },
          'phoenix': { name: 'phoenix', title: 'Phoenix Shell', uuid: 'app-phoenix', uid: 'app-phoenix', icon: hardcodedIcons['terminal'], index_url: `${baseUrl}/apps/phoenix/index.html` },
          'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: hardcodedIcons['recorder'], index_url: `${baseUrl}/apps/recorder/index.html` },
          'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: hardcodedIcons['solitaire-frvr'], index_url: `${baseUrl}/apps/solitaire-frvr/index.html` }
        };
        
        const appInfo = appName ? appMap[appName] : null;
        if (appInfo) {
          logger.info(`[Drivers] Found app: ${appName}, returning app info`);
          res.json({ success: true, result: appInfo });
        } else {
          logger.warn(`[Drivers] App not found: ${appName}`);
          res.json({ success: true, result: null });
        }
        return;
      }
    }
    
    // If we get here and body is empty, it might be a malformed request
    // Return a more helpful error
    const errorMsg = bodyKeys.length === 0 
      ? `Empty request body. Expected format: { interface: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }`
      : `Unknown interface: ${body.interface || 'missing'}. Body keys: ${bodyKeys.join(', ')}`;
    
    res.status(400).json({ success: false, error: errorMsg });
  } catch (error) {
    logger.error('[Drivers] Call error:', error instanceof Error ? error.message : 'Unknown error');
    logger.error('[Drivers] Error stack:', error instanceof Error ? error.stack : 'No stack');
    res.status(500).json({
      success: false,
      error: 'Driver call failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Helper function to find file with case-insensitive path resolution
 * Recursively resolves parent directories if they have wrong case
 */
function findFileCaseInsensitive(
  filesystem: FilesystemManager,
  filePath: string,
  walletAddress: string
): { metadata: any; resolvedPath: string } | null {
  // Try exact match first
  let metadata = filesystem.getFileMetadata(filePath, walletAddress);
  if (metadata) {
    return { metadata, resolvedPath: filePath };
  }

  // If not found, try case-insensitive lookup
  if (!filePath.includes('/')) {
    return null; // Root level, no parent to search
  }

  const pathParts = filePath.split('/').filter(p => p);
  if (pathParts.length === 0) {
    return null;
  }

  // Recursively resolve parent directories
  let currentPath = '/';
  let resolvedPathParts: string[] = [];

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const isLast = i === pathParts.length - 1;

    // Special case: if first component matches wallet address (case-insensitive), use it directly
    if (i === 0 && part.toLowerCase() === walletAddress.toLowerCase()) {
      resolvedPathParts.push(walletAddress); // Use actual wallet address (preserve case)
      currentPath = `/${walletAddress}`;
      if (isLast) {
        // Wallet address itself - check if it exists
        const walletDirMetadata = filesystem.getFileMetadata(`/${walletAddress}`, walletAddress);
        if (walletDirMetadata) {
          return { metadata: walletDirMetadata, resolvedPath: `/${walletAddress}` };
        }
        // Wallet directory might not exist as explicit entry, continue
      }
      continue; // Move to next component
    }

    // List current directory and find matching entry (case-insensitive)
    try {
      const entries = filesystem.listDirectory(currentPath, walletAddress);
      
      // Extract name from path for each entry
      const matchingEntry = entries.find(e => {
        const entryName = e.path.split('/').filter(p => p).pop() || '';
        return entryName.toLowerCase() === part.toLowerCase();
      });

      if (!matchingEntry) {
        logger.warn('[findFileCaseInsensitive] Component not found', { 
          currentPath, 
          part, 
          availableEntries: entries.map(e => e.path.split('/').pop() || '')
        });
        return null; // Path component not found
      }

      const entryName = matchingEntry.path.split('/').filter(p => p).pop() || '';
      resolvedPathParts.push(entryName);
      
      if (isLast) {
        // This is the file we're looking for
        return { metadata: matchingEntry, resolvedPath: matchingEntry.path };
      } else {
        // Continue to next directory level
        currentPath = matchingEntry.path;
      }
    } catch (e) {
      logger.error('[findFileCaseInsensitive] Error listing directory', { 
        currentPath, 
        error: e instanceof Error ? e.message : String(e) 
      });
      return null; // Directory doesn't exist
    }
  }

  return null;
}

/**
 * Open item - Get app to open a file/folder
 * POST /open_item
 * Matches Puter's format exactly - returns suggested app and file signature
 */
export async function handleOpenItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  logger.info('[OpenItem] Handler called', { path: req.path, method: req.method, hasUser: !!req.user });
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as any;

  if (!filesystem) {
    logger.error('[OpenItem] Filesystem not initialized');
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    logger.error('[OpenItem] No user in request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Support both uid and path (matching mock server)
  const fileUid = body.uid;
  let filePath = body.path;

  logger.info('[OpenItem] Request received', { uid: fileUid, path: filePath });

  // Handle ~ (home directory)
  if (filePath && filePath.startsWith('~')) {
    filePath = filePath.replace('~', `/${req.user.wallet_address}`);
  } else if (filePath && !filePath.startsWith('/')) {
    filePath = `/${req.user.wallet_address}/${filePath}`;
  }

  // Find file by UID or path
  let metadata = null;
  
  // Prefer path over UID (path is more reliable, UID conversion breaks with hyphens in filenames)
  if (filePath) {
    // Use case-insensitive lookup helper
    const result = findFileCaseInsensitive(filesystem, filePath, req.user.wallet_address);
    if (result) {
      metadata = result.metadata;
      filePath = result.resolvedPath;
    }
  }
  
  // Fallback to UID if path lookup failed
  if (!metadata && fileUid) {
    // Try to find by UUID (uuid-${path.replace(/\//g, '-')})
    // Handle both uuid- and uuid-- formats (double dash can occur)
    // NOTE: This conversion is imperfect - filenames with hyphens will break
    // The path parameter should be preferred
    let uuidPath = fileUid.replace(/^uuid-+/, ''); // Remove uuid- or uuid--
    let potentialPath = '/' + uuidPath.replace(/-/g, '/');
    
    logger.warn('[OpenItem] Falling back to UID-based lookup (may fail with hyphens in filename)', {
      uid: fileUid,
      potentialPath
    });
    
    // Use case-insensitive lookup helper
    const result = findFileCaseInsensitive(filesystem, potentialPath, req.user.wallet_address);
    if (result) {
      metadata = result.metadata;
      filePath = result.resolvedPath;
    }
  }

  if (!metadata) {
    logger.warn('[OpenItem] File not found', { uid: fileUid, path: filePath });
    res.status(404).json({ 
      error: { 
        code: 'subject_does_not_exist', 
        message: 'File not found' 
      } 
    });
    return;
  }

  logger.info('[OpenItem] File found', { path: metadata.path, mimeType: metadata.mime_type });

  // Determine app based on file type (matching mock server logic)
  const fileName = metadata.path.split('/').pop() || '';
  const fsname = fileName.toLowerCase();
  const bosonService = req.app?.locals?.bosonService;
  const baseUrl = getBaseUrl(req, bosonService);
  
  let appUid: string;
  let appName: string;
  let appIndexUrl: string;

  // Image files -> viewer
  if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') || 
      fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg') ||
      fsname.endsWith('.gif')) {
    appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
    appName = 'viewer';
    appIndexUrl = `${baseUrl}/apps/viewer/index.html`;
  }
  // Video/Audio files -> player
  else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') || 
           fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') || 
           fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi') ||
           fsname.endsWith('.wav') || fsname.endsWith('.flac')) {
    appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
    appName = 'player';
    appIndexUrl = `${baseUrl}/apps/player/index.html`;
  }
  // PDF files -> pdf
  else if (fsname.endsWith('.pdf')) {
    appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
    appName = 'pdf';
    appIndexUrl = `${baseUrl}/apps/pdf/index.html`;
  }
  // Text files -> editor
  else {
    appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
    appName = 'editor';
    appIndexUrl = `${baseUrl}/apps/editor/index.html`;
  }

  // Generate file signature (matching Puter's sign_file format)
  const actualFileUid = fileUid || `uuid-${metadata.path.replace(/\//g, '-')}`;
  const expires = Math.ceil(Date.now() / 1000) + 9999999999999; // Far future
  // Simple signature (in real Puter, this uses SHA256 with secret)
  const signature = `sig-${actualFileUid}-${expires}`;
  
  // Ensure normalizedPath starts with / and baseUrl doesn't end with /
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = metadata.path.startsWith('/') ? metadata.path : '/' + metadata.path;
  
  const signatureObj = {
    uid: actualFileUid,
    expires: expires,
    signature: signature,
    url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
    read_url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
    write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
    metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
    fsentry_type: metadata.mime_type || 'application/octet-stream',
    fsentry_is_dir: metadata.is_dir,
    fsentry_name: fileName,
    fsentry_size: metadata.size,
    fsentry_accessed: metadata.updated_at,
    fsentry_modified: metadata.updated_at,
    fsentry_created: metadata.created_at,
    path: cleanPath,
  };
  
  // Generate mock token (in real Puter, this is a user-app token)
  const token = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Build app object (matching Puter's format)
  const app = {
    uid: appUid,
    uuid: appUid, // Both uid and uuid for compatibility
    name: appName,
    title: appName.charAt(0).toUpperCase() + appName.slice(1),
    icon: hardcodedIcons[appName] || undefined,
    index_url: appIndexUrl,
    approved_for_opening_items: true,
  };
  
  logger.info('[OpenItem] Returning app info', { appName, indexUrl: appIndexUrl, hasIcon: !!app.icon });
  
  res.json({
    signature: signatureObj,
    token: token,
    suggested_apps: [app],
  });
}

/**
 * Suggest apps for a file (fallback when open_item fails)
 * POST /suggest_apps
 * Returns array of suggested apps for a file
 */
export async function handleSuggestApps(req: AuthenticatedRequest, res: Response): Promise<void> {
  logger.info('[SuggestApps] Handler called', { path: req.path, method: req.method, hasUser: !!req.user });
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as any;

  if (!filesystem) {
    logger.error('[SuggestApps] Filesystem not initialized');
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    logger.error('[SuggestApps] No user in request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Support both uid and path (matching mock server)
  const fileUid = body.uid;
  let filePath = body.path;

  logger.info('[SuggestApps] Request received', { uid: fileUid, path: filePath });

  // Handle ~ (home directory)
  if (filePath && filePath.startsWith('~')) {
    filePath = filePath.replace('~', `/${req.user.wallet_address}`);
  } else if (filePath && !filePath.startsWith('/')) {
    filePath = `/${req.user.wallet_address}/${filePath}`;
  }

  // Find file by UID or path
  let metadata = null;
  
  if (fileUid) {
    // Try to find by UUID (uuid-${path.replace(/\//g, '-')})
    // Handle both uuid- and uuid-- formats
    let uuidPath = fileUid.replace(/^uuid-+/, '');
    let potentialPath = '/' + uuidPath.replace(/-/g, '/');
    
    // Remove leading wallet address if present
    const pathParts = potentialPath.split('/').filter(p => p);
    if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
      potentialPath = '/' + pathParts.join('/');
    }
    
    // Use case-insensitive lookup helper
    const result = findFileCaseInsensitive(filesystem, potentialPath, req.user.wallet_address);
    if (result) {
      metadata = result.metadata;
      filePath = result.resolvedPath;
    }
  }
  
  if (!metadata && filePath) {
    // Use case-insensitive lookup helper
    const result = findFileCaseInsensitive(filesystem, filePath, req.user.wallet_address);
    if (result) {
      metadata = result.metadata;
      filePath = result.resolvedPath;
    }
  }

  if (!metadata) {
    logger.warn('[SuggestApps] File not found', { uid: fileUid, path: filePath });
    res.status(404).json({ error: 'File not found' });
    return;
  }

  logger.info('[SuggestApps] File found', { path: metadata.path, mimeType: metadata.mime_type });

  // Determine app based on file type (same logic as /open_item)
  const fileName = metadata.path.split('/').pop() || '';
  const fsname = fileName.toLowerCase();
  const bosonService = req.app?.locals?.bosonService;
  const baseUrl = getBaseUrl(req, bosonService);
  
  let appUid: string;
  let appName: string;
  let appIndexUrl: string;

  // Image files -> viewer
  if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') || 
      fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg') ||
      fsname.endsWith('.gif')) {
    appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
    appName = 'viewer';
    appIndexUrl = `${baseUrl}/apps/viewer/index.html`;
  }
  // Video/Audio files -> player
  else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') || 
           fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') || 
           fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi') ||
           fsname.endsWith('.wav') || fsname.endsWith('.flac')) {
    appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
    appName = 'player';
    appIndexUrl = `${baseUrl}/apps/player/index.html`;
  }
  // PDF files -> pdf
  else if (fsname.endsWith('.pdf')) {
    appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
    appName = 'pdf';
    appIndexUrl = `${baseUrl}/apps/pdf/index.html`;
  }
  // Text files -> editor
  else {
    appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
    appName = 'editor';
    appIndexUrl = `${baseUrl}/apps/editor/index.html`;
  }
  
  // Return array of app objects (matching Puter's suggest_app_for_fsentry format)
  const app = {
    uid: appUid,
    uuid: appUid,
    name: appName,
    title: appName.charAt(0).toUpperCase() + appName.slice(1),
    icon: hardcodedIcons[appName] || undefined,
    index_url: appIndexUrl,
  };
  
  // Generate file signature (same as /open_item) so viewer can access the file
  const actualFileUid = fileUid || `uuid-${metadata.path.replace(/\//g, '-')}`;
  const expires = Math.ceil(Date.now() / 1000) + 9999999999999; // Far future
  const signature = `sig-${actualFileUid}-${expires}`;
  
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = metadata.path.startsWith('/') ? metadata.path : '/' + metadata.path;
  
  const signatureObj = {
    uid: actualFileUid,
    expires: expires,
    signature: signature,
    url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
    read_url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
    write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
    metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
    fsentry_type: metadata.mime_type || 'application/octet-stream',
    fsentry_is_dir: metadata.is_dir,
    fsentry_name: fileName,
    fsentry_size: metadata.size,
    fsentry_accessed: metadata.updated_at,
    fsentry_modified: metadata.updated_at,
    fsentry_created: metadata.created_at,
    path: cleanPath,
  };
  
  logger.info('[SuggestApps] Returning app info', { appName, indexUrl: appIndexUrl });
  
  // Return both signature and suggested apps (matching /open_item format)
  res.json({
    signature: signatureObj, // Include signature so viewer can access file
    suggested_apps: [app],
  });
}

/**
 * Get file metadata by UID
 * GET /itemMetadata?uid=uuid-...
 */
export function handleItemMetadata(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const fileUid = req.query.uid as string;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!fileUid) {
    res.status(400).json({ error: 'Missing uid parameter' });
    return;
  }

  logger.info('[ItemMetadata] Request received', { uid: fileUid });

  // Convert UUID to path: uuid-/path/to/file -> /path/to/file
  const uuidPath = fileUid.replace(/^uuid-+/, '');
  let potentialPath = '/' + uuidPath.replace(/-/g, '/');
  
  // Remove leading wallet address if present
  const pathParts = potentialPath.split('/').filter(p => p);
  if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
    potentialPath = '/' + pathParts.join('/');
  }

  const metadata = filesystem.getFileMetadata(potentialPath, req.user.wallet_address);

  if (!metadata) {
    logger.warn('[ItemMetadata] File not found', { uid: fileUid, convertedPath: potentialPath });
    res.status(404).json({ error: 'File not found' });
    return;
  }

  logger.info('[ItemMetadata] File found', { path: metadata.path });

  res.json({
    uid: fileUid,
    name: metadata.path.split('/').pop() || '',
    path: metadata.path,
    is_dir: metadata.is_dir,
    size: metadata.size,
    type: metadata.mime_type || 'application/octet-stream',
    created: new Date(metadata.created_at).toISOString(),
    modified: new Date(metadata.updated_at).toISOString(),
    accessed: new Date(metadata.updated_at).toISOString(),
  });
}

/**
 * Write file using signed URL (for editor saves)
 * POST /writeFile?uid=...&signature=...&expires=...
 */
export async function handleWriteFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  logger.info('[WriteFile] 🔵 HANDLER CALLED', {
    path: req.path,
    method: req.method,
    query: req.query,
    hasUser: !!req.user,
    userWallet: req.user?.wallet_address
  });

  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const fileUid = req.query.uid as string;
  const signature = req.query.signature as string;

  if (!filesystem) {
    logger.error('[WriteFile] Filesystem not initialized');
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    logger.warn('[WriteFile] Unauthorized - no user in request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!fileUid) {
    logger.warn('[WriteFile] Missing uid parameter', { query: req.query });
    res.status(400).json({ error: 'Missing uid parameter' });
    return;
  }

  logger.info('[WriteFile] 🔵 Request received', { 
    uid: fileUid, 
    signature: signature ? signature.substring(0, 20) + '...' : 'none',
    method: req.method,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    hasBody: !!req.body,
    bodyType: typeof req.body,
    isBuffer: Buffer.isBuffer(req.body),
    bodyLength: Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'N/A'),
    walletAddress: req.user?.wallet_address
  });

  // Convert UUID to path: uuid-/path/to/file -> /path/to/file
  // UID format: uuid--0x34daf...-Desktop-filename.jpg (double dash because path starts with /)
  // First, try direct conversion
  const uuidPath = fileUid.replace(/^uuid-+/, '');
  let potentialPath = '/' + uuidPath.replace(/-/g, '/');
  
  // Remove leading wallet address if present (it's already in the path)
  const pathParts = potentialPath.split('/').filter(p => p);
  if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
    potentialPath = '/' + pathParts.join('/');
  }

  // Try to find file by converted path
  let existingMetadata = filesystem.getFileMetadata(potentialPath, req.user.wallet_address);

  // If not found, try database lookup by UUID (handles case sensitivity issues)
  if (!existingMetadata) {
    logger.info('[WriteFile] File not found by path conversion, trying UUID lookup', { 
      uid: fileUid, 
      convertedPath: potentialPath 
    });
    
    const db = (req.app.locals.db as any);
    if (db && typeof db.listFiles === 'function') {
      // listFiles takes (directoryPath, walletAddress) - use '/' to get all files
      const allFiles = db.listFiles('/', req.user.wallet_address);
      logger.info('[WriteFile] UUID lookup - searching files', { 
        totalFiles: allFiles.length,
        searchingFor: fileUid
      });
      for (const file of allFiles) {
        // Generate UUID the same way as frontend: uuid-${path.replace(/\//g, '-')}
        // CRITICAL: Make comparison case-insensitive to handle Desktop vs desktop mismatch
        const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
        const fileUuidLower = fileUuid.toLowerCase();
        const fileUidLower = fileUid.toLowerCase();
        if (fileUuidLower === fileUidLower) {
          existingMetadata = file;
          potentialPath = file.path; // Update potentialPath with the correct casing
          logger.info('[WriteFile] ✅ Found file by UUID lookup (case-insensitive)', { 
            uid: fileUid, 
            path: potentialPath,
            filePath: file.path,
            generatedUuid: fileUuid,
            matched: true
          });
          break;
        }
      }
      if (!existingMetadata) {
        logger.warn('[WriteFile] UUID not found in database', {
          searchedFiles: allFiles.length,
          sampleUuids: allFiles.slice(0, 3).map((f: any) => `uuid-${f.path.replace(/\//g, '-')}`)
        });
      }
    }
  }

  if (!existingMetadata) {
    logger.warn('[WriteFile] File not found for UID', { 
      uid: fileUid, 
      convertedPath: potentialPath,
      walletAddress: req.user.wallet_address
    });
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Get file content from request body
  // Support multiple formats: binary (Buffer), raw text, JSON with content field, multipart
  let fileContent: string | Buffer = '';
  const contentType = req.get('Content-Type') || '';
  
  logger.info('[WriteFile] Request received', { 
    contentType, 
    bodyType: typeof req.body, 
    isBuffer: Buffer.isBuffer(req.body),
    bodyLength: Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'N/A'),
    method: req.method,
    query: req.query
  });
  
  // Check if body is a Buffer (binary data - PDFs, images, etc.)
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    fileContent = req.body;
    logger.info('[WriteFile] ✅ Using body as binary Buffer', { 
      length: fileContent.length, 
      contentType,
      firstBytes: fileContent.slice(0, 16).toString('hex'),
      lastBytes: fileContent.slice(-16).toString('hex')
    });
  }
  // Check if body is a string (raw text)
  else if (typeof req.body === 'string' && req.body.length > 0) {
    fileContent = req.body;
    logger.info('[WriteFile] Using body as raw text', { length: fileContent.length });
  }
  // Check if body is an object with content/data/text field
  else if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    if ('content' in req.body) {
      fileContent = req.body.content;
    } else if ('data' in req.body) {
      fileContent = req.body.data;
    } else if ('text' in req.body) {
      fileContent = req.body.text;
    } else {
      // Body might be the content itself (for text/plain)
      if (contentType.includes('text/plain')) {
        fileContent = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }
  }

  // If no content found, try raw body buffer (for PUT requests with plain text)
  if (!fileContent && (req as any).rawBody) {
    // Check if rawBody is already a Buffer
    if (Buffer.isBuffer((req as any).rawBody)) {
      fileContent = (req as any).rawBody;
      logger.info('[WriteFile] Using rawBody as Buffer', { length: fileContent.length });
    } else {
      fileContent = (req as any).rawBody.toString('utf8');
      logger.info('[WriteFile] Using rawBody as text', { length: fileContent.length });
    }
  }

  if (!fileContent || (typeof fileContent === 'string' && fileContent.length === 0) || (Buffer.isBuffer(fileContent) && fileContent.length === 0)) {
    logger.warn('[WriteFile] No file content found in request', {
      hasFileContent: !!fileContent,
      fileContentType: typeof fileContent,
      fileContentLength: Buffer.isBuffer(fileContent) ? fileContent.length : (typeof fileContent === 'string' ? fileContent.length : 'N/A'),
      contentType,
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : 'N/A'
    });
    res.status(400).json({ error: 'No file content provided' });
    return;
  }

  try {
    // Write file content
    // If already a Buffer (binary data), use it directly; otherwise convert string to Buffer
    const contentBuffer = Buffer.isBuffer(fileContent)
      ? fileContent
      : typeof fileContent === 'string'
        ? Buffer.from(fileContent, 'utf8')
        : Buffer.from(fileContent);

    const updatedMetadata = await filesystem.writeFile(
      potentialPath,
      contentBuffer,
      req.user.wallet_address,
      {
        mimeType: existingMetadata.mime_type || undefined
      }
    );

    logger.info('[WriteFile] ✅ File updated successfully', { 
      path: updatedMetadata.path, 
      size: updatedMetadata.size,
      newIPFSHash: updatedMetadata.ipfs_hash?.substring(0, 20) + '...',
      oldIPFSHash: existingMetadata?.ipfs_hash?.substring(0, 20) + '...',
      hashChanged: updatedMetadata.ipfs_hash !== existingMetadata?.ipfs_hash,
      contentSize: contentBuffer.length,
      walletAddress: req.user.wallet_address
    });

    // Broadcast item.updated event to refresh desktop thumbnail
    const io = (req.app.locals.io as SocketIOServer | undefined);
    if (io) {
      // Build read URL for thumbnail (images use read URL as thumbnail)
      // Include cache-busting parameter using IPFS hash to ensure fresh thumbnail
      const isHttps = req.protocol === 'https';
      const baseUrl = isHttps 
        ? `https://${req.get('host')}`
        : `http://${req.get('host')}`;
      
      // For image files, include thumbnail URL with cache-busting
      let thumbnail: string | undefined = undefined;
      if (updatedMetadata.mime_type?.startsWith('image/')) {
        const cacheBuster = updatedMetadata.ipfs_hash 
          ? `_cid=${updatedMetadata.ipfs_hash.substring(0, 16)}`
          : `_t=${Date.now()}`;
        thumbnail = `${baseUrl}/read?file=${encodeURIComponent(updatedMetadata.path)}&${cacheBuster}`;
      }
      
      broadcastItemUpdated(io, req.user.wallet_address, {
        uid: fileUid,
        name: updatedMetadata.path.split('/').pop() || '',
        path: updatedMetadata.path,
        size: updatedMetadata.size,
        modified: new Date(updatedMetadata.updated_at).toISOString(),
        original_client_socket_id: null,
        thumbnail: thumbnail, // Include thumbnail URL with cache-busting for image files
        type: updatedMetadata.mime_type || undefined,
        is_dir: false
      });
      
      logger.info('[WriteFile] 📡 Broadcasted item.updated event for thumbnail refresh', {
        path: updatedMetadata.path,
        hasThumbnail: !!thumbnail,
        mimeType: updatedMetadata.mime_type
      });
    } else {
      logger.warn('[WriteFile] ⚠️ WebSocket server not available, cannot broadcast thumbnail update');
    }

    // Return file metadata (include IPFS hash for cache-busting)
    res.json({
      uid: fileUid,
      name: updatedMetadata.path.split('/').pop() || '',
      path: updatedMetadata.path,
      is_dir: false,
      size: updatedMetadata.size,
      type: updatedMetadata.mime_type || 'application/octet-stream',
      created: new Date(updatedMetadata.created_at).toISOString(),
      modified: new Date(updatedMetadata.updated_at).toISOString(),
      ipfs_hash: updatedMetadata.ipfs_hash, // Include IPFS hash so frontend can verify update
    });
  } catch (error) {
    logger.error('[WriteFile] Error writing file:', error);
    res.status(500).json({
      error: 'Failed to write file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Set desktop background
 * POST /set-desktop-bg
 */
export function handleSetDesktopBg(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const body = req.body as { url?: string; color?: string; fit?: string };

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Normalize wallet address to lowercase for consistent KV store keys
    const walletAddress = req.user.wallet_address.toLowerCase();

    // Save desktop background settings to KV store
    if (body.url !== undefined) {
      const kvKey = `${walletAddress}:user_preferences.desktop_bg_url`;
      db.setSetting(kvKey, body.url);
    }

    if (body.color !== undefined) {
      const kvKey = `${walletAddress}:user_preferences.desktop_bg_color`;
      db.setSetting(kvKey, body.color || null);
    }

    if (body.fit !== undefined) {
      const kvKey = `${walletAddress}:user_preferences.desktop_bg_fit`;
      db.setSetting(kvKey, body.fit || 'cover');
    }

    logger.info('[SetDesktopBg] Desktop background saved', {
      walletAddress,
      url: body.url,
      color: body.color,
      fit: body.fit
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('[SetDesktopBg] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to save desktop background',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Set profile picture
 * POST /set-profile-picture
 */
export function handleSetProfilePicture(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const body = req.body as { url?: string };

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Normalize wallet address to lowercase for consistent KV store keys
    const walletAddress = req.user.wallet_address.toLowerCase();

    // Save profile picture path to KV store
    if (body.url !== undefined) {
      const kvKey = `${walletAddress}:user_preferences.profile_picture_url`;
      db.setSetting(kvKey, body.url);
      logger.info('[SetProfilePicture] Saving profile picture to KV store', {
        kvKey,
        url: body.url
      });
    }

    logger.info('[SetProfilePicture] Profile picture saved', {
      walletAddress,
      url: body.url
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('[SetProfilePicture] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to save profile picture',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/wallets
 * Returns list of trusted wallets for the authenticated user
 */
export function handleGetWallets(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = (req.app.locals.db as any);
    const walletAddress = req.user.wallet_address;
    
    // Get trusted wallets from database (if supported)
    // For now, return empty list - wallets feature can be added later
    res.json({
      wallets: [],
      owner: walletAddress
    });
  } catch (error) {
    logger.error('[GetWallets] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to get wallets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

