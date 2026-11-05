import { useOutletContext } from 'react-router-dom';

import type { Center, Membership } from '../services/carmoData';
import type { CarmoRole } from '../domain/study';

export type CarmoSession = {
  userId: string;
  role: CarmoRole;
  fullName: string | null;
  centers: Center[];
  memberships: Membership[];
  dataMode: string | null;
  targetSampleSize: number;
};

export function useCarmoSession(): CarmoSession {
  return useOutletContext<CarmoSession>();
}
