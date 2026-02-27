import ParticleConnectkit from './contexts/connectkit';
import ParticleNetworkProvider from './contexts/ParticleNetworkContext';
const ConnectorProvider = ({ children }) => (<ParticleConnectkit>
    <ParticleNetworkProvider>
      {children}
    </ParticleNetworkProvider>
  </ParticleConnectkit>);
ConnectorProvider.displayName = 'ParticleNetworkProvider';
export default ConnectorProvider;
//# sourceMappingURL=Provider.js.map