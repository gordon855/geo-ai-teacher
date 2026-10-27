import "server-only";

import ExcelJS from "exceljs";
import type { RosterRow } from "./types";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_STUDENTS = 500;
const STUDENT_NUMBER_HEADERS = new Set(["学号", "studentno", "studentnumber", "studentid"]);
const NAME_HEADERS = new Set(["姓名", "学生姓名", "name", "studentname"]);
const CLASS_HEADERS = new Set(["班级", "classname", "class"]);

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/gu, "");
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\t")) {
      row.push(field.trim());
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeRows(rows: string[][]) {
  if (rows.length < 2) throw new Error("名单中没有学生数据。");
  const headers = rows[0].map((value) => normalizedHeader(value.replace(/^\uFEFF/u, "")));
  const studentNoIndex = headers.findIndex((value) => STUDENT_NUMBER_HEADERS.has(value));
  const nameIndex = headers.findIndex((value) => NAME_HEADERS.has(value));
  const classIndex = headers.findIndex((value) => CLASS_HEADERS.has(value));
  if (studentNoIndex < 0 || nameIndex < 0) {
    throw new Error("名单必须包含“学号”和“姓名”两列。");
  }

  const seen = new Set<string>();
  const result: RosterRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const studentNo = (rows[index][studentNoIndex] || "").trim();
    const name = (rows[index][nameIndex] || "").trim();
    const className = classIndex >= 0 ? (rows[index][classIndex] || "").trim() : "";
    if (!studentNo && !name) continue;
    if (!/^[A-Za-z0-9_-]{4,32}$/u.test(studentNo)) {
      throw new Error("第" + (index + 1) + "行学号格式无效，只能使用4—32位字母、数字、下划线或连字符。");
    }
    if (name.length < 1 || name.length > 40 || /[<>\r\n]/u.test(name)) {
      throw new Error("第" + (index + 1) + "行姓名格式无效。");
    }
    const key = studentNo.toLowerCase();
    if (seen.has(key)) throw new Error("名单中存在重复学号：" + studentNo);
    seen.add(key);
    result.push({ studentNo, name, className: className.slice(0, 60) || undefined });
  }
  if (!result.length) throw new Error("名单中没有有效学生。");
  if (result.length > MAX_STUDENTS) throw new Error("单次最多导入" + MAX_STUDENTS + "名学生。");
  return result;
}

async function readXlsx(file: File) {
  const workbook = new ExcelJS.Workbook();
  const input = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(input);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Excel文件中没有工作表。");
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: string[] = [];
    const count = Math.max(excelRow.cellCount, 3);
    for (let index = 1; index <= count; index += 1) {
      values.push(excelRow.getCell(index).text.trim());
    }
    rows.push(values);
  });
  return normalizeRows(rows);
}

export async function parseRosterFile(file: File) {
  if (file.size <= 0) throw new Error("请选择名单文件。");
  if (file.size > MAX_FILE_SIZE) throw new Error("名单文件不能超过3MB。");
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx")) return readXlsx(file);
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
    return normalizeRows(parseCsvRows(await file.text()));
  }
  throw new Error("仅支持.xlsx、.csv或.tsv名单文件；旧版.xls请先另存为.xlsx。");
}

function escapeCsvCell(value: string) {
  const protectedValue = /^[=+@-]/u.test(value) ? "'" + value : value;
  return '"' + protectedValue.replace(/"/gu, '""') + '"';
}

export function credentialsToCsv(
  rows: Array<{ studentNo: string; name: string; temporaryPassword: string }>,
) {
  const lines = [
    ["学号", "姓名", "临时密码", "首次登录"].map(escapeCsvCell).join(","),
    ...rows.map((row) => [
      row.studentNo,
      row.name,
      row.temporaryPassword,
      "必须修改密码",
    ].map(escapeCsvCell).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

export const rosterInternalsForTests = {
  normalizeRows,
  parseCsvRows,
};
