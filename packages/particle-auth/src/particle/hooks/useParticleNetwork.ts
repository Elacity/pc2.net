import { useContext } from 'react';
import { ParticleNetworkContext } from '../contexts/ParticleNetworkContext';

export const useParticleNetwork = () => useContext(ParticleNetworkContext);