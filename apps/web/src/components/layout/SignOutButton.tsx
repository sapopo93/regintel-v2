'use client';

import { useClerk } from '@clerk/nextjs';
import styles from './Sidebar.module.css';

export default function SignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      className={styles.signOutButton}
      onClick={() => signOut({ redirectUrl: '/sign-in' })}
      data-testid="sidebar-sign-out"
    >
      Sign Out
    </button>
  );
}
