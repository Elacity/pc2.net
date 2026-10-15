/**
 * Decide whether POST /api/setup/complete may run.
 *
 * Returns null when a first-run registration may proceed, otherwise a
 * user-facing reason. Once a node is set up or owned, only the owner's
 * desktop session may change it, never the public setup page.
 */

export interface SetupCompleteState {
    setupMarkerExists: boolean;
    ownerWallet: string | null | undefined;
    storedUsername: string | null | undefined;
    requestedUsername: string;
}

export function setupCompleteBlockReason (state: SetupCompleteState): string | null {
    if ( state.setupMarkerExists ) {
        return 'Setup is already complete on this node.';
    }
    if ( state.ownerWallet ) {
        return 'This node already has an owner.';
    }
    // A same-name retry is allowed: the wizard times out after 30s and the
    // first attempt may have registered the name before failing.
    if ( state.storedUsername &&
        state.storedUsername.trim().toLowerCase() !== state.requestedUsername.trim().toLowerCase() ) {
        return 'This node already has a username.';
    }
    return null;
}
