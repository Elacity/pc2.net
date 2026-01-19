/**
 * Info Endpoints
 *
 * Additional endpoints needed by the frontend
 */
import { broadcastFileChange, broadcastItemAdded } from '../websocket/events.js';
import { logger } from '../utils/logger.js';
/**
 * Get API info
 * GET /api/info
 */
export function handleAPIInfo(req, res) {
    res.json({
        version: '2.5.1',
        server: 'pc2-node',
        features: {
            file_storage: true,
            real_time: true,
            authentication: true
        }
    });
}
/**
 * Get launch apps
 * GET /get-launch-apps
 * Returns apps available in the start menu
 */
export function handleGetLaunchApps(req, res) {
    const iconSize = parseInt(req.query.icon_size) || 64;
    const baseUrl = req.protocol + '://' + req.get('host');
    // Helper function to load SVG icon as base64
    // ALWAYS uses hardcoded base64 icons for 100% isolation - no file system dependencies
    const loadIconAsBase64 = (appName) => {
        try {
            // Hardcoded base64 icons (matching mock server)
            // This ensures 100% isolation - no external dependencies
            const hardcodedIcons = {
                'editor': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiM2MzY2RjEiLz48cGF0aCBkPSJNMjQgMTJDMjAgMTIgMTcgMTUgMTcgMTlWMjlDMTcgMzMgMjAgMzYgMjQgMzZDMjggMzYgMzEgMzMgMzEgMjlWMTlDMzEgMTUgMjggMTIgMjQgMTJaIiBmaWxsPSIjRkZGRkZGIi8+PHBhdGggZD0iTTIyIDI0SDI2VjI4SDIyVjI0WiIgZmlsbD0iIzYzNjZGMTIiLz48L3N2Zz4=',
                'viewer': 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIGJhc2VQcm9maWxlPSJ0aW55LXBzIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KCTx0aXRsZT5hcHAtaWNvbi12aWV3ZXItc3ZnPC90aXRsZT4KCTxkZWZzPgoJCTxsaW5lYXJHcmFkaWVudCBpZD0iZ3JkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiICB4MT0iNDciIHkxPSIzOS41MTQiIHgyPSIxIiB5Mj0iOC40ODYiPgoJCQk8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMzYzYWQiICAvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM1Njg0ZjUiICAvPgoJCTwvbGluZWFyR3JhZGllbnQ+Cgk8L2RlZnM+Cgk8c3R5bGU+CgkJdHNwYW4geyB3aGl0ZS1zcGFjZTpwcmUgfQoJCS5zaHAwIHsgZmlsbDogdXJsKCNncmQxKSB9IAoJCS5zaHAxIHsgZmlsbDogI2ZmZDc2NCB9IAoJCS5zaHAyIHsgZmlsbDogI2NiZWFmYiB9IAoJPC9zdHlsZT4KCTxnIGlkPSJMYXllciI+CgkJPHBhdGggaWQ9IlNoYXBlIDEiIGNsYXNzPSJzaHAwIiBkPSJNMSAxTDQ3IDFMNDcgNDdMMSA0N0wxIDFaIiAvPgoJCTxwYXRoIGlkPSJMYXllciIgY2xhc3M9InNocDEiIGQ9Ik0xOCAxOEMxNS43OSAxOCAxNCAxNi4yMSAxNCAxNEMxNCAxMS43OSAxNS43OSAxMCAxOCAxMEMyMC4yMSAxMCAyMiAxMS43OSAyMiAxNEMyMiAxNi4yMSAyMC4yMSAxOCAxOCAxOFoiIC8+CgkJPHBhdGggaWQ9IkxheWVyIiBjbGFzcz0ic2hwMiIgZD0iTTM5Ljg2IDM2LjUxQzM5LjgyIDM2LjU4IDM5Ljc3IDM2LjY1IDM5LjcgMzYuNzFDMzkuNjQgMzYuNzcgMzkuNTcgMzYuODIgMzkuNSAzNi44N0MzOS40MiAzNi45MSAzOS4zNCAzNi45NCAzOS4yNiAzNi45N0MzOS4xNyAzNi45OSAzOS4wOSAzNyAzOSAzN0w5IDM3QzguODIgMzcgOC42NCAzNi45NSA4LjQ5IDM2Ljg2QzguMzMgMzYuNzYgOC4yIDM2LjYzIDguMTIgMzYuNDdDOC4wMyAzNi4zMSA3Ljk5IDM2LjEzIDggMzUuOTVDOC4wMSAzNS43NyA4LjA3IDM1LjYgOC4xNyAzNS40NEwxNC4xNyAyNi40NUMxNC4yNCAyNi4zNCAxNC4zMyAyNi4yNCAxNC40NCAyNi4xN0MxNC41NSAyNi4xIDE0LjY4IDI2LjA0IDE0LjggMjYuMDJDMTQuOTMgMjUuOTkgMTUuMDcgMjUuOTkgMTUuMTkgMjYuMDJDMTUuMzIgMjYuMDQgMTUuNDUgMjYuMSAxNS41NSAyNi4xN0MxNS41NyAyNi4xOCAxNS41OCAyNi4xOSAxNS42IDI2LjJDMTUuNjEgMjYuMjEgMTUuNjIgMjYuMjIgMTUuNjMgMjYuMjNDMTUuNjUgMjYuMjQgMTUuNjYgMjYuMjUgMTUuNjcgMjYuMjZDMTUuNjggMjYuMjcgMTUuNyAyNi4yOCAxNS43MSAyNi4yOUwyMC44NiAzMS40NUwyOS4xOCAxOS40M0MyOS4yMyAxOS4zNiAyOS4yOCAxOS4zIDI5LjM1IDE5LjI0QzI5LjQxIDE5LjE5IDI5LjQ4IDE5LjE0IDI5LjU2IDE5LjFDMjkuNjMgMTkuMDYgMjkuNzEgMTkuMDQgMjkuNzkgMTkuMDJDMjkuODggMTkgMjkuOTYgMTkgMzAuMDUgMTlDMzAuMTMgMTkgMzAuMjEgMTkuMDIgMzAuMjkgMTkuMDRDMzAuMzggMTkuMDcgMzAuNDUgMTkuMSAzMC41MiAxOS4xNUMzMC42IDE5LjE5IDMwLjY2IDE5LjI1IDMwLjcyIDE5LjMxQzMwLjc4IDE5LjM3IDMwLjgzIDE5LjQ0IDMwLjg3IDE5LjUxTDM5Ljg3IDM1LjUxQzM5LjkxIDM1LjU5IDM5Ljk1IDM1LjY3IDM5Ljk3IDM1Ljc1QzM5Ljk5IDM1Ljg0IDQwIDM1LjkyIDQwIDM2LjAxQzQwIDM2LjEgMzkuOTkgMzYuMTggMzkuOTYgMzYuMjdDMzkuOTQgMzYuMzUgMzkuOTEgMzYuNDMgMzkuODYgMzYuNTFaIiAvPgoJPC9nPgo8L3N2Zz4=',
                'player': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZGIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDUxMi4wMDEgNTEyLjAwMSIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNTEyLjAwMSA1MTIuMDAxOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cGF0aCBzdHlsZT0iZmlsbDojNTE1MDRFOyIgZD0iTTQ5MC42NjUsNDMuNTU3SDIxLjMzM0M5LjU1Miw0My41NTcsMCw1My4xMDgsMCw2NC44OXYzODIuMjJjMCwxMS43ODIsOS41NTIsMjEuMzM0LDIxLjMzMywyMS4zMzQNCgloNDY5LjMzMmMxMS43ODMsMCwyMS4zMzUtOS41NTIsMjEuMzM1LTIxLjMzNFY2NC44OUM1MTIsNTMuMTA4LDUwMi40NDgsNDMuNTU3LDQ5MC42NjUsNDMuNTU3eiBNOTkuMDMsNDI3LjA1MUg1Ni4yNjd2LTM4LjA2OQ0KCUg5OS4wM1Y0MjcuMDUxeiBNOTkuMDMsMTIzLjAxOUg1Ni4yNjd2LTM4LjA3SDk5LjAzVjEyMy4wMTl6IE0xODguMjA2LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeiBNMTg4LjIwNiwxMjMuMDE5DQoJaC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNMjc3LjM4Miw0MjcuMDUxaC00Mi43NjR2LTM4LjA2OWg0Mi43NjRWNDI3LjA1MXogTTI3Ny4zODIsMTIzLjAxOWgtNDIuNzY0di0zOC4wN2g0Mi43NjRWMTIzLjAxOQ0KCXogTTM2Ni41NTcsNDI3LjA1MWgtNDIuNzYzdi0zOC4wNjloNDIuNzYzVjQyNy4wNTF6IE0zNjYuNTU3LDEyMy4wMTloLTQyLjc2M3YtMzguMDdoNDIuNzYzVjEyMy4wMTl6IE00NTUuNzMzLDQyNy4wNTFINDEyLjk3DQoJdi0zOC4wNjloNDIuNzY0djM4LjA2OUg0NTUuNzMzeiBNNDU1LjczMywxMjMuMDE5SDQxMi45N3YtMzguMDdoNDIuNzY0djM4LjA3SDQ1NS43MzN6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNkI2OTY4OyIgZD0iTTQ5MC42NjUsNDMuNTU3SDEzMy44MWMtMTYuMzQzLDM4Ljg3Ny0yNS4zODEsODEuNTgtMjUuMzgxLDEyNi4zOTYNCgljMCwxMzMuMTkyLDc5Ljc4MiwyNDcuNzM0LDE5NC4xNTUsMjk4LjQ5aDE4OC4wODJjMTEuNzgzLDAsMjEuMzM1LTkuNTUyLDIxLjMzNS0yMS4zMzRWNjQuODkNCglDNTEyLDUzLjEwOCw1MDIuNDQ4LDQzLjU1Nyw0OTAuNjY1LDQzLjU1N3ogTTE4OC4yMDYsMTIzLjAxOWgtNDIuNzYzdi0zOC4wN2g0Mi43NjNWMTIzLjAxOXogTTI3Ny4zODIsNDI3LjA1MWgtNDIuNzY0di0zOC4wNjkNCgloNDIuNzY0VjQyNy4wNTF6IE0yNzcuMzgyLDEyMy4wMTloLTQyLjc2NHYtMzguMDdoNDIuNzY0VjEyMy4wMTl6IE0zNjYuNTU3LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeg0KCSBNMzY2LjU1NywxMjMuMDE5aC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNNDU1LjczMyw0MjcuMDUxSDQxMi45N3YtMzguMDY5aDQyLjc2NHYzOC4wNjlINDU1LjczM3ogTTQ1NS43MzMsMTIzLjAxOUg0MTIuOTcNCgl2LTM4LjA3aDQyLjc2NHYzOC4wN0g0NTUuNzMzeiIvPg0KPHBhdGggc3R5bGU9ImZpbGw6Izg4RENFNTsiIGQ9Ik0zMTguNjEyLDI0My42NTdsLTExMi44OC01Ni40NGMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDQNCgljMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDExMi44OC01Ni40MzljNC42NzQtMi4zMzgsNy42MjgtNy4xMTcsNy42MjgtMTIuMzQ1DQoJQzMyNi4yNCwyNTAuNzc0LDMyMy4yODYsMjQ1Ljk5NSwzMTguNjEyLDI0My42NTd6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNzRDNEM0OyIgZD0iTTIxMS41MTUsMTk5LjU2MmMwLTIuOTY4LDAuOTU3LTUuODAyLDIuNjUyLTguMTI4bC04LjQzNS00LjIxOA0KCWMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDRjMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDguNDMzLTQuMjE3DQoJQzIxMC41MDgsMzE1LjU0NywyMTEuNTE1LDMyMS45NjksMjExLjUxNSwxOTkuNTYyeiIvPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPC9zdmc+DQo=',
                'pdf': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE4LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZGIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDU2IDU2IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCA1NiA1NjsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPGc+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0U5RTlFMDsiIGQ9Ik0zNi45ODUsMEg3Ljk2M0M3LjE1NSwwLDYuNSwwLjY1NSw2LjUsMS45MjZWNTVjMCwwLjM0NSwwLjY1NSwxLDEuNDYzLDFoNDAuMDc0DQoJCWMwLjgwOCwwLDEuNDYzLTAuNjU1LDEuNDYzLTFWMTIuOTc4YzAtMC42OTYtMC4wOTMtMC45Mi0wLjI1Ny0xLjA4NUwzNy42MDcsMC4yNTdDMzcuNDQyLDAuMDkzLDM3LjIxOCwwLDM2Ljk4NSwweiIvPg0KCTxwb2x5Z29uIHN0eWxlPSJmaWxsOiNEOUQ3Q0E7IiBwb2ludHM9IjM3LjUsMC4xNTEgMzcuNSwxMiA0OS4zNDksMTIgCSIvPg0KCTxwYXRoIHN0eWxlPSJmaWxsOiNDQzRCNEM7IiBkPSJNMTkuNTE0LDMzLjMyNEwxOS41MTQsMzMuMzI0Yy0wLjM0OCwwLTAuNjgyLTAuMTEzLTAuOTY3LTAuMzI2DQoJCWMtMS4wNDEtMC43ODEtMS4xODEtMS42NS0xLjExNS0yLjI0MmMwLjE4Mi0xLjYyOCwyLjE5NS0zLjMzMiw1Ljk4NS01LjA2OGMxLjUwNC0zLjI5NiwyLjkzNS03LjM1NywzLjc4OC0xMC43NQ0KCQljLTAuOTk4LTIuMTcyLTEuOTY4LTQuOTkwLTEuMjYxLTYuNjQzYzAuMjQ4LTAuNTc5LDAuNTU3LTEuMDIzLDEuMTM0LTEuMjE1YzAuMjI4LTAuMDc2LDAuODA0LTAuMTcyLDEuMDE2LTAuMTcyDQoJCWMwLjUwNCwwLDAuOTQ3LDAuNjQ5LDEuMjYxLDEuMDQ5YzAuMjk1LDAuMzc2LDAuOTY0LDEuMTczLTAuMzczLDYuODAyYzEuMzQ4LDIuNzg0LDMuMjU4LDUuNjIsNS4wODgsNy41NjINCgkJYzEuMzExLTAuMjM3LDIuNDM5LTAuMzU4LDMuMzU4LTAuMzU4YzEuNTY2LDAsMi41MTUsMC4zNjUsMi45MDIsMS4xMTdjMC4zMiwwLjYyMiwwLjE4OSwxLjM0OS0wLjM5LDIuMTYNCgkJYy0wLjU1NywwLjc3OS0xLjMyNSwxLjE5MS0yLjIyLDEuMTkxYy0xLjIxNiwwLTIuNjMyLTAuNzY4LTQuMjExLTIuMjg1Yy0yLjgzNywwLjU5My02LjE1LDEuNjUxLTguODI4LDIuODIyDQoJCWMtMC44MzYsMS43NzQtMS42MzcsMy4yMDMtMi4zODMsNC4yNTFDMjEuMjczLDMyLjY1NCwyMC4zODksMzMuMzI0LDE5LjUxNCwzMy4zMjR6IE0yMi4xNzYsMjguMTk4DQoJCWMtMi4xMzcsMS4yMDEtMy4wMDgsMi4xODgtMy4wNzEsMi43NDRjLTAuMDEsMC4wOTItMC4wMzcsMC4zMzQsMC40MzEsMC42OTJDMjAuNjg1LDMxLjU4NywyMS41NTUsMzEuMTksMjIuMTc2LDI4LjE5OHoNCgkJIE0zNS44MTMsMjMuNzU2YzAuODE1LDAuNjI3LDEuMDE0LDAuOTQ0LDEuNTQ3LDAuOTQ0YzAuMjM0LDAsMC45MDEtMC4wMSwxLjIxLTAuNDQxYzAuMTQ5LTAuMjA5LDAuMjA3LTAuMzQzLDAuMjMtMC40MTUNCgkJYy0wLjEyMy0wLjA2NS0wLjI4Ni0wLjE5Ny0xLjE3NS0wLjE5N0MzNy4xMiwyMy42NDgsMzYuNDg1LDIzLjY3LDM1LjgxMywyMy43NTZ6IE0yOC4zNDMsMTcuMTc0DQoJCWMtMC43MTUsMi40NzQtMS42NTksNS4xNDUtMi42NzQsNy41NjRjMi4wOS0wLjgxMSw0LjM2Mi0xLjUxOSw2LjQ5Ni0yLjAyQzMwLjgxNSwyMS4xNSwyOS40NjYsMTkuMTkyLDI4LjM0MywxNy4xNzR6Ii8+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0NDNEI0QzsiIGQ9Ik00OC4wMzcsNTZINy45NjNDNy4xNTUsNTYsNi41LDU1LjM0NSw2LjUsNTQuNTM3VjM5aDQzdjE1LjUzN0M0OS41LDU1LjM0NSw0OC44NDUsNTYsNDguMDM3LDU2eiIvPg0KCTxnPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTE3LjM4NSw1M2gtMS42NDFWNDIuOTI0aDIuODk4YzAuNDI4LDAsMC44NTIsMC4wNjgsMS4yNzEsMC4yMDUNCgkJCWMwLjQxOSwwLjEzNywwLjc5NSwwLjM0MiwxLjEyOCwwLjYxNWMwLjMzMywwLjI3MywwLjYwMiwwLjYwNCwwLjgwNywwLjk5MXMwLjMwOCwwLjgyMiwwLjMwOCwxLjMwNg0KCQkJYzAsMC41MTEtMC4wODcsMC45NzMtMC4yNiwxLjM4OGMtMC4xNzMsMC40MTUtMC40MTUsMC43NjQtMC43MjUsMS4wNDZjLTAuMzEsMC4yODItMC42ODQsMC41MDEtMS4xMjEsMC42NTYNCgkJCXMtMC45MjEsMC4yMzItMS40NDksMC4yMzJoLTEuMjE3VjUzeiBNMTcuMzg1LDQ0LjE2OHYzLjk5MmgxLjUwNGMwLjIsMCwwLjM5OC0wLjAzNCwwLjU5NS0wLjEwMw0KCQkJYzAuMTk2LTAuMDY4LDAuMzc2LTAuMTgsMC41NC0wLjMzNWMwLjE2NC0wLjE1NSwwLjI5Ni0wLjM3MSwwLjM5Ni0wLjY0OWMwLjEtMC4yNzgsMC4xNS0wLjYyMiwwLjE1LTEuMDMyDQoJCQljMC0wLjE2NC0wLjAyMy0wLjM1NC0wLjA2OC0wLjU2N2MtMC4wNDYtMC4yMTQtMC4xMzktMC40MTktMC4yOC0wLjYxNWMtMC4xNDItMC4xOTYtMC4zNC0wLjM2LTAuNTk1LTAuNDkyDQoJCQljLTAuMjU1LTAuMTMyLTAuNTkzLTAuMTk4LTEuMDEyLTAuMTk4SDE3LjM4NXoiLz4NCgkJPHBhdGggc3R5bGU9ImZpbGw6I0ZGRkZGRjsiIGQ9Ik0zMi4yMTksNDcuNjgyYzAsMC44MjktMC4wODksMS41MzgtMC4yNjcsMi4xMjZzLTAuNDAzLDEuMDgtMC42NzcsMS40NzdzLTAuNTgxLDAuNzA5LTAuOTIzLDAuOTM3DQoJCQlzLTAuNjcyLDAuMzk4LTAuOTkxLDAuNTEzYy0wLjMxOSwwLjExNC0wLjYxMSwwLjE4Ny0wLjg3NSwwLjIxOUMyOC4yMjIsNTIuOTg0LDI4LjAyNiw1MywyNy44OTgsNTNoLTMuODE0VjQyLjkyNGgzLjAzNQ0KCQkJYzAuODQ4LDAsMS41OTMsMC4xMzUsMi4yMzUsMC40MDNzMS4xNzYsMC42MjcsMS42LDEuMDczczAuNzQsMC45NTUsMC45NSwxLjUyNEMzMi4xMTQsNDYuNDk0LDMyLjIxOSw0Ny4wOCwzMi4yMTksNDcuNjgyeg0KCQkJIE0yNy4zNTIsNTEuNzk3YzEuMTEyLDAsMS45MTQtMC4zNTUsMi40MDYtMS4wNjZzMC43MzgtMS43NDEsMC43MzgtMy4wOWMwLTAuNDE5LTAuMDUtMC44MzQtMC4xNS0xLjI0NA0KCQkJYy0wLjEwMS0wLjQxLTAuMjk0LTAuNzgxLTAuNTgxLTEuMTE0cy0wLjY3Ny0wLjYwMi0xLjE2OS0wLjgwN3MtMS4xMy0wLjMwOC0xLjkxNC0wLjMwOGgtMC45NTd2Ny42MjlIMjcuMzUyeiIvPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTM2LjI2Niw0NC4xNjh2My4xNzJoNC4yMTF2MS4xMjFoLTQuMjExVjUzaC0xLjY2OFY0Mi45MjRINDAuOXYxLjI0NEgzNi4yNjZ6Ii8+DQoJPC9nPg0KPC9nPg0KPC9zdmc+DQo=',
                'camera': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiM0MkE1RjUiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjMiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSI2IiBmaWxsPSIjRkZGRkZGIi8+PC9zdmc+',
                'app-center': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiM0YjU1NjMiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSIjRUY0NDQ0Ii8+PHBvbHlnb24gcG9pbnRzPSIyNiwxMCAyOCwxNCAyNCwxNCIgZmlsbD0iI0ZGNkE0MCIvPjxwYXRoIGQ9Ik0yNiwyNkgzMkMyOCwyOCAyNiwzMCAyNiwzMlYyNloiIGZpbGw9IiM0MkE1RjUiLz48cmVjdCB4PSIzMiIgeT0iMzIiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiM5QzI3QkIiLz48L3N2Zz4=',
                'recorder': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNGRjY5MDAiLz48cGF0aCBkPSJNMjQgMTJDMjAgMTIgMTcgMTUgMTcgMTlWMjlDMTcgMzMgMjAgMzYgMjQgMzZDMjggMzYgMzEgMzMgMzEgMjlWMTlDMzEgMTUgMjggMTIgMjQgMTJaIiBmaWxsPSIjRkZGRkZGIi8+PHJlY3QgeD0iMTkiIHk9IjI2IiB3aWR0aD0iMTAiIGhlaWdodD0iNCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
                'solitaire-frvr': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB4PSIxMiIgeT0iMTAiIHdpZHRoPSI4IiBoZWlnaHQ9IjEyIiByeD0iMiIgZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIvPjx0ZXh0IHg9IjE2IiB5PSIyMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5BPC90ZXh0PjxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjMiIGZpbGw9IiNGRjAwMDAiLz48cmVjdCB4PSIyNCIgeT0iMTAiIHdpZHRoPSI4IiBoZWlnaHQ9IjEyIiByeD0iMiIgZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIvPjx0ZXh0IHg9IjI4IiB5PSIyMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5BPC90ZXh0PjxjaXJjbGUgY3g9IjI4IiBjeT0iMTYiIHI9IjMiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
                'terminal': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyBzdHlsZT0iZmlsdGVyOiBkcm9wLXNoYWRvdyggMHB4IDFweCAxcHggcmdiYSgwLCAwLCAwLCAuNSkpOyIgaGVpZ2h0PSI0OCIgd2lkdGg9IjQ4IiB2aWV3Qm94PSIwIDAgNDggNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHRpdGxlPndpbmRvdyBjb2RlPC90aXRsZT4KICA8ZyBjbGFzcz0ibmMtaWNvbi13cmFwcGVyIiBzdHlsZT0iIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjk5NzcyNiwgMCwgMCwgMS4xMDI3NDgsIC0wLjAwMjc5MSwgLTIuODA5NzIxKSI+CiAgICA8cGF0aCBkPSJNIDQ1LjA5OCA0NS4zNjIgTCAzLjAwNCA0NS4zNjIgQyAxLjg5NyA0NS4zNjIgMSA0NC40NTkgMSA0My4zNDUgTCAxIDUuMDE3IEMgMSAzLjkwMyAxLjg5NyAzIDMuMDA0IDMgTCA0NS4wOTggMyBDIDQ2LjIwNiAzIDQ3LjEwMyAzLjkwMyA0Ny4xMDMgNS4wMTcgTCA0Ny4xMDMgNDMuMzQ1IEMgNDcuMTAzIDQ0LjQ1OSA0Ni4yMDYgNDUuMzYyIDQ1LjA5OCA0NS4zNjIgWiIgc3R5bGU9ImZpbGwtcnVsZTogbm9uemVybzsgcGFpbnQtb3JkZXI6IGZpbGw7IiBmaWxsPSIjZTNlNWVjIi8+CiAgICA8cmVjdCB4PSIzLjAwNCIgeT0iMTAuMDYiIGZpbGw9IiMyZTM3NDQiIHdpZHRoPSI0Mi4wOTQiIGhlaWdodD0iMzMuMjg0IiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDEwLjAyIDMxLjI0MSBDIDkuNzY0IDMxLjI0MSA5LjUwNyAzMS4xNDIgOS4zMTIgMzAuOTQ2IEMgOC45MiAzMC41NTEgOC45MiAyOS45MTQgOS4zMTIgMjkuNTIgTCAxMi42MTIgMjYuMTk4IEwgOS4zMTIgMjIuODc3IEMgOC45MiAyMi40ODIgOC45MiAyMS44NDUgOS4zMTIgMjEuNDUxIEMgOS43MDMgMjEuMDU2IDEwLjMzNyAyMS4wNTYgMTAuNzI5IDIxLjQ1MSBMIDE0LjczOCAyNS40ODUgQyAxNS4xMyAyNS44NzkgMTUuMTMgMjYuNTE3IDE0LjczOCAyNi45MTEgTCAxMC43MjkgMzAuOTQ2IEMgMTAuNTMzIDMxLjE0MiAxMC4yNzcgMzEuMjQxIDEwLjAyIDMxLjI0MSBaIiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDI4LjA2IDMxLjI0MSBMIDIwLjA0MyAzMS4yNDEgQyAxOS40ODkgMzEuMjQxIDE5LjA0IDMwLjc4OSAxOS4wNCAzMC4yMzMgQyAxOS4wNCAyOS42NzYgMTkuNDg5IDI5LjIyNCAyMC4wNDMgMjkuMjI0IEwgMjguMDYgMjkuMjI0IEMgMjguNjE0IDI5LjIyNCAyOS4wNjMgMjkuNjc2IDI5LjA2MyAzMC4yMzMgQyAyOS4wNjMgMzAuNzg5IDI4LjYxNCAzMS4yNDEgMjguMDYgMzEuMjQxIFoiIHN0eWxlPSIiLz4KICA8L2c+Cjwvc3ZnPg==',
                'system-terminal': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSI0IiBmaWxsPSIjMWExYTJlIi8+PHJlY3QgeD0iMiIgeT0iOCIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjM2IiByeD0iMiIgZmlsbD0iIzFhMWEyZSIgc3Ryb2tlPSIjZTk0NTYwIiBzdHJva2Utd2lkdGg9IjIiLz48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iNDQiIGhlaWdodD0iNiIgZmlsbD0iIzE2MjEzZSIvPjxjaXJjbGUgY3g9IjgiIGN5PSI1IiByPSIyIiBmaWxsPSIjZTk0NTYwIi8+PGNpcmNsZSBjeD0iMTUiIGN5PSI1IiByPSIyIiBmaWxsPSIjNGFkZTgwIi8+PGNpcmNsZSBjeD0iMjIiIGN5PSI1IiByPSIyIiBmaWxsPSIjZmZkNzY0Ii8+PHBhdGggZD0iTTggMjBMNCAyNEw4IDI4IiBzdHJva2U9IiM0YWRlODAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBmaWxsPSJub25lIi8+PHJlY3QgeD0iMTIiIHk9IjMwIiB3aWR0aD0iMjAiIGhlaWdodD0iMyIgZmlsbD0iI2U5NDU2MCIvPjx0ZXh0IHg9IjE0IiB5PSIyNiIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMCIgZmlsbD0iI2ZmZiI+JF8kPC90ZXh0Pjwvc3ZnPg==',
                'calculator': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiM2NjdlZWEiLz48cmVjdCB4PSI4IiB5PSI4IiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI0IiBmaWxsPSIjRkZGRkZGIi8+PHJlY3QgeD0iMTIiIHk9IjE0IiB3aWR0aD0iMjQiIGhlaWdodD0iNCIgcng9IjIiIGZpbGw9IiM2NjdlZWEiLz48cmVjdCB4PSIxMiIgeT0iMjIiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHJ4PSIyIiBmaWxsPSIjNjY3ZWVhIi8+PHJlY3QgeD0iMjIiIHk9IjIyIiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiByeD0iMiIgZmlsbD0iIzY2N2VlYSIvPjxyZWN0IHg9IjMyIiB5PSIyMiIgd2lkdGg9IjgiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9IiM2NjdlZWEiLz48cmVjdCB4PSIxMiIgeT0iMzIiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHJ4PSIyIiBmaWxsPSIjNjY3ZWVhIi8+PHJlY3QgeD0iMjIiIHk9IjMyIiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiByeD0iMiIgZmlsbD0iIzY2N2VlYSIvPjxyZWN0IHg9IjMyIiB5PSIzMiIgd2lkdGg9IjgiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9IiM2NjdlZWEiLz48L3N2Zz4='
            };
            // Return hardcoded icon if available
            if (hardcodedIcons[appName]) {
                return hardcodedIcons[appName];
            }
            // Icon not found
            return undefined;
        }
        catch (error) {
            logger.warn(`[get-launch-apps] Error loading icon for ${appName}:`, error);
            return undefined;
        }
    };
    // Define available apps (these match the apps in src/backend/apps/)
    const apps = [
        {
            name: 'editor',
            title: 'Text Editor',
            uuid: 'app-editor',
            icon: loadIconAsBase64('editor'),
            description: 'Code and text editor with syntax highlighting'
        },
        {
            name: 'viewer',
            title: 'Image Viewer',
            uuid: 'app-viewer',
            icon: loadIconAsBase64('viewer'),
            description: 'View and edit images'
        },
        {
            name: 'player',
            title: 'Media Player',
            uuid: 'app-player',
            icon: loadIconAsBase64('player'),
            description: 'Play audio and video files'
        },
        {
            name: 'camera',
            title: 'Camera',
            uuid: 'app-camera',
            icon: loadIconAsBase64('camera'),
            description: 'Take photos and videos'
        },
        {
            name: 'app-center',
            title: 'App Center',
            uuid: 'app-app-center',
            icon: loadIconAsBase64('app-center'),
            description: 'Browse and install apps'
        },
        {
            name: 'pdf',
            title: 'PDF',
            uuid: 'app-pdf',
            icon: loadIconAsBase64('pdf'),
            description: 'View PDF documents'
        },
        {
            name: 'system-terminal',
            title: 'Terminal',
            uuid: 'app-system-terminal',
            icon: loadIconAsBase64('terminal'),
            description: 'Real shell access to your PC2 node',
            pc2_exclusive: true
        },
        {
            name: 'recorder',
            title: 'Recorder',
            uuid: 'app-recorder',
            icon: loadIconAsBase64('recorder'),
            description: 'Record screen and audio'
        },
        {
            name: 'solitaire-frvr',
            title: 'Solitaire FRVR',
            uuid: 'app-solitaire-frvr',
            icon: loadIconAsBase64('solitaire-frvr'),
            description: 'Play Solitaire card game'
        },
        {
            name: 'calculator',
            title: 'WASM Calculator',
            uuid: 'app-calculator',
            icon: loadIconAsBase64('calculator'),
            description: 'Calculator powered by WASMER runtime',
            index_url: `${baseUrl}/apps/calculator/index.html`
        },
        {
            name: 'file-processor',
            title: 'File Processor',
            uuid: 'app-file-processor',
            icon: loadIconAsBase64('pdf'), // Using PDF icon as placeholder
            description: 'Text file processor powered by WASMER/WASI',
            index_url: `${baseUrl}/apps/file-processor/index.html`
        }
    ];
    // Return apps in the format expected by the frontend
    // Frontend expects: { recommended: [...], recent: [...] }
    res.json({
        recommended: apps, // All apps are recommended for now
        recent: [] // Recent apps will be populated as users launch apps
    });
}
/**
 * Disk free space (df)
 * GET /df
 */
