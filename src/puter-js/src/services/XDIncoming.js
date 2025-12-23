import putility from '@heyputer/putility';

const TeePromise = putility.libs.promise.TeePromise;

/**
 * Manages message events from the window object.
 */
export class XDIncomingService extends putility.concepts.Service {
    _construct () {
        this.filter_listeners_ = [];
        this.tagged_listeners_ = {};
    }

    _init () {
        globalThis.addEventListener('message', async event => {
            // Debug: Log puter-ipc messages
            if (event.data && event.data.$ === 'puter-ipc') {
                console.log('[XDIncoming]: 📨 Message received, filter_listeners_ count:', this.filter_listeners_.length);
            }
            
            for ( const fn of this.filter_listeners_ ) {
                // Debug: Log when calling filter listener
                if (event.data && event.data.$ === 'puter-ipc') {
                    console.log('[XDIncoming]: 🔄 Calling filter listener:', fn);
                }
                const tp = new TeePromise();
                fn(event, tp);
                const result = await tp;
                if (event.data && event.data.$ === 'puter-ipc') {
                    console.log('[XDIncoming]: ✅ Filter listener returned:', result);
                }
                if ( result ) {
                    if (event.data && event.data.$ === 'puter-ipc') {
                        console.log('[XDIncoming]: 🛑 Filter listener resolved true, stopping message processing');
                    }
                    return;
                }
            }

            const data = event.data;
            if ( ! data ) return;
            const tag = data.$;
            if ( ! tag ) return;
            if ( ! this.tagged_listeners_[tag] ) return;

            for ( const fn of this.tagged_listeners_[tag] ) {
                fn({ data, source: event.source });
            }
        });
    }

    register_filter_listener (fn) {
        this.filter_listeners_.push(fn);
    }

    register_tagged_listener (tag, fn) {
        if ( ! this.tagged_listeners_[tag] ) {
            this.tagged_listeners_[tag] = [];
        }
        this.tagged_listeners_[tag].push(fn);
    }
}
