import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/**
 * Connectivity, and the moment it comes back.
 *
 * Two different questions, and conflating them is the usual bug:
 *
 *  - **Is there a connection right now?** Drives the offline banner and
 *    whether a "save for offline" button is worth offering.
 *  - **Did a connection just return?** Drives a refetch. A library that
 *    silently stays stale after the train leaves the tunnel is the thing
 *    that makes an app feel broken, and a parent should not have to
 *    pull-to-refresh to discover that.
 *
 * `isInternetReachable` is deliberately preferred over `isConnected`:
 * a phone attached to a wifi network with no route to anywhere is
 * "connected" and useless.
 */
export interface NetworkStatus {
  online: boolean;
  /** Increments each time the connection returns after being lost. */
  reconnectedAt: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [reconnectedAt, setReconnectedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let wasOnline = true;

    const apply = (state: Network.NetworkState) => {
      if (cancelled) return;
      // `isInternetReachable` is undefined on some platforms and while the
      // first probe is in flight; falling back to `isConnected` is better
      // than declaring the app offline on launch.
      const next = state.isInternetReachable ?? state.isConnected ?? true;
      setOnline(next);
      if (next && !wasOnline) setReconnectedAt(Date.now());
      wasOnline = next;
    };

    void Network.getNetworkStateAsync().then(apply).catch(() => undefined);

    const subscription = Network.addNetworkStateListener(apply);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { online, reconnectedAt };
}