export function handleDF(req, res) {
    const filesystem = req.app.locals.filesystem;
    // Return mock disk space info
    res.json({
        total: 10 * 1024 * 1024 * 1024, // 10GB
        used: 0,
        available: 10 * 1024 * 1024 * 1024,
        percentage: 0
    });
}
/**
 * Batch operations
 * POST /batch
 */
/**
 * Batch operations endpoint
 * POST /batch
 * Handles batch file uploads (multipart/form-data or JSON)
 *
 * The Puter SDK's fs.upload() sends files to this endpoint
 * Format can be:
 * 1. multipart/form-data with files
 * 2. JSON with operations array
 */
export async function handleBatch(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    logger.info('[Batch] Request received', {
        contentType: req.headers['content-type'],
        hasFilesystem: !!filesystem,
        wallet: req.user?.wallet_address
    });
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!filesystem) {
        logger.warn('[Batch] Filesystem not available - IPFS not initialized');
        res.status(500).json({
            error: 'Filesystem not available',
            message: 'IPFS is not initialized. File uploads require IPFS to be running.'
        });
        return;
    }
    try {
        const contentType = req.headers['content-type'] || '';
        const results = [];
        // Check if this is multipart/form-data (files uploaded via drag-drop)
        if (contentType.includes('multipart/form-data')) {
            // Multer middleware should have parsed this
            // Files should be in req.files (if using multer) or req.body
            const files = req.files || [];
            const formData = req.body || {};
            // Parse operation field (can be JSON string or array of JSON strings) - matching mock server logic
            let operations = [];
            if (formData.operation) {
                if (typeof formData.operation === 'string') {
                    try {
                        operations = JSON.parse(formData.operation);
                        if (!Array.isArray(operations)) {
                            operations = [operations];
                        }
                    }
                    catch (e) {
                        logger.warn('[Batch] Failed to parse operation:', e instanceof Error ? e.message : 'Unknown error');
                    }
                }
                else if (Array.isArray(formData.operation)) {
                    operations = formData.operation.map((op) => {
                        if (typeof op === 'string') {
                            try {
                                return JSON.parse(op);
                            }
                            catch {
                                return op;
                            }
                        }
                        return op;
                    });
                }
            }
            // Parse fileinfo if it's a JSON string - matching mock server logic
            let fileinfo = null;
            if (formData.fileinfo) {
                if (typeof formData.fileinfo === 'string') {
                    try {
                        fileinfo = JSON.parse(formData.fileinfo);
                    }
                    catch (e) {
                        logger.warn('[Batch] Failed to parse fileinfo:', e instanceof Error ? e.message : 'Unknown error');
                    }
                }
                else if (typeof formData.fileinfo === 'object') {
                    fileinfo = formData.fileinfo;
                }
            }
            // Convert ~ paths in operations (matching mock server behavior)
            if (req.user.wallet_address && operations.length > 0) {
                for (let i = 0; i < operations.length; i++) {
                    if (operations[i].path && typeof operations[i].path === 'string' && operations[i].path.startsWith('~/')) {
                        operations[i].path = operations[i].path.replace('~/', `/${req.user.wallet_address}/`);
                        logger.info(`[Batch] Converted operation[${i}].path: ${operations[i].path}`);
                    }
                }
            }
            logger.info('[Batch] Processing multipart upload', {
                filesCount: Array.isArray(files) ? files.length : (files ? 1 : 0),
                formFields: Object.keys(formData),
                operationsCount: operations.length,
                hasFileinfo: !!fileinfo
            });
            // Handle file uploads from req.files (multer format)
            if (Array.isArray(files) && files.length > 0) {
                for (const file of files) {
                    try {
                        // Determine target path from operation, fileinfo, or form data (matching mock server logic)
                        let destPath;
                        if (operations.length > 0 && operations[0].path) {
                            destPath = operations[0].path;
                        }
                        else if (fileinfo && fileinfo.path) {
                            destPath = fileinfo.path;
                        }
                        else if (fileinfo && fileinfo.parent) {
                            destPath = fileinfo.parent;
                        }
                        else {
                            destPath = formData.path || formData.dest_path || formData.destination || req.query.path;
                        }
                        if (!destPath) {
                            logger.error('[Batch] Missing destination path', {
                                formDataKeys: Object.keys(formData),
                                fileinfo,
                                operations,
                                filename: file.originalname || file.name
                            });
                            results.push({
                                success: false,
                                error: 'Missing destination path',
                                filename: file.originalname || file.name
                            });
                            continue;
                        }
                        // Handle ~ home directory (fallback if not already converted in operations)
                        if (destPath.startsWith('~/')) {
                            destPath = destPath.replace('~/', `/${req.user.wallet_address}/`);
                        }
                        else if (destPath.startsWith('~')) {
                            destPath = destPath.replace('~', `/${req.user.wallet_address}`);
                        }
                        else if (!destPath.startsWith('/')) {
                            // Relative path - default to Desktop for drag-drop uploads
                            destPath = `/${req.user.wallet_address}/Desktop/${destPath}`;
                        }
                        // Construct full file path
                        const fileName = file.originalname || file.name || 'untitled';
                        let filePath = destPath.endsWith('/')
                            ? `${destPath}${fileName}`
                            : `${destPath}/${fileName}`;
                        // Normalize the path (remove double slashes, etc.)
                        filePath = filePath.replace(/\/+/g, '/');
                        // Get file content - prioritize buffer, fallback to data
                        const fileContent = file.buffer || file.data;
                        const reportedSize = file.size || (fileContent ? fileContent.length : 0);
                        const actualSize = fileContent ? (Buffer.isBuffer(fileContent) ? fileContent.length : (fileContent instanceof Uint8Array ? fileContent.length : Buffer.byteLength(fileContent))) : 0;
                        logger.info('[Batch] Uploading file', {
                            originalDest: formData.path || formData.dest_path || formData.fileinfo || formData.operation || req.query.path,
                            resolvedDest: destPath,
                            fileName,
                            filePath,
                            reportedSize,
                            actualSize,
                            hasBuffer: !!file.buffer,
                            hasData: !!file.data,
                            bufferType: fileContent ? (Buffer.isBuffer(fileContent) ? 'Buffer' : (fileContent instanceof Uint8Array ? 'Uint8Array' : typeof fileContent)) : 'none',
                            mimeType: file.mimetype || file.type
                        });
                        // Validate file size matches
                        if (reportedSize > 0 && actualSize > 0 && reportedSize !== actualSize) {
                            logger.error('[Batch] File size mismatch', {
                                fileName,
                                reportedSize,
                                actualSize,
                                difference: reportedSize - actualSize
                            });
                            // Continue anyway - might be a metadata issue
                        }
                        if (!fileContent || actualSize === 0) {
                            logger.error('[Batch] No file content received', {
                                fileName,
                                hasBuffer: !!file.buffer,
                                hasData: !!file.data,
                                fileKeys: Object.keys(file)
                            });
                            results.push({
                                success: false,
                                error: 'No file content received',
                                filename: fileName
                            });
                            continue;
                        }
                        // Write file to filesystem
                        const metadata = await filesystem.writeFile(filePath, fileContent, req.user.wallet_address, {
                            mimeType: file.mimetype || file.type
                        });
                        // Extract parent directory path (dirpath) - CRITICAL for frontend
                        const pathParts = metadata.path.split('/').filter(p => p);
                        pathParts.pop(); // Remove filename
                        const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
                        const fileUid = `uuid-${metadata.path.replace(/\//g, '-')}`;
                        results.push({
                            success: true,
                            path: metadata.path,
                            result: {
                                path: metadata.path,
                                name: metadata.path.split('/').pop() || 'untitled',
                                size: metadata.size,
                                mime_type: metadata.mime_type
                            }
                        });
                        // Broadcast item.added event (frontend listens for this, not file:changed)
                        if (io) {
                            broadcastItemAdded(io, req.user.wallet_address, {
                                uid: fileUid,
                                uuid: fileUid,
                                name: metadata.path.split('/').pop() || 'untitled',
                                path: metadata.path,
                                dirpath: dirpath, // CRITICAL: Frontend uses this to find where to add the item
                                size: metadata.size,
                                type: metadata.mime_type || null,
                                mime_type: metadata.mime_type || undefined,
                                is_dir: false,
                                created: new Date(metadata.created_at).toISOString(),
                                modified: new Date(metadata.updated_at).toISOString(),
                                original_client_socket_id: null,
                                thumbnail: metadata.thumbnail || undefined // Include thumbnail if available
                            });
                        }
                        logger.info('[Batch] File uploaded successfully', { path: metadata.path, dirpath });
                    }
                    catch (error) {
                        logger.error('[Batch] Error uploading file:', error);
                        results.push({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            filename: file.originalname || file.name
                        });
                    }
                }
            }
            else if (req.file) {
                // Single file upload (not array)
                const file = req.file;
                try {
                    let destPath = formData.path || formData.dest_path || req.query.path;
                    if (!destPath) {
                        results.push({
                            success: false,
                            error: 'Missing destination path',
                            filename: file.originalname || file.name
                        });
                    }
                    else {
                        // Resolve path (handle ~ and relative paths)
                        if (destPath.startsWith('~')) {
                            destPath = destPath.replace('~', `/${req.user.wallet_address}`);
                        }
                        else if (!destPath.startsWith('/')) {
                            destPath = `/${req.user.wallet_address}/${destPath}`;
                        }
                        const fileName = file.originalname || file.name || 'untitled';
                        const filePath = destPath.endsWith('/')
                            ? `${destPath}${fileName}`
                            : `${destPath}/${fileName}`;
                        logger.info('[Batch] Uploading single file', {
                            originalDest: formData.path || formData.dest_path || req.query.path,
                            resolvedDest: destPath,
                            fileName,
                            filePath
                        });
                        const metadata = await filesystem.writeFile(filePath, file.buffer || file.data, req.user.wallet_address, {
                            mimeType: file.mimetype || file.type
                        });
                        // Extract parent directory path (dirpath) - CRITICAL for frontend
                        const pathParts = metadata.path.split('/').filter(p => p);
                        pathParts.pop(); // Remove filename
                        const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
                        const fileUid = `uuid-${metadata.path.replace(/\//g, '-')}`;
                        results.push({
                            success: true,
                            path: metadata.path,
                            result: {
                                path: metadata.path,
                                name: metadata.path.split('/').pop() || 'untitled',
                                size: metadata.size,
                                mime_type: metadata.mime_type
                            }
                        });
                        // Broadcast item.added event (frontend listens for this, not file:changed)
                        if (io) {
                            broadcastItemAdded(io, req.user.wallet_address, {
                                uid: fileUid,
                                uuid: fileUid,
                                name: metadata.path.split('/').pop() || 'untitled',
                                path: metadata.path,
                                dirpath: dirpath, // CRITICAL: Frontend uses this to find where to add the item
                                size: metadata.size,
                                type: metadata.mime_type || null,
                                mime_type: metadata.mime_type || undefined,
                                is_dir: false,
                                created: new Date(metadata.created_at).toISOString(),
                                modified: new Date(metadata.updated_at).toISOString(),
                                original_client_socket_id: null,
                                thumbnail: metadata.thumbnail || undefined // Include thumbnail if available
                            });
                        }
                    }
                }
                catch (error) {
                    logger.error('[Batch] Error uploading file:', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        errorCode: error?.code,
                        errorStack: error instanceof Error ? error.stack : undefined,
                        filename: file.originalname || file.name
                    });
                    results.push({
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        filename: file.originalname || file.name
                    });
                }
            }
            else {
                logger.warn('[Batch] Multipart request but no files found in req.files or req.file');
                // Try to parse from body if multer didn't process it
                // This might happen if multer middleware wasn't applied
                results.push({
                    success: false,
                    error: 'No files found in multipart request. Multer middleware may not be configured.'
                });
            }
        }
        else {
            // JSON batch operations
            const body = req.body;
            logger.info('[Batch] Processing JSON batch operations', {
                hasOperations: !!body.operations,
                operationsCount: Array.isArray(body.operations) ? body.operations.length : 0
            });
            if (body && Array.isArray(body.operations)) {
                for (const op of body.operations) {
                    try {
                        if (op.type === 'write' && op.path && op.content) {
                            const content = typeof op.content === 'string'
                                ? Buffer.from(op.content, op.encoding || 'utf8')
                                : Buffer.from(op.content);
                            const metadata = await filesystem.writeFile(op.path, content, req.user.wallet_address, {
                                mimeType: op.mimeType
                            });
                            results.push({
                                success: true,
                                path: metadata.path,
                                result: metadata
                            });
                            if (io) {
                                broadcastFileChange(io, {
                                    path: metadata.path,
                                    wallet_address: req.user.wallet_address,
                                    action: 'created',
                                    metadata: {
                                        size: metadata.size,
                                        mime_type: metadata.mime_type || undefined,
                                        is_dir: false
                                    }
                                });
                            }
                        }
                        else {
                            results.push({
                                success: false,
                                error: `Unknown operation type: ${op.type || 'missing'}`
                            });
                        }
                    }
                    catch (error) {
                        results.push({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            path: op.path
                        });
                    }
                }
            }
            else {
                logger.warn('[Batch] JSON request but no operations array found');
                // Empty batch - return empty results
            }
        }
        logger.info('[Batch] Batch operation completed', {
            resultsCount: results.length,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length
        });
        res.json({ results });
    }
    catch (error) {
        logger.error('[Batch] Error processing batch operations:', error);
        res.status(500).json({
            error: 'Failed to process batch operations',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
/**
 * Cache timestamp endpoint (used by Puter SDK)
 * GET /cache/last-change-timestamp
 * No auth required - SDK calls this during initialization
 */
export function handleCacheTimestamp(req, res) {
    // Return current timestamp (SDK expects this format)
    res.json({ timestamp: Date.now() });
}
/**
 * Get storage statistics
 * GET /api/stats
 * Returns storage usage, file counts, etc.
 */
export function handleStats(req, res) {
    const db = req.app.locals.db;
    const filesystem = req.app.locals.filesystem;
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const walletAddress = req.user.wallet_address;
        // Dynamic storage limit: check database setting first, then config, then auto-detect
        let storageLimit;
        const dbLimit = db?.getSetting('storage_limit');
        const configLimit = dbLimit || global.pc2Config?.resources?.storage?.limit;
        if (configLimit === 'auto' || !configLimit) {
            // Auto-detect: use 80% of available disk space, max 500GB
            try {
                const fs = require('fs');
                const os = require('os');
                // Get disk stats using sync method
                const dataPath = process.cwd();
                const stats = fs.statfsSync ? fs.statfsSync(dataPath) : null;
                if (stats) {
                    const totalDiskBytes = stats.blocks * stats.bsize;
                    const reserveBytes = 10 * 1024 * 1024 * 1024; // Reserve 10GB free
                    storageLimit = Math.min(Math.floor((totalDiskBytes - reserveBytes) * 0.8), 500 * 1024 * 1024 * 1024 // Max 500GB
                    );
                    // Ensure minimum 1GB
                    storageLimit = Math.max(storageLimit, 1 * 1024 * 1024 * 1024);
                }
                else {
                    // Fallback for older Node.js versions
                    storageLimit = 100 * 1024 * 1024 * 1024; // 100GB default
                }
            }
            catch {
                // Fallback to 100GB if disk detection fails
                storageLimit = 100 * 1024 * 1024 * 1024;
            }
        }
        else if (configLimit === 'unlimited') {
            storageLimit = Number.MAX_SAFE_INTEGER;
        }
        else if (typeof configLimit === 'string') {
            // Parse string like "50GB", "100GB"
            const match = configLimit.match(/^(\d+)(GB|MB|TB)$/i);
            if (match) {
                const value = parseInt(match[1], 10);
                const unit = match[2].toUpperCase();
                const multipliers = { 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024, 'TB': 1024 * 1024 * 1024 * 1024 };
                storageLimit = value * (multipliers[unit] || 1024 * 1024 * 1024);
            }
            else {
                storageLimit = 100 * 1024 * 1024 * 1024; // Default 100GB
            }
        }
        else {
            storageLimit = configLimit;
        }
        // If database doesn't exist, return empty stats
        if (!db) {
            res.json({
                storageUsed: 0,
                storageLimit: storageLimit,
                storage: {
                    used: 0,
                    limit: storageLimit,
                    available: storageLimit
                },
                filesCount: 0,
                files: 0,
                encryptedCount: 0,
                directories: 0
            });
            return;
        }
        // Count files and directories from database
        // Query all files for this user (using root path to get all files)
        const allFiles = db.listFiles('/', walletAddress);
        let totalSize = 0;
        let fileCount = 0;
        let directoryCount = 0;
        for (const file of allFiles) {
            if (file.is_dir) {
                directoryCount++;
            }
            else {
                fileCount++;
                totalSize += file.size || 0;
            }
        }
        // Return in format expected by Settings page
        res.json({
            storageUsed: totalSize,
            storageLimit: storageLimit,
            storage: {
                used: totalSize,
                limit: storageLimit,
                available: storageLimit - totalSize
            },
            filesCount: fileCount,
            files: fileCount,
            encryptedCount: 0, // Encryption not implemented yet
            directories: directoryCount
        });
    }
    catch (error) {
        console.error('[handleStats] Error:', error);
        res.status(500).json({
            error: 'Failed to get storage stats',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
//# sourceMappingURL=info.js.map