import Link from "next/link";
import styles from "./site-legal-footer.module.css";

export default function SiteLegalFooter() {
  const icpNumber = process.env.SITE_ICP_NUMBER?.trim();
  const policeNumber = process.env.SITE_POLICE_NUMBER?.trim();
  const policeUrl = process.env.SITE_POLICE_RECORD_URL?.trim();
  return (
    <footer className={styles.footer}>
      <div>
        <b>GeoAI Teacher 21.7 · 演示教学</b>
        <span>独立部署的教学辅助工具；AI内容须由教师核查。</span>
      </div>
      <nav aria-label="合规与隐私说明">
        <Link href="/reports">投诉举报与申诉</Link>
        <Link href="/legal/privacy">隐私说明</Link>
        <Link href="/legal/terms">使用说明</Link>
        <Link href="/legal/ai-notice">AI生成提示</Link>
        {icpNumber ? <a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">{icpNumber}</a> : <span>ICP备案号待填写</span>}
        {policeNumber && policeUrl ? <a href={policeUrl} rel="noreferrer" target="_blank">{policeNumber}</a> : null}
      </nav>
    </footer>
  );
}
