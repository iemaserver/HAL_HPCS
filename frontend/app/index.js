import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function Splash() {
  const router = useRouter();
  useEffect(() => { router.replace('/airframe'); }, [router]);
  return null;
}
