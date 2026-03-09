import styles from './LoadingSkeleton.module.css';

interface LoadingSkeletonProps {
  variant?: 'page' | 'cards' | 'detail';
}

export function LoadingSkeleton({ variant = 'page' }: LoadingSkeletonProps) {
  if (variant === 'cards') {
    return (
      <div className={styles.skeleton} aria-busy="true">
        <span className={styles.srOnly} aria-live="polite">Loading</span>
        <div className={styles.cards}>
          <div className={`${styles.block} ${styles.card}`} />
          <div className={`${styles.block} ${styles.card}`} />
          <div className={`${styles.block} ${styles.card}`} />
          <div className={`${styles.block} ${styles.card}`} />
        </div>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={styles.skeleton} aria-busy="true">
        <span className={styles.srOnly} aria-live="polite">Loading</span>
        <div className={styles.detail}>
          <div className={`${styles.block} ${styles.detailHeader}`} />
          <div className={`${styles.block} ${styles.detailMeta}`} />
          <div className={`${styles.block} ${styles.detailPanel}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.skeleton} aria-busy="true">
      <span className={styles.srOnly} aria-live="polite">Loading</span>
      <div className={styles.page}>
        <div className={`${styles.block} ${styles.pageHeader}`} />
        <div className={`${styles.block} ${styles.pageSubheader}`} />
        <div className={`${styles.block} ${styles.pageBlock}`} />
        <div className={`${styles.block} ${styles.pageBlock}`} />
        <div className={`${styles.block} ${styles.pageBlock}`} />
      </div>
    </div>
  );
}
