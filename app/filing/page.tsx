import LegalPage from "@/components/legal-page";
import styles from "@/components/legal-page.module.css";

export default function FilingPage() {
  const rootDomain = process.env.ROOT_DOMAIN?.trim() || "localhost";
  const wwwDomain = process.env.WWW_DOMAIN?.trim() || `www.${rootDomain}`;
  const icpNumber = process.env.SITE_ICP_NUMBER?.trim();
  return (
    <LegalPage eyebrow="ICP FILING" title={icpNumber ? "网站备案信息" : "网站正在完成备案准备"} intro="经纬拾光为个人、非经营性的课程学习辅助站。">
      <p className={styles.notice}>{icpNumber ? `本网站已配置ICP备案号：${icpNumber}` : "正式ICP备案与HTTPS配置完成前，学生登录和AI课程服务不会对公网开放。"}</p>
      <h2>{icpNumber ? "正式域名" : "计划域名"}</h2><p>{rootDomain} / {wwwDomain}</p>
      {icpNumber ? <><h2>备案查询</h2><p><a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">工业和信息化部政务服务平台备案系统</a></p></> : null}
      <h2>网站性质</h2><p>个人建设、非学校官方网站、不招生、不收费、不提供学历或成绩证明。</p>
    </LegalPage>
  );
}
