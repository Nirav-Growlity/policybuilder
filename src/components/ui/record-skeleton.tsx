import styles from "./record-skeleton.module.css";

/** Decorative initial-record placeholders; callers retain their truthful loading announcement. */
export function RecordSkeleton() {
  return (
    <div className={styles.records} aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.row}>
          <div className={styles.identity} />
          <div className={styles.copy}><div className={styles.title} /><div className={styles.detail} /></div>
          <div className={styles.action} />
        </div>
      ))}
    </div>
  );
}
