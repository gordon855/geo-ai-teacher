"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function StudentPortal() {
  const [inApp, setInApp] = useState(false);
  const [no, setNo] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const login = (event: FormEvent) => {
    event.preventDefault();
    if (no.trim().length < 6 || pw.length < 6) {
      setError("请输入完整学号和不少于6位的密码。当前页面使用演示数据，不会保存输入内容。");
      return;
    }
    setInApp(true);
    setError("");
  };

  if (inApp) {
    return (
      <main className="student-home">
        <header className="student-top">
          <Link className="login-brand" href="/">
            <i>测</i>
            <span><b>测绘专业外语</b><em>AI STUDENT SPACE</em></span>
          </Link>
          <nav>
            <a className="active" href="#home">学习首页</a>
            <a href="#course">课程学习</a>
            <a href="#homework">我的作业</a>
            <a href="#grades">成绩反馈</a>
          </nav>
          <div className="student-user">
            <span>李思远</span><i>李</i><button onClick={() => setInApp(false)}>退出</button>
          </div>
        </header>

        <div className="student-content">
          <section className="student-welcome">
            <div>
              <p>WEEK 11 · LESSON 08</p>
              <h1>晚上好，李思远</h1>
              <span>今天继续学习GNSS英语。AI教师已经准备好上一课复习与本节重点。</span>
            </div>
            <div className="progress">
              <span>课程进度</span><b>8 / 12</b><i><em /></i>
            </div>
          </section>

          <section className="student-hero">
            <div className="student-teacher">
              <img alt="测绘专业外语AI教师" src="/images/digital-teacher-step7-trimmed.svg" />
            </div>
            <div className="student-lesson">
              <span>本节课 · GNSS ENGLISH</span>
              <h2>全球导航卫星系统与静态测量</h2>
              <p>Unit 16—22 · 2学时 · 第11教学周</p>
              <div className="task-row">
                <article><i>复</i><div><b>上一课复习</b><span>Unit 15核心词汇与句式</span></div><em>6题</em></article>
                <article><i>学</i><div><b>本节重点</b><span>静态与快速静态GPS测量</span></div><em>12项</em></article>
              </div>
              <button>进入AI学习空间 →</button>
            </div>
          </section>

          <section className="student-metrics">
            <article><span>出勤率</span><b>100%</b><em>本学期8/8</em></article>
            <article><span>作业完成</span><b>2/3</b><em>1项待提交</em></article>
            <article><span>课堂表现</span><b>9.2</b><em>教师已确认</em></article>
            <article><span>当前总评</span><b>92.0</b><em>班级第2</em></article>
          </section>

          <section className="student-lower">
            <article className="student-panel">
              <header>
                <div><span>UPCOMING</span><h3>待办学习任务</h3></div>
                <button>查看全部</button>
              </header>
              <div className="task-list">
                <div><span>作业</span><div><b>GNSS专业段落翻译与机器翻译纠错</b><p>截止：11月22日 23:59 · 支持Word、PDF或在线作答</p></div><em>3天</em></div>
                <div><span>复习</span><div><b>Unit 15 重点词汇</b><p>伪距、星历、载波相位、多路径效应</p></div><em>6项</em></div>
                <div><span>测试</span><div><b>第7次课随堂测试</b><p>5道随机题 · 最高成绩计入学习记录</p></div><em>未完成</em></div>
              </div>
            </article>

            <article className="student-panel">
              <header>
                <div><span>AI FEEDBACK</span><h3>最近一次作业反馈</h3></div>
                <b>9.5 / 10</b>
              </header>
              <div className="feedback">
                <p>专业术语使用准确，能够区分 <mark>accuracy</mark> 与 <mark>precision</mark>。第二段中“can be determined”应保留被动含义，并根据中文习惯自然表达。</p>
                <div><span>术语准确性 优秀</span><span>语法表达 良好</span><span>翻译自然度 优秀</span></div>
                <button>查看逐句批注 →</button>
              </div>
            </article>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="student-login">
      <div className="student-bg" />
      <section className="login-show">
        <Link className="login-brand" href="/">
          <i>测</i>
          <span><b>测绘专业外语AI虚拟教师</b><em>SURVEYING PROFESSIONAL ENGLISH</em></span>
        </Link>
        <div className="login-copy">
          <p>AI-POWERED COURSE PLATFORM</p>
          <h1>让专业英语<br /><mark>看得懂、说得准、用得上</mark></h1>
          <span>基于教材原文、课程大纲和教学进度，为每位学生提供可追溯的专业词汇、句式、翻译与测绘原理辅导。</span>
          <div className="feature-row">
            <div><b>813</b><span>课程知识块<br />引用可追溯</span></div>
            <div><b>54</b><span>教材Unit<br />原文已核验</span></div>
            <div><b>AI</b><span>个性辅导<br />全天候可用</span></div>
          </div>
        </div>
        <div className="login-teacher">
          <img alt="测绘专业外语AI教师" src="/images/digital-teacher-step7-trimmed.svg" />
        </div>
      </section>

      <section className="login-form-side">
        <Link className="back" href="/">← 返回AI教师问答</Link>
        <div className="login-card">
          <span>STUDENT LOGIN</span>
          <h2>学生登录</h2>
          <p>使用学校名单中的学号和个人密码进入课程空间</p>
          <form onSubmit={login}>
            <label>
              <span>学号</span>
              <div><i>学</i><input autoComplete="username" placeholder="请输入学号" value={no} onChange={(event) => setNo(event.target.value)} /></div>
            </label>
            <label>
              <span>密码</span>
              <div><i>密</i><input autoComplete="current-password" placeholder="请输入密码" type="password" value={pw} onChange={(event) => setPw(event.target.value)} /></div>
            </label>
            <div className="login-options">
              <label><input type="checkbox" />记住学号</label>
              <button type="button">忘记密码？</button>
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="login-submit">登录课程空间 →</button>
          </form>
          <div className="divider">当前为第8A步界面演示</div>
          <button className="demo-submit" onClick={() => setInApp(true)}>查看演示学生空间</button>
          <p className="first-note"><i>!</i>正式版首次登录将使用导入名单时生成的临时密码，并强制设置个人新密码。</p>
        </div>
      </section>
    </main>
  );
}
