import type {
  FC, 
  PropsWithChildren,
} from 'react';
import ParticleConnectkit from './contexts/connectkit';
import ParticleNetworkProvider from './contexts/ParticleNetworkContext';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ConnectorProviderContextProps {}

const ConnectorProvider: FC<PropsWithChildren<ConnectorProviderContextProps>> = ({ children }) => (
  <ParticleConnectkit>
    <ParticleNetworkProvider>
      {children}
    </ParticleNetworkProvider>
  </ParticleConnectkit>
);

ConnectorProvider.displayName = 'ParticleNetworkProvider';

export default ConnectorProvider;
