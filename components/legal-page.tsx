import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal-page.module.css";

export default function LegalPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <article className={styles.card}>
        <Link className={styles.back} href="/">← 返回学习首页</Link>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        <div className={styles.content}>{children}</div>
      </article>
    </main>
  );
}

